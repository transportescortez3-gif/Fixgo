const STORAGE_MIGRATIONS: Array<[string, string]> = [
  ["fixgo_token", "fixxer_token"],
  ["fixgo_user", "fixxer_user"],
  ["fixgo_remember", "fixxer_remember"],
  ["fixgo_e2e_sync_done", "fixxer_e2e_sync_done"],
  ["fixgo_active_service_id", "fixxer_active_service_id"],
  ["fixgo_cookie_consent", "fixxer_cookie_consent"],
  ["fixgo_dismissed_requests", "fixxer_dismissed_requests"],
  ["fixgo_last_position", "fixxer_last_position"],
  ["fixgo_onboarding_dismissed", "fixxer_onboarding_dismissed"],
  ["fixgo_show_requests", "fixxer_show_requests"],
  ["fixgo_map_prewarmed", "fixxer_map_prewarmed"],
  ["fixgo_disable_mapid", "fixxer_disable_mapid"],
  ["fixgo_lite_mode", "fixxer_lite_mode"],
  ["fixgo_e2e_keypair_v1", "fixxer_e2e_keypair_v1"],
  ["fixgo_device_id", "fixxer_device_id"],
  ["fixgo_site_settings_v1", "fixxer_site_settings_v1"],
];

let migrationDone = false;

export function migrateBrandStorage(): void {
  if (migrationDone || typeof window === "undefined") return;
  migrationDone = true;

  for (const [currentKey, legacyKey] of STORAGE_MIGRATIONS) {
    try {
      if (localStorage.getItem(currentKey) === null) {
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue !== null) localStorage.setItem(currentKey, legacyValue);
      }
    } catch {
      // Storage may be unavailable in private browsing or native startup.
    }
  }
}

export const AUTH_TOKEN_KEY = "fixgo_token";
export const USER_CACHE_KEY = "fixgo_user";
export const REMEMBER_KEY = "fixgo_remember";
export const KEY_SYNC_DONE_FLAG = "fixgo_e2e_sync_done";

export function getAuthToken(): string | null {
  migrateBrandStorage();
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem("fixxer_token");
  } catch {
    return null;
  }
}
