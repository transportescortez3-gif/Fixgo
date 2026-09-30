import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Cookie, X, Check } from "lucide-react";

const COOKIE_CONSENT_KEY = "fixgo_cookie_consent";

function isNativePlatform(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isNativePlatform()) return;
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setVisible(false);
  }

  function reject() {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 sm:p-6 pointer-events-none">
      <div className="max-w-4xl mx-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Cookie className="w-5 h-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-1">
              Usamos cookies y almacenamiento local
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Utilizamos cookies técnicas esenciales para mantener tu sesión activa y garantizar el funcionamiento
              de la plataforma. No usamos cookies de publicidad ni rastreo. El mapa de Google Maps puede utilizar
              cookies propias de Google.{" "}
              <Link href="/cookies" className="text-primary hover:underline underline-offset-2">
                Ver Política de Cookies
              </Link>
            </p>
          </div>

          <button
            onClick={reject}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:justify-end">
          <button
            onClick={reject}
            className="px-4 py-2 text-xs font-medium text-muted-foreground border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Solo esenciales
          </button>
          <button
            onClick={accept}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  );
}
