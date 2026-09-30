/**
 * Public application URL used by native clients and external callbacks.
 *
 * Web requests stay relative so the Replit preview and production proxy keep
 * working, while Capacitor needs an absolute origin for API calls.
 */
export const APP_URL = (
  import.meta.env?.VITE_APP_URL || "https://appfixgo.com"
).replace(/\/$/, "");