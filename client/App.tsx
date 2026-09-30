import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useCallKitIos } from "@/hooks/use-callkit-ios";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useLocationStartup } from "@/hooks/use-location-startup";
import { ErrorBoundary } from "@/components/error-boundary";
import { CallProvider } from "@/contexts/call-context";
import { GoogleMapsProvider } from "@/components/google-maps-provider";
import { CookieBanner } from "@/components/cookie-banner";
import Layout from "@/components/layout";
import MapPrewarm from "@/components/map-prewarm";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@/api/custom-fetch";
import { reconcileWorkerAlertState } from "@/api";
import { useTheme } from "@/hooks/use-theme";
import { APP_URL } from "@/lib/app-config";

// Pre-cargar TODAS las pestañas de navegación principal al arrancar para
// eliminar el spinner de Suspense en la primera visita a cada tab.
// Las importaciones dinámicas con el mismo especificador retornan la misma
// Promise cacheada, por lo que lazy() la reutiliza sin re-descargar.
const _preloadHome         = import("@/pages/home");
const _preloadWorkerHome   = import("@/components/worker-home");
const _preloadClientHome   = import("@/components/client-home");
const _preloadServices     = import("@/pages/services/index");      // Contactos
const _preloadCategories   = import("@/pages/categories/index");    // Categorías
const _preloadMisTrabajos  = import("@/pages/mis-trabajos");        // Mis Trabajos
const _preloadProfile      = import("@/pages/profile");             // Perfil
const _preloadNotifications = import("@/pages/notifications");      // Alertas

const Home          = lazy(() => _preloadHome);
const WorkerHome    = lazy(() => _preloadWorkerHome);
const ClientHome    = lazy(() => _preloadClientHome);

const IS_NATIVE_PLATFORM = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

try {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    setBaseUrl(APP_URL);
  }
} catch {}

