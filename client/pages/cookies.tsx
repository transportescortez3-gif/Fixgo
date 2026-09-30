import { Link } from "wouter";
import { ArrowLeft, Cookie } from "lucide-react";

export default function CookiesPage() {
  function handleReset() {
    localStorage.removeItem("fixgo_cookie_consent");
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Cookie className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Política de Cookies</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-10">Última actualización: 16 de abril de 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">¿Qué son las cookies?</h2>
            <p>
              Las cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo cuando los
              visitas. Su propósito es recordar información sobre tu visita para facilitar el uso del sitio y
              mejorar tu experiencia. Esta política aplica exclusivamente a la versión web de FIXGO; la aplicación
              móvil nativa no utiliza cookies, sino mecanismos de almacenamiento seguros propios del sistema operativo.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Cookies que utilizamos</h2>

            <div className="space-y-4">
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Cookies técnicas y de sesión</h3>
                  <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">Siempre activas</span>
                </div>
                <p className="text-xs mb-2">
                  Son imprescindibles para el funcionamiento básico de la plataforma. Sin ellas no es posible
                  navegar ni usar los servicios.
                </p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="font-medium text-foreground/80">Nombre</span>
                    <span className="font-medium text-foreground/80">Propósito</span>
                    <span className="font-medium text-foreground/80">Duración</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span>fixgo_session</span>
                    <span>Mantiene tu sesión iniciada</span>
                    <span>Al cerrar sesión</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span>fixgo_cookie_consent</span>
                    <span>Guarda tu preferencia de cookies</span>
                    <span>1 año</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>fixgo_auth_token</span>
                    <span>Token de autenticación seguro</span>
                    <span>30 días</span>
                  </div>
                </div>
              </div>

              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Cookies de Google Maps</h3>
                  <span className="text-xs bg-blue-900/40 text-blue-400 border border-blue-800 px-2 py-0.5 rounded-full">Terceros</span>
                </div>
                <p className="text-xs">
                  Al cargar el mapa interactivo de Google Maps en la web, Google puede establecer sus propias
                  cookies para el funcionamiento del servicio cartográfico. Estas cookies están sujetas a la
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                    Política de Privacidad de Google
                  </a>. FIXGO no controla ni accede a estas cookies.
                </p>
              </div>

              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Cookies de publicidad y rastreo</h3>
                  <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">No utilizamos</span>
                </div>
                <p className="text-xs">
                  FIXGO no instala cookies de publicidad, remarketing, perfilamiento de usuarios ni rastreo
                  de comportamiento de ningún tipo. No compartimos datos de navegación con redes publicitarias.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Almacenamiento local (localStorage)</h2>
            <p>
              Además de cookies, utilizamos el <strong className="text-foreground">almacenamiento local del navegador</strong> (localStorage)
              para guardar preferencias de la aplicación como el tema visual, tu última ubicación consultada y
              datos de caché que mejoran la velocidad de carga. Toda esta información se almacena únicamente
              en tu dispositivo y no se transmite a nuestros servidores.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Cómo gestionar tus preferencias</h2>
            <p className="mb-3">
              Puedes controlar el uso de cookies de las siguientes maneras:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Desde tu navegador:</strong> todos los navegadores modernos permiten
                bloquear o eliminar cookies desde sus ajustes de privacidad (Chrome, Firefox, Safari, Edge).
                Ten en cuenta que bloquear cookies técnicas puede impedir el correcto funcionamiento de la plataforma.
              </li>
              <li>
                <strong className="text-foreground">Restablecer tu preferencia:</strong> si deseas cambiar tu elección
                de cookies, puedes hacerlo desde el botón a continuación.
              </li>
            </ul>

            <button
              onClick={handleReset}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 rounded-lg text-muted-foreground hover:bg-zinc-800 hover:text-foreground transition-colors"
            >
              <Cookie className="w-4 h-4" />
              Restablecer preferencias de cookies
            </button>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Base legal</h2>
            <p>
              El uso de cookies técnicas se basa en el interés legítimo de FIXGO para garantizar el funcionamiento
              de la plataforma (artículo 4° de la Ley N°19.628 de Chile). Las cookies de terceros (Google Maps)
              requieren tu consentimiento explícito, el cual puedes otorgar o revocar en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Más información</h2>
            <p>
              Para más detalles sobre cómo tratamos tus datos personales, consulta nuestra{" "}
              <Link href="/privacy" className="text-primary hover:underline">Política de Privacidad</Link>.
              Si tienes dudas sobre el uso de cookies, escríbenos a{" "}
              <a href="mailto:soporte@appfixxer.com" className="text-primary hover:underline">soporte@appfixxer.com</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
