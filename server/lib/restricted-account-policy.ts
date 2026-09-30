export function isSuspensionActive(
  suspendedUntil: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (!suspendedUntil) return false;
  return new Date(suspendedUntil).getTime() > now;
}

/**
 * A restricted account remains authenticated only for its own profile and
 * support. The route handlers still enforce ownership and role checks.
 */
export function isRestrictedAccountAllowedPath(
  path: string,
  method: string,
  userId: number,
): boolean {
  const normalizedMethod = method.toUpperCase();
  const isReadOnly = ["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);

  if (path === "/auth/me" && isReadOnly) return true;
  if (path === "/tickets" || path.startsWith("/tickets/")) return true;

  const ownUserPath = path.match(/^\/users\/(\d+)$/);
  if (
    ownUserPath
    && Number(ownUserPath[1]) === userId
    && ["GET", "PATCH"].includes(normalizedMethod)
  ) {
    return true;
  }

  const ownWorkerCategoriesPath = path.match(/^\/workers\/(\d+)\/categories$/);
  if (
    ownWorkerCategoriesPath
    && Number(ownWorkerCategoriesPath[1]) === userId
    && ["GET", "PUT"].includes(normalizedMethod)
  ) {
    return true;
  }

  // Profile media and portfolio/certification management are part of editing
  // the user's own profile. The resource routes enforce ownership.
  if (
    path.startsWith("/storage/uploads/")
    || path === "/portfolio"
    || path.startsWith("/portfolio/")
    || path === "/certifications"
    || path.startsWith("/certifications/")
  ) {
    return true;
  }

  return false;
}