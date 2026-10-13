# Especificación: Fixxer Expertos como aplicación independiente en Perú

## Estado

Diseño aprobado para revisión escrita. La separación técnica y el alcance geográfico fueron confirmados por el usuario. No se han entregado fuentes peruanas aprobadas para contenido legal, tributario, pagos o KYC; esos módulos no pueden declararse adaptados ni listos para producción.

## Contexto y objetivo

Fixgo opera en Chile y debe permanecer intacta. El usuario quiere lanzar Fixxer Expertos como empresa y aplicación independiente en Perú que compita con Fixgo, con cobertura prevista en todo Perú y con versiones web, Android e iOS.

La migración a `PNPM_WORKSPACE` ya se completó. La estructura actual tiene el frontend en `artifacts/fixgo`, la API en `artifacts/api-server` y el esquema compartido en `lib/db`. Los proyectos nativos Android e iOS todavía están en la raíz del workspace. La configuración nativa actual identifica a Fixgo como `com.fixxer.app` / “Fixgo”; esos valores no se deben reutilizar en Fixxer Expertos.

El frontend y la API actuales contienen reglas y contenido específicos de Chile, entre ellos formato `es-CL`, CLP, RUT, Transbank y textos legales que citan leyes chilenas. Los documentos legales disponibles en el workspace también son chilenos. No se encontraron fuentes aprobadas para Perú.

## Decisiones aprobadas por el usuario

- Mantener Fixgo y Fixxer Expertos como aplicaciones y empresas separadas.
- Crear Fixxer Expertos mediante una copia completa de la web, el servidor y los proyectos nativos, no mediante un cambio de país en Fixgo.
- Alcance geográfico previsto: todo Perú.
- Nombre visible: **Fixxer Expertos**; Perú es la ubicación, no parte del nombre de marca.
- Conservar los identificadores técnicos existentes aunque contengan `fixxer-peru`.
- No compartir usuarios, datos de producción, secretos ni configuración de producción entre las aplicaciones.
- No inventar requisitos legales, tributarios, financieros ni de verificación de identidad.

## Diseño propuesto

### Organización de archivos

Crear `artifacts/fixxer-peru/` como carpeta raíz de la nueva aplicación, conteniendo todos sus elementos:

- La raíz del artefacto: aplicación React/Vite (`src/`, `public/`, `index.html` y configuración web).
- `api/`: servidor HTTP, WebSocket, autenticación y rutas propias de Fixxer Expertos.
- `db/`: esquema y migraciones propios, sin apuntar a la base de datos ni a las migraciones de Fixgo.
- `android/` e `ios/`: proyectos nativos completos de Fixxer Expertos.
- Configuración Capacitor y descriptor del artefacto web.
- Pruebas específicas de la aplicación.

Agregar sus paquetes al workspace PNPM y registrar un artefacto y workflows propios. La app Perú no importará componentes, datos ni configuración de país de Fixgo en tiempo de ejecución. Compartir dependencias externas de npm/pnpm es aceptable; compartir código de negocio o estado persistente entre competidores no forma parte de este diseño.

### Identidad y plataformas

- Nombre visible: **Fixxer Expertos**.
- Usar los recursos de marca Fixxer aprobados que estén disponibles; si se entrega una identidad peruana distinta, usar esa fuente aprobada en web, Android e iOS.
- Generar identificadores Android/iOS y esquema de enlaces propios, diferentes de `com.fixxer.app`; verificar disponibilidad en las tiendas antes de publicar.
- Separar los nombres de paquete, enlaces profundos, identificadores de notificación y proyecto Firebase/APNs.
- No copiar las credenciales Firebase/APNs de Fixgo. Las notificaciones de producción no se habilitan hasta disponer de proyectos y credenciales propios.
- Mantener el build de desarrollo y la prueba local disponibles sin configurar servicios productivos de Fixgo.

### Separación de datos y servicios

- La API de Fixxer Expertos solo usa su propia configuración de base de datos, almacenamiento de archivos, caché, dominios y orígenes permitidos.
- No copiar ni migrar datos de usuarios, clientes, expertos, mensajes, tokens de notificación o documentos desde Fixgo.
- No reutilizar secretos ni credenciales productivas. Los valores productivos nuevos se conectan por el flujo seguro de secretos, cuando existan cuentas propias.
- La configuración de desarrollo debe fallar explícitamente si apunta a un origen o base de datos de Fixgo; no debe ocultar el error usando una configuración por defecto.
- No configurar ni publicar un dominio productivo hasta que el propietario entregue y apruebe el dominio de Fixxer Expertos.

### Localización general

