import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { pool } from "./db.js";

export type Role = "ADMIN" | "FACULTY" | "TRANSPORT" | "PARENT" | "STUDENT";
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser, sessionVersion = 0) {
  return jwt.sign({ ...user, sessionVersion }, config.JWT_SECRET, {
    expiresIn: "8h",
    issuer: "transitsync-api",
  });
}

export async function verifySession(token: string) {
  const claims = jwt.verify(token, config.JWT_SECRET, {
    issuer: "transitsync-api",
  }) as SessionUser & { sessionVersion?: number };
  const result = await pool.query(
    "SELECT id,name,email,role,session_version FROM users WHERE id=$1",
    [claims.id],
  );
  const current = result.rows[0];
  if (!current || current.session_version !== (claims.sessionVersion ?? 0))
    throw new Error("Session revoked");
  return {
    id: current.id,
    name: current.name,
    email: current.email,
    role: current.role,
  } as SessionUser;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = await verifySession(token);
    next();
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      (error instanceof Error && error.message === "Session revoked")
    ) {
      res.status(401).json({ error: "Session expired or invalid" });
    } else next(error);
  }
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "This action is not allowed for your role" });
    }
    next();
  };
}