const NotFound = lazy(() => import("@/pages/not-found"));
const Valoraciones = lazy(() => import("@/pages/valoraciones"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const ServicesList   = lazy(() => _preloadServices);
const NewService     = lazy(() => import("@/pages/services/new"));
const ServiceDetail  = lazy(() => import("@/pages/services/detail"));
const Workers        = lazy(() => import("@/pages/workers/index"));
const CategoriesPage = lazy(() => _preloadCategories);
const WorkerProfile  = lazy(() => import("@/pages/workers/profile"));
const Profile        = lazy(() => _preloadProfile);
const Notifications  = lazy(() => _preloadNotifications);
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminUserDetail = lazy(() => import("@/pages/admin/user-detail"));
const AdminBlockedUsers = lazy(() => import("@/pages/admin/blocked-users"));
const AdminCategories = lazy(() => import("@/pages/admin/categories"));
const AdminCommission = lazy(() => import("@/pages/admin/commission"));
const AdminSiteSettings = lazy(() => import("@/pages/admin/site-settings"));
const AdminKyc = lazy(() => import("@/pages/admin/kyc"));
const AdminTickets = lazy(() => import("@/pages/admin/tickets"));
const Support = lazy(() => import("@/pages/support"));
const KycPage = lazy(() => import("@/pages/kyc"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Cookies = lazy(() => import("@/pages/cookies"));
const FirmasPage = lazy(() => import("@/pages/firmas"));
const PlanesPage = lazy(() => import("@/pages/planes"));
const CheckoutPage = lazy(() => import("@/pages/checkout"));
const MiPlanPage = lazy(() => import("@/pages/mi-plan"));
const AdminCoupons = lazy(() => import("@/pages/admin/coupons"));
const AdminSubscriptions = lazy(() => import("@/pages/admin/subscriptions"));
const AdminSubscriptionStats = lazy(() => import("@/pages/admin/subscription-stats"));
const AdminPlans = lazy(() => import("@/pages/admin/plans"));
const AdminLogs = lazy(() => import("@/pages/admin/logs"));
const AdminCancellations = lazy(() => import("@/pages/admin/cancellations"));
const AdminSecuritySelfies = lazy(() => import("@/pages/admin/security-selfies"));
const AdminAccountDeletionRequests = lazy(() => import("@/pages/admin/account-deletion-requests"));
const MisTrabajos = lazy(() => _preloadMisTrabajos);
const AccountDeletion = lazy(() => import("@/pages/account-deletion"));

function reportClientError(error: { message?: string; stack?: string }) {
  try {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  } catch {}
}

window.addEventListener("error", (event) => {
  if (event.error) reportClientError(event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const msg = reason?.message ?? "";
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("ChunkLoadError")) {
    window.location.reload();
  } else if (reason instanceof Error) {
    reportClientError(reason);
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 1 min: cualquier dato que no sea tiempo-real se considera fresco
      // durante 60s — sin refetch en background si regresás rápido.
      staleTime: 60_000,
      // 15 min: los datos permanecen en caché aunque el componente se
      // desmonte. Navegar entre páginas y volver muestra datos instantáneamente
      // sin spinners. (default React Query: 5 min)
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
      // Revalidar datos en reconexión (ej. volver de background)
      refetchOnReconnect: true,
    },
  },
});

// ── Defaults por tipo de dato ─────────────────────────────────────────────
// Datos estáticos/semi-estáticos: staleTime largo, GC largo.
// Se deja en caché casi indefinidamente porque el bootstrap ya los siembra.
queryClient.setQueryDefaults(["/api/categories"], {
  staleTime: 30 * 60_000,  // 30 min
  gcTime:    60 * 60_000,  // 1 hora
});
queryClient.setQueryDefaults(["/api/admin/site-settings"], {
  staleTime: 5 * 60_000,   // 5 min
  gcTime:    30 * 60_000,  // 30 min
});
// Planes de suscripción — raramente cambian
queryClient.setQueryDefaults(["/api/subscriptions/plans"], {
  staleTime: 30 * 60_000,
  gcTime:    60 * 60_000,
});

// Barra de progreso sutil en la parte superior — no bloquea la pantalla
// ni cubre el contenido. Se usa solo para páginas secundarias no precargadas.
const PageFallback = () => (
  <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] overflow-hidden">
    <div
      className="h-full bg-primary"
      style={{
        animation: "page-loading-bar 1.4s ease-in-out infinite",
      }}
    />
    <style>{`
      @keyframes page-loading-bar {
        0%   { transform: translateX(-100%); }
        50%  { transform: translateX(0%); width: 80%; }
        100% { transform: translateX(100%); }
      }
    `}</style>
  </div>
);

function PushNotificationsInit() {
  usePushNotifications();
  useCallKitIos();
  return null;
}

function BootstrapInit() {
  useBootstrap();
  return null;
}

function LocationStartupInit() {
  useLocationStartup();
  return null;
}

function ThemeInit() {
  useTheme();
  return null;
}

const PROFILE_PHOTO_ALLOWED_PATHS = new Set([
  "/profile",
  "/verify-email",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/cookies",
  "/eliminar-cuenta",
  "/support",
]);

function HomeRoute() {
  const { user, isWorker, isClient } = useAuth();
  // En nativo, WorkerHome/ClientHome ya están montados persistentemente
  // por el bloque showPersistentWorker/showPersistentClient. Si los
  // volvemos a renderizar aquí se duplica el contenido en pantalla.
  if (IS_NATIVE_PLATFORM && user && (isWorker || isClient)) return null;
  if (user && isWorker) return <WorkerHome />;
  if (user && isClient) return <ClientHome />;
  return <Home />;
}

function Router() {
  const { isLoading, user, isWorker, isClient } = useAuth();
  const [location, navigate] = useLocation();
  const reconciledWorkerIdRef = useRef<number | null>(null);

  const needsProfilePhoto =
    !!user &&
    (user as any).role !== "admin" &&
    !(user as any).avatarUrl;

  useEffect(() => {
    if (needsProfilePhoto && !PROFILE_PHOTO_ALLOWED_PATHS.has(location)) {
      navigate("/profile", { replace: true });
    }
  }, [needsProfilePhoto, location, navigate]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isWorker) {
      reconciledWorkerIdRef.current = null;
      return;
    }
    if (reconciledWorkerIdRef.current === user.id) return;

    reconciledWorkerIdRef.current = user.id;
    const serviceRoute = location.match(/^\/services\/(\d+)(?:\/|$)/);
    const activeServiceId = serviceRoute ? Number(serviceRoute[1]) : null;
    reconcileWorkerAlertState(activeServiceId).catch((error) => {
      console.warn("[alert-reconcile] startup reconciliation failed", error);
      if (reconciledWorkerIdRef.current === user.id) {
        reconciledWorkerIdRef.current = null;
      }
    });
  }, [isLoading, user?.id, isWorker, location]);

  if (isLoading) {
    return <PageFallback />;
  }

  const isHome = location === "/";
  const showPersistentWorker = IS_NATIVE_PLATFORM && !!user && isWorker;
  const showPersistentClient = IS_NATIVE_PLATFORM && !!user && isClient;

  return (
    <Layout>
      {showPersistentWorker && (
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ display: isHome ? undefined : "none" }}
        >
          <WorkerHome visible={isHome} />
        </div>
      )}
      {showPersistentClient && (
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ display: isHome ? undefined : "none" }}
        >
          <ClientHome visible={isHome} />
        </div>
      )}
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/services" component={ServicesList} />
          <Route path="/services/new" component={NewService} />
          <Route path="/services/:id" component={ServiceDetail} />
          <Route path="/workers" component={Workers} />
          <Route path="/workers/:id" component={WorkerProfile} />
          <Route path="/categories" component={CategoriesPage} />
          <Route path="/profile" component={Profile} />
          <Route path="/valoraciones" component={Valoraciones} />
          <Route path="/notifications" component={Notifications} />

          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/users/:id" component={AdminUserDetail} />
          <Route path="/admin/blocked-users" component={AdminBlockedUsers} />
          <Route path="/admin/categories" component={AdminCategories} />
          <Route path="/admin/commission" component={AdminCommission} />
          <Route path="/admin/site-settings" component={AdminSiteSettings} />
          <Route path="/admin/kyc" component={AdminKyc} />
          <Route path="/admin/tickets" component={AdminTickets} />
          <Route path="/support" component={Support} />

          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/verify-email" component={VerifyEmail} />

          <Route path="/kyc" component={KycPage} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/cookies" component={Cookies} />
          <Route path="/firmas" component={FirmasPage} />
          <Route path="/planes" component={PlanesPage} />
          <Route path="/checkout/:planCode" component={CheckoutPage} />
          <Route path="/mi-plan" component={MiPlanPage} />
          <Route path="/admin/coupons" component={AdminCoupons} />
          <Route path="/admin/subscriptions" component={AdminSubscriptions} />
          <Route path="/admin/subscription-stats" component={AdminSubscriptionStats} />
          <Route path="/admin/plans" component={AdminPlans} />
          <Route path="/admin/logs" component={AdminLogs} />
          <Route path="/admin/cancellations" component={AdminCancellations} />
          <Route path="/admin/security-selfies" component={AdminSecuritySelfies} />
          <Route path="/admin/account-deletion-requests" component={AdminAccountDeletionRequests} />
          <Route path="/mis-trabajos" component={MisTrabajos} />
          <Route path="/eliminar-cuenta" component={AccountDeletion} />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <CallProvider>
                <ThemeInit />
                <BootstrapInit />
                <PushNotificationsInit />
                <LocationStartupInit />
                <GoogleMapsProvider>
                  <MapPrewarm />
                  <ErrorBoundary>
                    <Router />
                  </ErrorBoundary>
                </GoogleMapsProvider>
                <CookieBanner />
              </CallProvider>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