- Idioma y formatos generales: español de Perú (`es-PE`) y zona horaria `America/Lima`.
- Teléfonos y contacto: formato peruano y prefijo internacional `+51`, usando contactos públicos aprobados.
- Selector y búsqueda geográfica: permitir ubicaciones de todo Perú. La cobertura nacional expresa el territorio objetivo, no garantiza que haya expertos disponibles en cada localidad.
- No mostrar CLP ni conservar textos visibles de Chile. Si una función necesita mostrar precios, importes o datos bancarios, queda bloqueada hasta que se aprueben la moneda, el modelo de pago y los textos aplicables.
- Revisar categorías, direcciones, mapas, validaciones, correo, enlaces, metadatos, textos de onboarding, ayuda y notificaciones para evitar referencias visibles de Chile.

### Contenido legal, pagos, impuestos y KYC

No reemplazar “Chile” por “Perú” en contratos, textos legales, políticas ni documentos firmados. Crear cualquier documento peruano desde una fuente peruana aprobada por el cliente y su asesor correspondiente.

Las funciones que requieren estos criterios no se habilitan para producción hasta recibir fuentes aprobadas:

- Términos, privacidad, tratamiento de datos, contratos y aceptación de firma.
- Impuestos, comprobantes, facturación y cualquier obligación fiscal del negocio.
- Proveedor de pagos, moneda, precios de suscripción, reembolsos y conciliación.
- Documentos de identidad aceptados, proveedor y reglas de KYC, conservación de documentos y revisión.
- Reglas operativas, cancelaciones, retención de datos y contactos de soporte.

Mientras falten esas fuentes, la app puede compilarse y probarse en desarrollo, pero no puede afirmar cumplimiento peruano, procesar pagos reales ni aprobar verificaciones de identidad con requisitos inventados o heredados de Chile. Debe mostrar un estado de configuración incompleta en vez de caer silenciosamente en reglas chilenas.

## Fuentes aprobadas pendientes

El usuario indicó que no tiene documentos para adjuntar por ahora. Antes de completar la localización regulatoria o habilitar producción, se necesitan:

1. Fuentes aprobadas para términos, privacidad, contratos y retención de datos en Perú.
2. Instrucciones aprobadas de impuestos y comprobantes aplicables al modelo.
3. Proveedor de pagos peruano y criterios aprobados para cobros de suscripción, moneda, precios y reembolsos.
4. Requisitos aprobados de identidad/KYC, documentos aceptados y verificación.
5. Contactos públicos y recursos de marca que deben aparecer en la app.
6. Dominio, identificadores de publicación y cuentas independientes de tienda/proveedor cuando se decida publicar.

No solicitar ni incluir contraseñas, claves API, tokens, certificados privados ni otros secretos en documentos o chat.

## Pruebas y criterios de aceptación

- Fixgo continúa arrancando, construyéndose y usando las mismas rutas, marca, base de datos y configuración que antes de este trabajo.
- Fixxer Expertos puede ejecutarse y compilarse como web y tiene fuentes nativas completas para Android e iOS.
- Los identificadores de Fixxer Expertos son distintos de Fixgo en web, Android, iOS, enlaces profundos y notificaciones.
- Las solicitudes de Fixxer Expertos solo llegan a su API y su configuración de datos; no hay referencias de producción de Fixgo en la configuración peruana.
- Los textos visibles generales usan español y geografía de Perú; no se muestran CLP, RUT, Transbank ni afirmaciones legales chilenas como requisitos peruanos.
- La aplicación no activa pagos, KYC ni documentos legales de producción hasta recibir y aplicar sus fuentes aprobadas.
- Verificar el proyecto web, las rutas esenciales de cliente y experto, autenticación de desarrollo, pruebas de aislamiento y builds nativos disponibles en el entorno. Si una toolchain nativa no está disponible, reportar esa limitación en lugar de declarar ese build verificado.
- Buscar y revisar todas las coincidencias restantes de términos chilenos; cada coincidencia debe ser eliminada del contenido peruano o justificarse como parte de una prueba o documentación de migración.

## Fuera de alcance

- Cambiar, reconfigurar o publicar Fixgo Chile.
- Compartir bases de datos, usuarios, datos, secretos, dominios o cuentas productivas entre las empresas.
- Inventar asesoría legal, tributaria, financiera o requisitos de identidad para Perú.
- Editar documentos firmados o reemplazar texto en PDFs existentes.
- Prometer disponibilidad de expertos en cada región antes de que exista oferta real.
- Publicar Fixxer Expertos en tiendas o conectar infraestructura de producción sin aprobación y cuentas independientes.
