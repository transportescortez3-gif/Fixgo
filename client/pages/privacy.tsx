import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Política de Privacidad y Protección de Datos</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-1">Servicios Tecnológicos Fixgo SpA</p>
        <p className="text-sm text-muted-foreground mb-10">Versión vigente: Mayo 2026 — Ley 21.719 (Chile)</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Responsable del Tratamiento</h2>
            <p>
              <strong className="text-foreground">Servicios Tecnológicos Fixgo SpA</strong> (en adelante "FIXGO")
              es el responsable del tratamiento de los datos personales recopilados a través de la plataforma
              appfixgo.com y la aplicación móvil FIXGO, conforme a la Ley N° 21.719 sobre Protección de
              Datos Personales de Chile y demás normativa aplicable.
            </p>
            <p className="mt-2">
              Para ejercer sus derechos o realizar consultas sobre privacidad, contáctenos en:{" "}
              <a href="mailto:privacidad@appfixxer.com" className="text-primary hover:underline">privacidad@appfixxer.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Datos que Recopilamos</h2>
            <p>FIXGO recopila únicamente los datos necesarios para la prestación del servicio:</p>
            <div className="mt-3 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Datos de Registro:</h3>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  <li>Nombre completo y correo electrónico</li>
                  <li>Número de teléfono (para verificación)</li>
                  <li>Rol en la plataforma (cliente o profesional)</li>
                  <li>Foto de perfil (opcional)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Datos de Uso:</h3>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  <li>Publicaciones de necesidades y conversaciones iniciadas (metadatos, no contenido)</li>
                  <li>Valoraciones y comentarios que el usuario redacta</li>
                  <li>Ubicación geográfica aproximada (solo cuando se usa el mapa y con consentimiento)</li>
                  <li>Datos de suscripción y facturación (procesados por Transbank)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Lo que NO recopilamos:</h3>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  <li><strong className="text-foreground">Contenido de mensajes:</strong> Los mensajes están cifrados de extremo a extremo (E2E). FIXGO no puede acceder, leer ni almacenar el contenido de las conversaciones.</li>
                  <li><strong className="text-foreground">Datos de pago entre usuarios:</strong> Los pagos de servicios se realizan directamente entre usuarios fuera de la plataforma.</li>
                  <li><strong className="text-foreground">Montos de transacciones:</strong> FIXGO no registra el valor de los servicios contratados entre usuarios.</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Finalidades del Tratamiento</h2>
            <p>Sus datos personales son utilizados exclusivamente para:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Gestionar su cuenta y acceso a la plataforma</li>
              <li>Prestar el servicio de licencia de software contratado</li>
              <li>Procesar y gestionar su suscripción</li>
              <li>Enviar notificaciones relacionadas con el uso de la plataforma</li>
              <li>Verificar la identidad del usuario (KYC) cuando aplique</li>
              <li>Mejorar la plataforma mediante análisis agregado y anonimizado</li>
              <li>Cumplir con obligaciones legales aplicables</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Base Legal del Tratamiento</h2>
            <p>
              El tratamiento de sus datos personales se realiza sobre las siguientes bases legales conforme
              a la Ley 21.719:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li><strong className="text-foreground">Ejecución del contrato:</strong> para prestar el servicio de licencia de software suscrito.</li>
              <li><strong className="text-foreground">Consentimiento:</strong> para envío de comunicaciones de marketing (puede retirarse en cualquier momento).</li>
              <li><strong className="text-foreground">Obligación legal:</strong> para cumplir con requerimientos de autoridades competentes.</li>
              <li><strong className="text-foreground">Interés legítimo:</strong> para mejorar la seguridad y funcionamiento de la plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Sus Derechos (ARCO+)</h2>
            <p>
              Conforme a la Ley 21.719, usted tiene los siguientes derechos sobre sus datos personales:
            </p>
            <div className="mt-3 space-y-2">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">🔍 Derecho de Acceso</h3>
                <p className="text-sm mt-1">Puede solicitar información sobre qué datos personales suyos tratamos, con qué finalidad y cómo los procesamos.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">✏️ Derecho de Rectificación</h3>
                <p className="text-sm mt-1">Puede solicitar la corrección de datos inexactos o incompletos. Muchos datos pueden corregirse directamente desde su perfil.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">🗑️ Derecho de Cancelación / Supresión</h3>
                <p className="text-sm mt-1">Puede solicitar la eliminación de sus datos cuando ya no sean necesarios para los fines para los que fueron recopilados, o cuando retire su consentimiento.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">🚫 Derecho de Oposición</h3>
                <p className="text-sm mt-1">Puede oponerse al tratamiento de sus datos para determinadas finalidades, como el envío de comunicaciones comerciales.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">📦 Derecho a la Portabilidad</h3>
                <p className="text-sm mt-1">Puede solicitar una copia de sus datos en formato estructurado y legible por máquina para transferirlos a otro servicio.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <h3 className="text-sm font-semibold text-foreground">⏸️ Derecho a la Limitación del Tratamiento</h3>
                <p className="text-sm mt-1">En ciertos casos puede solicitar que limitemos el tratamiento de sus datos mientras se resuelve una controversia sobre su exactitud o licitud.</p>
              </div>
            </div>
            <p className="mt-3">
              Para ejercer cualquiera de estos derechos, envíe su solicitud a{" "}
              <a href="mailto:privacidad@appfixxer.com" className="text-primary hover:underline">privacidad@appfixxer.com</a>.
              Responderemos en un plazo máximo de 30 días hábiles.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Retención de Datos</h2>
            <p>
              Conservamos sus datos personales durante el tiempo que mantenga su cuenta activa y el período
              necesario para cumplir con las finalidades descritas. Adicionalmente:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Datos de facturación y suscripción: 6 años (obligación tributaria chilena)</li>
              <li>Metadatos de conversaciones: 2 años desde la última actividad</li>
              <li>Datos de verificación de identidad (KYC): según exija la normativa aplicable</li>
              <li>Datos de cuenta: hasta 90 días tras la eliminación de la cuenta (período de gracia)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Seguridad de los Datos</h2>
            <p>
              FIXGO implementa medidas técnicas y organizativas para proteger sus datos, incluyendo:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Cifrado de extremo a extremo (E2E) en todas las conversaciones</li>
              <li>Transmisión de datos bajo protocolo HTTPS/TLS</li>
              <li>Contraseñas almacenadas con hash criptográfico (bcrypt)</li>
              <li>Acceso restringido a datos personales solo al personal autorizado</li>
              <li>Monitoreo de seguridad y auditorías periódicas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Transferencias Internacionales</h2>
            <p>
              Sus datos pueden ser procesados por proveedores de servicios en el extranjero (infraestructura
              en la nube, servicios de correo electrónico). En todos los casos, nos aseguramos de que dichos
              proveedores cuenten con salvaguardias adecuadas conforme a los estándares internacionales de
              protección de datos.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">9. Cookies y Tecnologías Similares</h2>
            <p>
              FIXGO utiliza cookies técnicas necesarias para el funcionamiento de la plataforma y cookies
              de preferencia para recordar sus ajustes. Puede gestionar sus preferencias de cookies a través
              del banner de cookies disponible en la plataforma o en la configuración de su navegador.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">10. Modificaciones a esta Política</h2>
            <p>
              FIXGO puede actualizar esta Política de Privacidad para reflejar cambios en nuestras prácticas
              o en la legislación aplicable. Le notificaremos cualquier cambio material con al menos 15 días
              de anticipación mediante la plataforma o por correo electrónico.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">11. Contacto y Reclamaciones</h2>
            <p>
              Si tiene dudas, inquietudes o desea ejercer sus derechos, contáctenos en{" "}
              <a href="mailto:privacidad@appfixxer.com" className="text-primary hover:underline">privacidad@appfixxer.com</a>.
            </p>
            <p className="mt-2">
              Si considera que el tratamiento de sus datos infringe la legislación vigente, tiene derecho a
              presentar una reclamación ante la autoridad competente en materia de protección de datos personales
              en Chile (Consejo para la Transparencia o el organismo que establezca la Ley 21.719).
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
