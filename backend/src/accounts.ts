import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import type { Server } from "socket.io";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { allowRoles, requireAuth, signSession } from "./auth.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { audit, fail, route, transaction } from "./http.js";
import type { PoolClient } from "pg";

const staffRole = z.enum(["ADMIN", "FACULTY", "TRANSPORT"]);
const emailSchema = z.string().trim().email().toLowerCase();
const passwordSchema = z.string().min(10).max(128);
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const mailConfigured = () =>
  Boolean(config.RESEND_API_KEY && config.AUTH_EMAIL_FROM);
const resetLink = (token: string) => {
  const url = new URL("/reset-password", config.AUTH_APP_URL);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
};

async function issueReset(c: PoolClient, userId: string, requestId: string) {
  const token = randomBytes(32).toString("hex");
  await c.query(
    "UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
    [userId],
  );
  await c.query(
    "INSERT INTO password_reset_tokens(user_id,request_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '20 minutes')",
    [userId, requestId, tokenHash(token)],
  );
  return resetLink(token);
}

export function accountsRouter(io: Server) {
  const r = Router();
  r.use("/access", requireAuth, allowRoles("ADMIN"));
  r.use(
    "/auth/forgot-password",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  r.get("/auth/recovery-options", (_req, res) =>
    res.json({ mode: mailConfigured() ? "email" : "administrator" }),
  );
  r.get("/access/status", (_req, res) =>
    res.json({ emailConfigured: mailConfigured() }),
  );
  r.get(
    "/access/invitations",
    route(async (_req, res) =>
      res.json({
        invitations: (
          await pool.query(
            "SELECT id,email,role,expires_at,used_at,revoked_at,created_at FROM staff_invitations ORDER BY created_at DESC LIMIT 100",
          )
        ).rows,
      }),
    ),
  );
  r.post(
    "/access/invitations",
    route(async (req, res) => {
      const input = z
        .object({
          email: emailSchema,
          role: staffRole,
          expiresHours: z.number().int().min(1).max(168).default(48),
        })
        .parse(req.body);
      const code = randomBytes(32).toString("hex");
      const invitation = await transaction(async (c) => {
        if (
          (await c.query("SELECT id FROM users WHERE email=$1", [input.email]))
            .rowCount
        )
          fail(
            409,
            "An account already exists for this email. Use password recovery.",
          );
        const created = (
          await c.query(
            "INSERT INTO staff_invitations(email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 hour') RETURNING id,email,role,expires_at",
            [
              input.email,
              input.role,
              tokenHash(code),
              req.user!.id,
              input.expiresHours,
            ],
          )
        ).rows[0];
        await audit(
          c,
          req.user!.id,
          "CREATE_STAFF_INVITATION",
          "staff_invitation",
          created.id,
          null,
          { email: input.email, role: input.role },
        );
        return created;
      });
      res.status(201).json({ invitation, code });
    }),
  );
  r.patch(
    "/access/invitations/:id/revoke",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const count = await transaction(async (c) => {
        const updated = await c.query(
          "UPDATE staff_invitations SET revoked_at=now() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id",
          [id],
        );
        if (updated.rowCount)
          await audit(
            c,
            req.user!.id,
            "REVOKE_STAFF_INVITATION",
            "staff_invitation",
            id,
            null,
            {},
          );
        return updated.rowCount;
      });
      if (!count)
        fail(409, "Invitation is already used, revoked or unavailable");
      res.json({ revoked: true });
    }),
  );
  r.post(
    ["/auth/staff-signup", "/auth/signup"],
    route(async (req, res) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(80),
          email: emailSchema,
          password: passwordSchema,
          role: staffRole,
          invitationCode: z.string().trim().max(128).default(""),
        })
        .parse(req.body);
      if (!/^[a-f0-9]{64}$/.test(input.invitationCode))
        fail(
          403,
          "Enter the invitation code issued for your email and selected role.",
        );
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await transaction(async (c) => {
        const invite = (
          await c.query(
            "SELECT * FROM staff_invitations WHERE token_hash=$1 AND email=$2 AND role=$3 AND expires_at>now() AND used_at IS NULL AND revoked_at IS NULL FOR UPDATE",
            [tokenHash(input.invitationCode), input.email, input.role],
          )
        ).rows[0];
        if (!invite)
          fail(
            403,
            "Invitation is invalid, expired, used, or issued for another email or role.",
          );
        if (
          (await c.query("SELECT id FROM users WHERE email=$1", [input.email]))
            .rowCount
        )
          fail(
            409,
            "This email already has an account. Sign in or use password recovery.",
          );
        const created = (
          await c.query(
            "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role",
            [input.name, input.email, passwordHash, input.role],
          )
        ).rows[0];
        await c.query(
          "UPDATE staff_invitations SET used_at=now(),used_by=$2 WHERE id=$1",
          [invite.id, created.id],
        );
        await audit(c, created.id, "REGISTER_STAFF", "user", created.id, null, {
          role: created.role,
          invitedBy: invite.created_by,
        });
        return created;
      });
      io.to("operations").emit("user:created", { role: user.role });
      res.status(201).json({ user, token: signSession(user) });
    }),
  );
  r.post(
    "/auth/forgot-password",
    route(async (req, res) => {
      const input = z
        .object({
          email: emailSchema,
          role: z.enum(["ADMIN", "FACULTY", "TRANSPORT", "STUDENT", "PARENT"]),
        })
        .parse(req.body);
      const recovery = await transaction(async (c) => {
        const user = (
          await c.query(
            "SELECT id,email FROM users WHERE email=$1 AND role=$2 FOR UPDATE",
            [input.email, input.role],
          )
        ).rows[0];
        if (!user) return null;
        const request = (
          await c.query(
            "INSERT INTO account_recovery_requests(user_id) VALUES($1) ON CONFLICT(user_id) WHERE status IN ('PENDING','LINK_ISSUED') DO UPDATE SET requested_at=now() RETURNING id,handled_by,status",
            [user.id],
          )
        ).rows[0];
        // An unauthenticated repeat request must not invalidate an administrator-issued link.
        if (!mailConfigured() || request.handled_by) return null;
        const link = await issueReset(c, user.id, request.id);
        await c.query(
          "UPDATE account_recovery_requests SET status='LINK_ISSUED',delivery_status='EMAIL_PENDING' WHERE id=$1",
          [request.id],
        );
        return { email: user.email, link, id: request.id };
      });
      if (recovery) {
        let delivered = false;
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + config.RESEND_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: config.AUTH_EMAIL_FROM,
              to: [recovery.email],
              subject: "Reset your TransitSync password",
              text:
                "A password reset was requested for your campus account. This link expires in 20 minutes and can be used once:\n\n" +
                recovery.link +
                "\n\nIf you did not request this, ignore this message. Your password has not changed.",
            }),
            signal: AbortSignal.timeout(10000),
          });
          delivered = response.ok;
        } catch {
          /* Never log email credentials or reset links. */
        }
        await pool.query(
          "UPDATE account_recovery_requests SET delivery_status=$2 WHERE id=$1",
          [recovery.id, delivered ? "EMAIL_SENT" : "ADMIN_REQUIRED"],
        );
      }
      res.json({
        message: mailConfigured()
          ? "If an account matches, check its email for a reset link. If no message arrives, contact your campus administrator."
          : "If an account matches, a recovery request is available to your campus administrator. Contact them to verify your identity and receive a single-use reset link.",
      });
    }),
  );
  r.get(
    "/access/recovery",
    route(async (_req, res) =>
      res.json({
        requests: (
          await pool.query(
            "SELECT r.id,r.status,r.requested_at,r.delivery_status,u.id AS user_id,u.name,u.email,u.role FROM account_recovery_requests r JOIN users u ON u.id=r.user_id WHERE r.status<>'COMPLETED' ORDER BY r.requested_at DESC LIMIT 100",
          )
        ).rows,
      }),
    ),
  );
  r.post(
    "/access/recovery/:id/link",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      z.object({ identityConfirmed: z.literal(true) }).parse(req.body);
      const link = await transaction(async (c) => {
        const owner = (
          await c.query(
            "SELECT user_id FROM account_recovery_requests WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (!owner) fail(404, "Recovery request unavailable");
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          owner.user_id,
        ]);
        const request = (
          await c.query(
            "SELECT * FROM account_recovery_requests WHERE id=$1 AND status<>'COMPLETED' FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!request) fail(404, "Recovery request unavailable");
        const url = await issueReset(c, request.user_id, id);
        await c.query(
          "UPDATE account_recovery_requests SET status='LINK_ISSUED',handled_by=$2,handled_at=now(),delivery_status='ADMIN_VERIFIED' WHERE id=$1",
          [id, req.user!.id],
        );
        await audit(
          c,
          req.user!.id,
          "ISSUE_PASSWORD_RESET",
          "user",
          request.user_id,
          null,
          { identityConfirmed: true },
        );
        return url;
      });
      res.json({ link, expiresMinutes: 20 });
    }),
  );
  r.post(
    "/auth/reset-password",
    route(async (req, res) => {
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: passwordSchema,
        })
        .parse(req.body);
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userId = await transaction(async (c) => {
        // Lock users first in every issuance/reset path to serialize simultaneous resets.
        const candidate = (
          await c.query(
            "SELECT user_id FROM password_reset_tokens WHERE token_hash=$1",
            [tokenHash(input.token)],
          )
        ).rows[0];
        if (!candidate)
          fail(400, "Reset link is invalid or expired. Request a new link.");
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          candidate.user_id,
        ]);
        const reset = (
          await c.query(
            "SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [tokenHash(input.token)],
          )
        ).rows[0];
        if (!reset)
          fail(400, "Reset link is invalid, expired or already used.");
        await c.query(
          "UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1",
          [reset.user_id, passwordHash],
        );
        await c.query(
          "UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [reset.user_id],
        );
        await c.query(
          "UPDATE account_recovery_requests SET status='COMPLETED',handled_at=now() WHERE user_id=$1 AND status<>'COMPLETED'",
          [reset.user_id],
        );
        await c.query("DELETE FROM push_subscriptions WHERE user_id=$1", [
          reset.user_id,
        ]);
        await audit(
          c,
          reset.user_id,
          "RESET_PASSWORD",
          "user",
          reset.user_id,
          null,
          { sessionsRevoked: true },
        );
        return reset.user_id;
      });
      io.to("user:" + userId).emit("auth:revoked");
      io.in("user:" + userId).disconnectSockets(true);
      res.json({ reset: true });
    }),
  );
  return r;
}
