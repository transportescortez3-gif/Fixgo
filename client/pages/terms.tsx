import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Términos y Condiciones Generales de Uso</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-1">Plataforma Tecnológica FIXGO — Servicios Tecnológicos Fixgo SpA</p>
        <p className="text-sm text-muted-foreground mb-10">Versión 3.0 — Mayo 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-10 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo I: Identificación del Prestador y Naturaleza del Servicio
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 1°: Datos del Prestador</h3>
                <p>
                  Servicios Tecnológicos Fixgo SpA (en adelante, "FIXGO"), es una sociedad por acciones constituida
                  conforme a la legislación chilena, con domicilio en la República de Chile. FIXGO es el titular
                  y operador de la plataforma tecnológica accesible a través de <strong>appfixgo.com</strong> y la
                  aplicación móvil FIXGO (en adelante, la "Plataforma").
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 2°: Naturaleza del Servicio — Licencia de Software</h3>
                <p>
                  FIXGO otorga a sus usuarios una <strong>Licencia de Uso Temporal de Software</strong> (en adelante, la "Licencia").
                  El objeto exclusivo de esta Licencia es proporcionar acceso a herramientas tecnológicas que facilitan
                  la comunicación entre personas que requieren servicios del hogar o reparaciones ("Usuarios Clientes")
                  y personas que ofrecen dichos servicios de manera independiente ("Profesionales" o "Usuarios Profesionales").
                </p>
                <p className="mt-2">
                  <strong className="text-foreground">FIXGO NO ES UN INTERMEDIARIO.</strong> FIXGO no contrata, subcontrata,
                  ni participa en la ejecución de ningún servicio del hogar. FIXGO no actúa como agente,
                  mandatario, corredor ni intermediario de ninguno de sus usuarios. La Plataforma es exclusivamente
                  un software de comunicación y directorio de perfiles.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 3°: Modelo Económico</h3>
                <p>
                  El único ingreso que FIXGO percibe es el precio de la Licencia de acceso a la Plataforma
                  (suscripción mensual o anual). FIXGO <strong>no recibe</strong> comisiones, porcentajes, ni
                  participación alguna sobre el valor de los servicios del hogar que los usuarios contraten
                  directamente entre sí. Los pagos por servicios del hogar se realizan <strong>exclusivamente
                  entre el Usuario Cliente y el Profesional</strong>, fuera de la Plataforma, por los medios que
                  acuerden (efectivo, transferencia bancaria u otro), sin intervención de FIXGO.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo II: Registro y Aceptación de Condiciones
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 4°: Requisitos de Registro</h3>
                <p>
                  Para utilizar la Plataforma, el usuario debe ser mayor de edad (18 años o más), proporcionar
                  información veraz y completa, y aceptar expresamente estos Términos y Condiciones. El registro
                  implica la aceptación íntegra y sin reservas de las presentes condiciones.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 5°: Obligaciones del Usuario Profesional</h3>
                <p>
                  El Usuario Profesional declara y garantiza que:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Ejerce su actividad de manera independiente, por cuenta propia.</li>
                  <li>Cumple con todas las obligaciones tributarias vigentes en Chile, incluyendo la emisión de boletas
                    o facturas según corresponda conforme a la Ley 21.713 y normativa del SII.</li>
                  <li>Cuenta con las habilitaciones, permisos o certificaciones requeridas para los servicios que ofrece.</li>
                  <li>Mantiene relación directa con el Usuario Cliente para acordar precio, forma de pago, plazos
                    y condiciones de ejecución del servicio.</li>
                   <li>FIXGO no es su empleador ni mandante, y no existe relación laboral de ningún tipo.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 6°: Obligaciones del Usuario Cliente</h3>
                <p>
                   El Usuario Cliente entiende que FIXGO le proporciona acceso a un directorio de perfiles de profesionales
                  independientes. El Usuario Cliente acuerda directamente con el Profesional elegido las condiciones
                   del servicio, incluyendo precio y forma de pago. FIXGO no garantiza la disponibilidad, calidad,
                  oportunidad ni resultado de los servicios contratados directamente entre usuarios.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo III: Suscripción y Licencia de Acceso
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 7°: Planes de Suscripción</h3>
                <p>
                   FIXGO ofrece distintos planes de suscripción que otorgan acceso a funcionalidades diferenciadas
                  de la Plataforma. Los precios, características y condiciones de cada plan se detallan en la sección
                  "Planes" de la aplicación y pueden ser modificados con previo aviso a los usuarios activos.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 8°: Facturación y Renovación</h3>
                <p>
                  Las suscripciones se facturan mediante Transbank, plataforma de pago autorizada en Chile.
                  Las suscripciones de período mensual o anual se renuevan automáticamente al vencimiento,
                  salvo que el usuario las cancele antes del próximo período de facturación a través de la
                  sección "Mi Plan" de la aplicación.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 9°: Cancelación</h3>
                <p>
                  El usuario puede cancelar su suscripción en cualquier momento. Al cancelar, el acceso a las
                   funcionalidades premium se mantendrá hasta el final del período ya pagado. FIXGO no realiza
                  reembolsos proporcionales por períodos no utilizados, salvo que la ley lo exija expresamente.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo IV: Comunicaciones Cifradas y Privacidad
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 10°: Cifrado de Extremo a Extremo</h3>
                <p>
                  Las conversaciones entre usuarios en la Plataforma utilizan cifrado de extremo a extremo (E2E).
                  Esto significa que el contenido de los mensajes se cifra en el dispositivo del emisor y solo
                   puede ser descifrado en el dispositivo del receptor. <strong>FIXGO no puede acceder, leer,
                  almacenar ni compartir el contenido de las conversaciones entre usuarios.</strong>
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 11°: Responsabilidad del Usuario en las Comunicaciones</h3>
                <p>
                   Dado que FIXGO no puede acceder al contenido de los mensajes, el usuario es el único
                  responsable de las comunicaciones que realice. El usuario se compromete a utilizar el
                   sistema de mensajería de manera responsable y conforme a la ley. FIXGO no asume
                  responsabilidad alguna por el contenido de los mensajes intercambiados entre usuarios.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 12°: Valoraciones y Opiniones</h3>
                <p>
                  El sistema de valoraciones y opiniones de la Plataforma refleja exclusivamente la experiencia
                  subjetiva de los usuarios. Las valoraciones son opiniones personales y no constituyen
                   certificación, validación ni garantía de la calidad de los servicios por parte de FIXGO.
                   FIXGO actúa como mero repositorio de estas opiniones, sin intervenir en su contenido.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo V: Exclusión de Responsabilidad
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 13°: Limitación de Responsabilidad</h3>
                <p>
                   FIXGO no será responsable por: (i) la calidad, seguridad o resultado de los servicios del
                  hogar prestados por los Profesionales; (ii) daños o perjuicios derivados de los servicios
                  contratados entre usuarios; (iii) incumplimientos de los Profesionales o de los Usuarios
                  Clientes; (iv) disputas sobre precios, pagos o condiciones acordadas directamente entre usuarios;
                  (v) pérdida de datos o conversaciones derivada de la naturaleza del cifrado E2E.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 14°: Disponibilidad del Servicio</h3>
                <p>
                   FIXGO no garantiza la disponibilidad continua e ininterrumpida de la Plataforma y no será
                   responsable por interrupciones, errores técnicos o períodos de mantenimiento. FIXGO procurará
                  mantener la Plataforma operativa y realizará los esfuerzos razonables para minimizar interrupciones.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo VI: Conducta Prohibida y Suspensión
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 15°: Conductas Prohibidas</h3>
                <p>Está expresamente prohibido:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Proporcionar información falsa o engañosa en el registro o perfil.</li>
                  <li>Utilizar la Plataforma para actividades ilícitas.</li>
                  <li>Acosar, amenazar o discriminar a otros usuarios.</li>
                  <li>Intentar acceder a cuentas de otros usuarios sin autorización.</li>
                  <li>Publicar contenido ofensivo, pornográfico o que infrinja derechos de terceros.</li>
                   <li>Utilizar la Plataforma para efectuar cobros o pagos en nombre de FIXGO.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 16°: Suspensión y Terminación</h3>
                <p>
                   FIXGO se reserva el derecho de suspender o terminar el acceso a la Plataforma de cualquier
                  usuario que incumpla estos Términos, con o sin previo aviso según la gravedad de la infracción.
                  En caso de suspensión por incumplimiento del usuario, no procede reembolso alguno de la
                  suscripción pagada.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide mb-4 border-b border-border pb-2">
              Capítulo VII: Disposiciones Finales
            </h2>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 17°: Modificaciones</h3>
                <p>
                   FIXGO podrá modificar estos Términos en cualquier momento. Los cambios serán notificados
                  a los usuarios con al menos 15 días de anticipación mediante la Plataforma o por correo
                  electrónico. El uso continuado de la Plataforma tras la notificación implica la aceptación
                  de los nuevos términos.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 18°: Ley Aplicable y Jurisdicción</h3>
                <p>
                  Estos Términos se rigen por las leyes de la República de Chile. Cualquier disputa que no
                  pueda resolverse amigablemente será sometida a los tribunales ordinarios de justicia de
                  Santiago de Chile, renunciando las partes a cualquier otro fuero que pudiera corresponderles.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Artículo 19°: Contacto</h3>
                <p>
                  Para consultas relacionadas con estos Términos, puede contactarnos en:{" "}
                  <a href="mailto:soporte@appfixxer.com" className="text-primary hover:underline">soporte@appfixxer.com</a>.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
