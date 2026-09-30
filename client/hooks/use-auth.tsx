import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User, AuthResponse } from "@/api";
import { useGetMe, getGetMeQueryKey } from "@/api";
import { APP_URL } from "@/lib/app-config";
import { Capacitor } from "@capacitor/core";
import { reconnectSocket } from "./use-socket";
import { restoreOrCreateKeyPair } from "@/lib/e2e-crypto";
import {
  AUTH_TOKEN_KEY,
  KEY_SYNC_DONE_FLAG,
  REMEMBER_KEY,
  USER_CACHE_KEY,
  getAuthToken,
  migrateBrandStorage,
} from "@/lib/brand-storage";

// Lee las credenciales recordadas (checkbox "Recuérdame" en login). Se usan
// SOLO para mantener el respaldo E2E sincronizado en segundo plano en
// sesiones que nunca vuelven a pasar por el formulario de login (el usuario
// queda logueado indefinidamente por el token). Sin esto, un usuario que
// jamás re-ingresa su contraseña podría no tener respaldo de llave nunca
// creado y quedar bloqueado al cambiar de teléfono — justo lo que se busca
// evitar (continuidad de chat estilo WhatsApp en cualquier dispositivo).
function getRememberedCredentials(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.email && parsed?.password ? parsed : null;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (data: AuthResponse) => void;
  logout: () => void;
  switchRole: (targetRole: string) => Promise<void>;
  isClient: boolean;
  isWorker: boolean;
  isAdmin: boolean;
  isRoleSwitched: boolean;
  originalRole: string | null;
  platformType: "expertos" | "fletes";
  isFletes: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Lee el usuario cacheado de localStorage para hidratación instantánea.
// Evita el spinner de auth en cada recarga cuando el token ya existe.
function readStoredUser(): any {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredUser(u: any) {
  try {
    if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => {
    migrateBrandStorage();
    return getAuthToken();
  });

  // initialData: muestra el usuario almacenado localmente de inmediato,
  // eliminando el spinner de carga en recargas de página cuando ya hay sesión.
  // CRITICO: staleTime Infinity + refetchOnMount false garantizan que el mapa
  // nativo no se desmonte entre refetches (ver comentario original arriba).
  const storedUser = token ? readStoredUser() : undefined;

  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      placeholderData: (prev: any) => prev,
      ...(storedUser ? { initialData: storedUser, initialDataUpdatedAt: 0 } : {}),
    } as any,
  });

  // Sincronizar el usuario en localStorage cuando React Query lo actualiza
  useEffect(() => {
    if (user) writeStoredUser(user);
  }, [user]);

  // Sincronización oportunista del respaldo E2E en sesiones "silenciosas": si
  // el usuario nunca vuelve a pasar por el login (queda autenticado solo por
  // el token guardado) y activó "Recuérdame", usamos esa contraseña recordada
  // para asegurar que el respaldo de llave E2E exista y esté al día. Sin esto,
  // cuentas viejas que jamás re-ingresan su contraseña podrían no tener nunca
  // un respaldo creado y quedar bloqueadas al cambiar de dispositivo. Se
  // ejecuta una sola vez por pestaña/sesión para no golpear el servidor en
  // cada render.
  useEffect(() => {
    if (!user || !token) return;
    const alreadyDone = sessionStorage.getItem(KEY_SYNC_DONE_FLAG);
    if (alreadyDone === String((user as any).id)) return;
    const remembered = getRememberedCredentials();
    if (!remembered || remembered.email !== (user as any).email) return;
    sessionStorage.setItem(KEY_SYNC_DONE_FLAG, String((user as any).id));
    restoreOrCreateKeyPair(remembered.password).catch(() => {});
  }, [user, token]);

  // isLoading solo es true si tenemos token PERO aún no hay datos (ni en caché ni en localStorage)
  const isLoading = isUserLoading && !!token && !storedUser;

  const login = (data: AuthResponse) => {
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    // Mantener la clave anterior durante la transición para clientes nativos
    // que todavía ejecuten un bundle anterior.
    localStorage.setItem("fixxer_token", data.token);
    writeStoredUser(data.user);      // ← caché para hidratación instantánea
    setToken(data.token);
    queryClient.setQueryData(getGetMeQueryKey(), data.user);
    reconnectSocket();
    window.dispatchEvent(new CustomEvent("fixgo:auth"));
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem("fixxer_token");
    writeStoredUser(null);           // ← limpiar caché al cerrar sesión
    setToken(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    reconnectSocket();
  };

  const switchRole = useCallback(async (targetRole: string) => {
    const currentToken = getAuthToken();
    const baseUrl = Capacitor.isNativePlatform() ? APP_URL : "";
    const res = await fetch(`${baseUrl}/api/auth/switch-role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ targetRole }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error al cambiar rol");
    }
    const { token: newToken } = await res.json();
    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    localStorage.setItem("fixxer_token", newToken);
    setToken(newToken);
    // Actualizar token del socket al cambiar rol
    reconnectSocket();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    window.dispatchEvent(new CustomEvent("fixgo:auth"));
    // Navegar al inicio al cambiar rol para limpiar el contexto de conversación
    window.dispatchEvent(new CustomEvent("fixgo:role-switched", { detail: { targetRole } }));
  }, [queryClient]);

  const activeRole = (user as any)?.role ?? null;
  const originalRole: string | null = (user as any)?.originalRole ?? null;
  const isRoleSwitched = !!originalRole;

  const isClient = activeRole === "client";
  const isWorker = activeRole === "worker";
  const isAdmin  = activeRole === "admin";
  const platformType: "expertos" | "fletes" = ((user as any)?.platformType ?? "expertos") as "expertos" | "fletes";
  const isFletes = platformType === "fletes";

  return (
    <AuthContext.Provider value={{
      user: user || null,
      isLoading,
      login,
      logout,
      switchRole,
      isClient,
      isWorker,
      isAdmin,
      isRoleSwitched,
      originalRole,
      platformType,
      isFletes,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
