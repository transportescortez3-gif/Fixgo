export function parseSecuritySelfieServiceId(search: string): number | null {
  const raw = new URLSearchParams(search).get("securitySelfieServiceId");
  const serviceId = raw ? Number(raw) : NaN;
  return Number.isFinite(serviceId) && serviceId > 0 ? serviceId : null;
}

/**
 * Consume the one-shot request to open a service selfie. Returns null when the
 * URL does not contain a request for this service.
 */
export function consumeSecuritySelfieServiceId(search: string, serviceId: number): string | null {
  const params = new URLSearchParams(search);
  if (Number(params.get("securitySelfieServiceId")) !== serviceId) return null;

  params.delete("securitySelfieServiceId");
  return params.toString();
}
