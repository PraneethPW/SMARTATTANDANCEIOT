// Uses a disposable database schema; production application records stay untouched.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import jwt from "jsonwebtoken";
const { io } = createRequire(
  new URL("../../frontend/package.json", import.meta.url),
)("socket.io-client");
const schema =
  "account_test_" + Date.now() + "_" + randomBytes(3).toString("hex");
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.has("sslmode"))
  url.searchParams.set("sslmode", "verify-full");
if (url.hostname.endsWith(".neon.tech"))
  url.hostname = url.hostname.replace("-pooler.", ".");
const pool = new pg.Pool({
  connectionString: url.toString(),
  options: "-c search_path=" + schema,
});
const port = 9093,
  base = "http://127.0.0.1:" + port;
const password = randomBytes(24).toString("base64url"),
  newPassword = randomBytes(24).toString("base64url"),
  jwtSecret = randomBytes(40).toString("hex");
let server,
  keep = false,
  log = "",
  requestIndex = 1;
const sockets = [],
  passed = [];
const check = (name) => {
  passed.push(name);
  console.log("PASS " + name);
};
async function call(path, method = "GET", body, token, expected = 200, ip) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip || "192.0.2." + ((requestIndex++ % 200) + 1),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(
    response.status,
    expected,
    method + " " + path + " returned unexpected status",
  );
  return response.json().catch(() => ({}));
}
try {
  await pool.query("CREATE SCHEMA " + schema);
  server = spawn(process.execPath, ["dist/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_SCHEMA: schema,
      JWT_SECRET: jwtSecret,
      CORS_ORIGINS: "http://localhost:5174",
      AUTH_APP_URL: "http://localhost:5174",
      RESEND_API_KEY: "",
      AUTH_EMAIL_FROM: "",
    },
  });
  server.stdout.on("data", (b) => (log += b.toString()));
  server.stderr.on("data", (b) => (log += b.toString()));
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, "Isolated server did not become healthy");
  assert.equal(
    (await call("/api/auth/recovery-options")).mode,
    "administrator",
  );
  const admin = await call(
    "/api/auth/bootstrap",
    "POST",
    { name: "Test Admin", email: "admin@example.org", password },
    undefined,
    201,
  );
  await call(
    "/api/auth/bootstrap",
    "POST",
    { name: "Other Admin", email: "other@example.org", password },
    undefined,
    409,
  );
  const accounts = { ADMIN: admin };
  // An existing pending Admin request must survive the additive role migration.
  const legacyRequest = (
    await pool.query(
      "INSERT INTO admin_registration_requests(name,email,password_hash) SELECT 'Legacy Admin','legacy.admin@example.org',password_hash FROM users WHERE id=$1 RETURNING id,password_hash",
      [admin.user.id],
    )
  ).rows[0];
  await pool.query("ALTER TABLE admin_registration_requests DROP COLUMN role");
  const accountMigration = await readFile(
    new URL("../sql/accounts.sql", import.meta.url),
    "utf8",
  );
  await pool.query(accountMigration);
  await pool.query(accountMigration);
  const migrated = (
    await pool.query("SELECT * FROM admin_registration_requests WHERE id=$1", [
      legacyRequest.id,
    ])
  ).rows[0];
  assert.equal(migrated.role, "ADMIN");
  assert.equal(migrated.password_hash, legacyRequest.password_hash);
  await call(
    "/api/access/admin-registrations/" + legacyRequest.id + "/approve",
    "POST",
    { identityConfirmed: true },
    admin.token,
    201,
  );
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: migrated.email,
        password,
        role: "ADMIN",
      })
    ).user.role,
    "ADMIN",
  );
  check(
    "Existing Admin requests survive repeat migrations; initial Admin setup closes after bootstrap",
  );
  // Registration must not expose an active staff session before approval.
  for (const role of ["FACULTY", "TRANSPORT", "ADMIN"]) {
    const email = role.toLowerCase() + "2@example.org";
    const signup = { name: "Test " + role, email, role, password };
    const pending = await call(
      "/api/auth/staff-signup",
      "POST",
      signup,
      undefined,
      202,
    );
    assert.equal(pending.pendingApproval, true);
    assert.ok(!("token" in pending) && !("user" in pending));
    await call(
      "/api/auth/staff-signup",
      "POST",
      { ...signup, role: role === "ADMIN" ? "FACULTY" : "ADMIN" },
      undefined,
      409,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM users WHERE email=$1",
          [email],
        )
      ).rows[0].n,
      0,
    );
    await call(
      "/api/auth/login",
      "POST",
      { email, password, role },
      undefined,
      401,
    );
    const requests = await call(
      "/api/access/registrations",
      "GET",
      undefined,
      admin.token,
    );
    assert.equal(requests.registrations.length, 1);
    const request = requests.registrations[0];
    assert.equal(request.role, role);
    assert.ok(!("password_hash" in request));
    await call(
      "/api/access/registrations/" + request.id + "/approve",
      "POST",
      { identityConfirmed: false },
      admin.token,
      400,
    );
    const approved = await call(
      "/api/access/registrations/" + request.id + "/approve",
      "POST",
      { identityConfirmed: true, role: "ADMIN" },
      admin.token,
      201,
    );
    assert.equal(
      approved.user.role,
      role,
      "Approval must use the stored requested role",
    );
    await call(
      "/api/access/registrations/" + request.id + "/approve",
      "POST",
      { identityConfirmed: true },
      admin.token,
      409,
    );
    const registered = await call("/api/auth/login", "POST", {
      email,
      password,
      role,
    });
    assert.equal(registered.user.role, role);
    await call("/api/auth/staff-signup", "POST", signup, undefined, 409);
    assert.equal(
      (
        await pool.query(
          "SELECT password_hash FROM admin_registration_requests WHERE id=$1",
          [request.id],
        )
      ).rows[0].password_hash,
      null,
    );
    if (role !== "ADMIN") accounts[role] = registered;
    else accounts.secondAdmin = registered;
  }
  await call(
    "/api/auth/staff-signup",
    "POST",
    {
      name: "Invalid role",
      email: "invalid@example.org",
      role: "STUDENT",
      password,
    },
    undefined,
    400,
  );
  check(
    "Code-free Admin, Faculty and Transport registration requires verified Admin approval; roles, duplicate requests and single approval are enforced",
  );
  accounts.STUDENT = await call(
    "/api/auth/student-signup",
    "POST",
    {
      name: "Test Student",
      email: "student@example.org",
      password,
      registrationNumber: "AUTH-S001",
      rfidUid: "04AAFF01",
      department: "TEST",
      academicYear: 1,
      section: "A",
      residency: "HOSTEL",
      parentContact: "+91 99999 00001",
    },
    undefined,
    201,
  );
  accounts.PARENT = await call(
    "/api/auth/parent-signup",
    "POST",
    {
      name: "Test Parent",
      email: "parent@example.org",
      password,
      registrationNumber: "auth-s001",
      parentContact: "9999900001",
    },
    undefined,
    201,
  );
  const studentPortal = await call(
    "/api/portal",
    "GET",
    undefined,
    accounts.STUDENT.token,
  );
  const parentPortal = await call(
    "/api/portal",
    "GET",
    undefined,
    accounts.PARENT.token,
  );
  assert.equal(studentPortal.students[0].id, parentPortal.students[0].id);
  for (const requestedRole of ["ADMIN", "FACULTY", "TRANSPORT"]) {
    const path =
      requestedRole === "ADMIN" ? "/api/auth/admin-signup" : "/api/auth/signup";
    const applicant = {
      name: "Declined Test " + requestedRole,
      email: "declined." + requestedRole.toLowerCase() + "@example.org",
      password,
      role: requestedRole,
    };
    await call(path, "POST", applicant, undefined, 202);
    const request = (
      await call("/api/access/registrations", "GET", undefined, admin.token)
    ).registrations[0];
    assert.equal(request.role, requestedRole);
    // Old Admin-only lists must not show Faculty/Transport requests.
    const legacy = await call(
      "/api/access/admin-registrations",
      "GET",
      undefined,
      admin.token,
    );
    assert.equal(
      legacy.registrations.length,
      requestedRole === "ADMIN" ? 1 : 0,
    );
    for (const role of ["FACULTY", "TRANSPORT", "STUDENT", "PARENT"]) {
      await call(
        "/api/access/registrations",
        "GET",
        undefined,
        accounts[role].token,
        403,
      );
      await call(
        "/api/access/registrations/" + request.id + "/approve",
        "POST",
        { identityConfirmed: true },
        accounts[role].token,
        403,
      );
      await call(
        "/api/access/registrations/" + request.id + "/decline",
        "POST",
        undefined,
        accounts[role].token,
        403,
      );
    }
    await call(
      "/api/access/registrations/" + request.id + "/decline",
      "POST",
      undefined,
      admin.token,
    );
    await call(
      "/api/auth/login",
      "POST",
      { email: applicant.email, password, role: requestedRole },
      undefined,
      401,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT password_hash FROM admin_registration_requests WHERE id=$1",
          [request.id],
        )
      ).rows[0].password_hash,
      null,
    );
    await call(path, "POST", applicant, undefined, 202);
    await call(
      "/api/access/registrations/" + request.id + "/decline",
      "POST",
      undefined,
      admin.token,
    );
  }
  // All signup aliases share the same request limit.
  for (let n = 0; n < 5; n++)
    await call(
      n % 2 ? "/api/auth/staff-signup" : "/api/auth/admin-signup",
      "POST",
      {
        name: "Limited Test",
        email: "limited" + n + "@example.org",
        role: "FACULTY",
        password,
      },
      undefined,
      202,
      "198.51.100.43",
    );
  await call(
    "/api/auth/signup",
    "POST",
    {
      name: "Limited Test",
      email: "limited.last@example.org",
      role: "TRANSPORT",
      password,
    },
    undefined,
    429,
    "198.51.100.43",
  );
  check(
    "All staff queues reject non-Admins; declines remove credentials, permit reapplication, and shared signup limits apply",
  );
  for (const role of ["FACULTY", "TRANSPORT", "STUDENT", "PARENT"]) {
    const account = accounts[role];
    await call("/api/access/recovery", "GET", undefined, account.token, 403);
    await call("/api/users", "GET", undefined, account.token, 403);
    await call(
      "/api/auth/login",
      "POST",
      { email: account.user.email, password, role: "ADMIN" },
      undefined,
      403,
    );
  }
  await call("/api/classes", "GET", undefined, accounts.FACULTY.token);
  await call("/api/classes", "GET", undefined, accounts.TRANSPORT.token, 403);
  await call("/api/portal", "GET", undefined, accounts.FACULTY.token, 403);
  check(
    "All five roles authenticate; role mismatches and unauthorized controls are denied; child linking is preserved",
  );
  const unknown = await call("/api/auth/forgot-password", "POST", {
    email: "unknown@example.org",
    role: "STUDENT",
  });
  const wrongRole = await call("/api/auth/forgot-password", "POST", {
    email: admin.user.email,
    role: "PARENT",
  });
  assert.equal(unknown.message, wrongRole.message);
  for (const role of ["ADMIN", "FACULTY", "TRANSPORT", "STUDENT", "PARENT"]) {
    const response = await call("/api/auth/forgot-password", "POST", {
      email: accounts[role].user.email,
      role,
    });
    assert.equal(response.message, unknown.message);
  }
  const recovery = await call(
    "/api/access/recovery",
    "GET",
    undefined,
    accounts.secondAdmin.token,
  );
  assert.equal(recovery.requests.length, 5);
  for (const role of ["ADMIN", "FACULTY", "TRANSPORT", "STUDENT", "PARENT"]) {
    const account = accounts[role],
      request = recovery.requests.find((r) => r.role === role);
    await call(
      "/api/access/recovery/" + request.id + "/link",
      "POST",
      { identityConfirmed: false },
      accounts.secondAdmin.token,
      400,
    );
    const first = await call(
      "/api/access/recovery/" + request.id + "/link",
      "POST",
      { identityConfirmed: true },
      accounts.secondAdmin.token,
    );
    const oldToken = new URLSearchParams(new URL(first.link).hash.slice(1)).get(
      "token",
    );
    const second = await call(
      "/api/access/recovery/" + request.id + "/link",
      "POST",
      { identityConfirmed: true },
      accounts.secondAdmin.token,
    );
    const resetToken = new URLSearchParams(
      new URL(second.link).hash.slice(1),
    ).get("token");
    assert.equal(new URL(second.link).search, "");
    assert.equal(second.expiresMinutes, 20);
    await call(
      "/api/auth/reset-password",
      "POST",
      { token: oldToken, password: newPassword },
      undefined,
      400,
    );
    // A public repeat request cannot revoke a privately issued Admin link.
    await call("/api/auth/forgot-password", "POST", {
      email: account.user.email,
      role,
    });
    const legacy = jwt.sign(account.user, jwtSecret, {
      expiresIn: "8h",
      issuer: "transitsync-api",
    });
    await call("/api/auth/me", "GET", undefined, legacy);
    const socket = io(base, {
      auth: { token: account.token },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Socket connection timeout")),
        8000,
      );
      socket.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("connect_error", () => {
        clearTimeout(timeout);
        reject(new Error("Socket authentication failed"));
      });
    });
    const revokedSession = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Reset failed to revoke active socket")),
        8000,
      );
      socket.once("auth:revoked", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await call("/api/auth/reset-password", "POST", {
      token: resetToken,
      password: newPassword,
    });
    await revokedSession;
    await call(
      "/api/auth/reset-password",
      "POST",
      { token: resetToken, password: newPassword },
      undefined,
      400,
    );
    await call("/api/auth/me", "GET", undefined, account.token, 401);
    await call("/api/auth/me", "GET", undefined, legacy, 401);
    await call(
      "/api/auth/login",
      "POST",
      { email: account.user.email, password, role },
      undefined,
      401,
    );
    const fresh = await call("/api/auth/login", "POST", {
      email: account.user.email,
      password: newPassword,
      role,
    });
    await call("/api/auth/me", "GET", undefined, fresh.token);
    accounts[role] = fresh;
    socket.disconnect();
  }
  assert.equal(
    (
      await call(
        "/api/access/recovery",
        "GET",
        undefined,
        accounts.secondAdmin.token,
      )
    ).requests.length,
    0,
  );
  check(
    "Administrator-assisted password recovery works for all five roles, without revealing account existence",
  );
  check(
    "Reset links replace old links, require identity confirmation, work once and revoke HTTP and Socket.IO sessions",
  );
  await call("/api/auth/forgot-password", "POST", {
    email: accounts.STUDENT.user.email,
    role: "STUDENT",
  });
  const request = (
    await call(
      "/api/access/recovery",
      "GET",
      undefined,
      accounts.secondAdmin.token,
    )
  ).requests[0];
  const expiredLink = await call(
    "/api/access/recovery/" + request.id + "/link",
    "POST",
    { identityConfirmed: true },
    accounts.secondAdmin.token,
  );
  const expiredToken = new URLSearchParams(
    new URL(expiredLink.link).hash.slice(1),
  ).get("token");
  await pool.query(
    "UPDATE password_reset_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [createHash("sha256").update(expiredToken).digest("hex")],
  );
  await call(
    "/api/auth/reset-password",
    "POST",
    { token: expiredToken, password },
    undefined,
    400,
  );
  await call(
    "/api/auth/reset-password",
    "POST",
    { token: "a".repeat(64), password },
    undefined,
    400,
  );
  const tokenRows = (
    await pool.query("SELECT token_hash FROM password_reset_tokens")
  ).rows;
  assert.ok(
    tokenRows.every(
      (r) =>
        r.token_hash !== expiredToken && /^[a-f0-9]{64}$/.test(r.token_hash),
    ),
  );
  const audit = (
    await pool.query("SELECT before_value,after_value FROM audit_logs")
  ).rows;
  assert.ok(
    !JSON.stringify(audit).includes(expiredToken) &&
      !JSON.stringify(audit).includes(password),
  );
  for (let n = 0; n < 5; n++)
    await call(
      "/api/auth/forgot-password",
      "POST",
      { email: "unknown@example.org", role: "PARENT" },
      undefined,
      200,
      "198.51.100.42",
    );
  await call(
    "/api/auth/forgot-password",
    "POST",
    { email: "unknown@example.org", role: "PARENT" },
    undefined,
    429,
    "198.51.100.42",
  );
  check(
    "Expired and forged resets fail; database/audits contain hashes only; recovery requests are rate limited",
  );
  console.log("Verified " + passed.length + " account integration groups.");
  if (process.argv.includes("--keep")) {
    await call(
      "/api/auth/admin-signup",
      "POST",
      {
        name: "Test Admin Applicant",
        email: "pending.admin@example.org",
        password,
      },
      undefined,
      202,
    );
    await writeFile(
      new URL("../../../accounts-ui-session.json", import.meta.url),
      JSON.stringify(
        {
          schema,
          port,
          pid: server.pid,
          admin: { ...accounts.ADMIN, password: newPassword },
        },
        null,
        2,
      ),
    );
    keep = true;
    console.log(
      "Isolated server retained for UI checks. Credentials saved outside the repository.",
    );
  }
} finally {
  for (const socket of sockets) socket.disconnect();
  if (!keep) {
    server?.kill();
    await pool.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  }
  await pool.end();
  if (keep) server.unref();
}
