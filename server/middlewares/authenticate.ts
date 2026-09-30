import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth";
import { db, usersTable } from "../db";
import { eq } from "drizzle-orm";
import {
  isRestrictedAccountAllowedPath,
  isSuspensionActive,
} from "../lib/restricted-account-policy";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
  originalRole?: string;
  securitySelfieRequired?: boolean;
}

interface CacheEntry {
  role: string;
  status: string;
  suspendedUntil: Date | null;
  lastActivityAt: Date | null;
  securitySelfieRequired: boolean;
  lastActivityWrittenAt: number;
  expiresAt: number;
}

const USER_CACHE_TTL = 60_000;
const userCache = new Map<number, CacheEntry>();

export async function authorizeAuthenticatedUser(
  req: AuthRequest,
  res: Response,
  user: {
    id: number;
    status: string;
    suspendedUntil: Date | null;
    lastActivityAt: Date | null;
    securitySelfieRequired: boolean;
  },
  cacheEntry: CacheEntry,
  now: number,
): Promise<boolean> {
  const temporarilySuspended = isSuspensionActive(user.suspendedUntil, now);
  const restrictedAccount = user.status === "blocked" || temporarilySuspended;

  if (restrictedAccount) {
    if (!isRestrictedAccountAllowedPath(req.path, req.method, user.id)) {
      res.status(403).json({
        error: temporarilySuspended
          ? "Cuenta suspendida temporalmente: solo puedes editar tu perfil o contactar a soporte"
          : "Cuenta bloqueada: solo puedes editar tu perfil o contactar a soporte",
        code: temporarilySuspended ? "ACCOUNT_SUSPENDED" : "ACCOUNT_BLOCKED",
      });
      return false;
    }
  }

  cacheEntry.lastActivityAt = new Date(now);
  if (now - cacheEntry.lastActivityWrittenAt >= 5 * 60_000) {
    cacheEntry.lastActivityWrittenAt = now;
    void db.update(usersTable).set({ lastActivityAt: cacheEntry.lastActivityAt })
      .where(eq(usersTable.id, user.id))
      .catch(() => {});
  }

  req.userId = user.id;
  req.userRole = req.userRole;
  req.securitySelfieRequired = cacheEntry.securitySelfieRequired;

  return true;
}

export function invalidateUserCache(userId: number): void {
  userCache.delete(userId);
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const now = Date.now();
  const cached = userCache.get(payload.id);

  if (cached && cached.expiresAt > now) {
    req.userRole = payload.role;
    req.originalRole = payload.originalRole;
    if (await authorizeAuthenticatedUser(req, res, {
      id: payload.id,
      status: cached.status,
      suspendedUntil: cached.suspendedUntil,
      lastActivityAt: cached.lastActivityAt,
      securitySelfieRequired: cached.securitySelfieRequired,
    }, cached, now)) {
      next();
    }
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
      suspendedUntil: usersTable.suspendedUntil,
      lastActivityAt: usersTable.lastActivityAt,
      securitySelfieRequired: usersTable.securitySelfieRequired,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.id))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const entry: CacheEntry = {
    role: user.role,
    status: user.status,
    suspendedUntil: user.suspendedUntil,
    lastActivityAt: user.lastActivityAt,
    securitySelfieRequired: user.securitySelfieRequired,
    lastActivityWrittenAt: 0,
    expiresAt: now + USER_CACHE_TTL,
  };
  userCache.set(payload.id, entry);

  if (userCache.size > 2000) {
    for (const [key, entry] of userCache) {
      if (entry.expiresAt <= now) userCache.delete(key);
      if (userCache.size <= 1000) break;
    }
  }

  req.userRole = payload.role;
  req.originalRole = payload.originalRole;
  if (await authorizeAuthenticatedUser(req, res, user, entry, now)) next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
