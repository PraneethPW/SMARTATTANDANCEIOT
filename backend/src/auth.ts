import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export type Role = 'ADMIN' | 'FACULTY' | 'TRANSPORT' | 'PARENT';
export type SessionUser = { id: string; name: string; email: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser) {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: '8h', issuer: 'transitsync-api' });
}

export function verifySession(token: string) {
  return jwt.verify(token, config.JWT_SECRET, { issuer: 'transitsync-api' }) as SessionUser;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = verifySession(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid' });
  }
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'This action is not allowed for your role' });
    }
    next();
  };
}

