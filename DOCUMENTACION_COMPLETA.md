# Fixgo — documentación completa del proyecto

> Documento generado a partir del código actual del proyecto. Describe las funciones, opciones, flujos, permisos, rutas, datos, integraciones y limitaciones que existen en la versión revisada el **3 de septiembre de 2026**.
>
> **Importante:** este documento diferencia entre capacidades activas, capacidades heredadas que todavía aparecen en el código/base de datos y limitaciones conocidas. La autorización real siempre la determina el servidor, aunque una opción también esté oculta en la interfaz.

---

## 1. Qué es Fixgo

Fixgo es una plataforma web y móvil para conectar clientes con expertos o trabajadores de servicios. El sistema permite:

- Crear una cuenta como cliente o experto.
- Verificar correo, teléfono e identidad.
- Buscar expertos por categoría, ubicación, disponibilidad, habilidades y reputación.
- Publicar solicitudes de servicio.
- Enviar solicitudes directas a un experto.
- Recibir, comparar y negociar propuestas.
- Comunicarse mediante chat y llamadas de voz.
- Compartir ubicación durante un servicio.
- Confirmar la realización del servicio desde ambos lados.
- Calificar a la otra persona.
- Gestionar suscripciones de la plataforma.
- Administrar usuarios, categorías, KYC, soporte, bloqueos y configuración desde un panel administrativo.

La aplicación opera con un modelo de conexión/SaaS:

- Fixgo **no debe intermediar el pago del servicio** entre cliente y experto.
- El pago del servicio se acuerda directamente entre las partes, fuera del procesamiento de Fixgo.
- Las opciones disponibles para declarar el pago son **efectivo** y **transferencia directa**.
- Transbank/Webpay se reserva para las suscripciones de la plataforma.
- El código conserva algunos elementos antiguos de saldo, comisiones, payouts y PayPal; esos elementos son heredados y no deben habilitarse como modelo operativo actual.

La marca visible del proyecto es **Fixgo**. Existen referencias históricas a Fixxer, Zigo y FixMaster en documentos, nombres técnicos, identificadores móviles o PDFs anteriores.

---

## 2. Resumen de la arquitectura

### 2.1 Capas principales

| Capa | Tecnología | Ubicación |
|---|---|---|
| Interfaz web | React 19, Vite, TypeScript | `client/` |
| Estilos | Tailwind CSS 4, Radix UI, componentes tipo shadcn/ui | `client/` |
| Servidor | Node.js 20, Express 5, TypeScript | `server/` |
| API | REST bajo `/api` | `server/routes/` |
| Tiempo real | Socket.IO | `server/lib/socketio.ts` |
| Base de datos | PostgreSQL | `server/db/` |
| ORM | Drizzle ORM | `server/db/schema/` |
| Validación | Zod/Drizzle-Zod | `server/zod/`, rutas |
| Web móvil | Capacitor 8 | `capacitor.config.ts` |
| Android | Gradle, Kotlin/Java, Firebase Messaging | `android/` |
| iOS | Xcode, Swift, PushKit y CallKit | `ios/` |
| Mapas web | Google Maps y Leaflet según componente | `client/components/`, `client/pages/` |
| Mapas nativos | `@capacitor/google-maps` | `client/components/native-map.tsx` |
| Suscripciones | Transbank/Webpay | `server/lib/transbank.ts` |
| Correo | Resend | `server/lib/email.ts` |
| Push | Firebase Cloud Messaging y APNs | `server/lib/firebase.ts`, `server/lib/apns.ts` |
| Llamadas | WebRTC + Socket.IO + TURN/STUN | `server/routes/calls.ts`, `server/lib/socketio.ts` |
| Escalado de sockets | Redis Adapter opcional | `@socket.io/redis-adapter` |

### 2.2 Flujo general de la aplicación

1. El navegador o la aplicación Capacitor carga React.
2. React gestiona las pantallas y consulta la API REST.
3. La API valida el JWT, el rol, el estado de la cuenta y la propiedad del recurso.
4. Express consulta o actualiza PostgreSQL mediante Drizzle.
5. Las mutaciones importantes emiten eventos Socket.IO y/o notificaciones push.
6. React Query actualiza o invalida las listas y detalles relacionados.
7. Los procesos programados revisan bloqueos, suscripciones, alertas, selfies y servicios pendientes.

### 2.3 Arranque del servidor

`server/index.ts` realiza, en términos generales, estas tareas:

- Comprueba el puerto.
- Conecta con PostgreSQL.
- Ejecuta migraciones.
- Crea el servidor HTTP.
- Inicializa Socket.IO.
- Monta Vite en desarrollo o sirve el frontend compilado en producción.
- Calienta configuración necesaria.
- Limpia selfies vencidas.
- Inicia el scheduler de bloqueos.
- Inicia el cron de suscripciones y tareas periódicas.
- Cierra HTTP, cron y conexiones de base de datos durante el apagado.

---

## 3. Roles y tipos de cuenta

### 3.1 Roles disponibles

El sistema tiene tres roles principales:

| Rol interno | Nombre visible habitual | Función |
|---|---|---|
| `client` | Cliente | Publica solicitudes, busca expertos y elige propuestas |
| `worker` | Experto/Trabajador | Ofrece servicios, recibe alertas y gestiona trabajos |
| `admin` | Administrador | Administra usuarios, catálogo, KYC, soporte y plataforma |

La cuenta puede tener además un `platformType`:

- `expertos`: servicios profesionales generales.
- `fletes`: solicitudes relacionadas con transporte, usando origen y destino.

### 3.2 Estados de cuenta

| Estado | Significado |
|---|---|
| `active` | Cuenta habilitada |
| `pending` | Cuenta pendiente de completar o activar según el flujo |
| `blocked` | Cuenta con acceso restringido por bloqueo administrativo |

La base también maneja estados de suspensión temporal para expertos:

- Suspensión por cancelaciones tardías.
- Suspensiones escalables de 3, 7 o 30 días según reincidencia.
- El bloqueo definitivo no se genera automáticamente; requiere acción administrativa.

### 3.3 Cambio temporal de rol

Una cuenta elegible puede cambiar temporalmente entre la vista de cliente y la vista de experto:

- El servidor emite un nuevo JWT.
- Se conserva el rol original para poder volver.
- El frontend recibe el evento `fixxer:role-switched`.
- Los administradores pueden usar vistas temporales de cliente o experto desde el panel.

El cambio de rol no elimina permisos de administrador ni debe considerarse una sustitución de autorización server-side.

---

## 4. Acceso, registro y autenticación

### 4.1 Registro

El registro permite:

- Crear cuenta como cliente.
- Crear cuenta como experto.
- Elegir plataforma cuando corresponda.
- Seleccionar categorías o especialidades profesionales.
- Registrar nombre, correo y contraseña.
- Iniciar el flujo de verificación.

Las contraseñas se almacenan con hash mediante `bcryptjs`; no se guardan como texto plano.

### 4.2 Inicio de sesión

El login:

- Comprueba correo y contraseña.
- Genera un JWT.
- Devuelve el usuario y sus datos de sesión.
- Devuelve el vencimiento de un bloqueo administrativo si existe.
- Permite la opción de recordar la sesión desde la interfaz.

Una cuenta bloqueada **sí puede iniciar sesión**, pero recibe una sesión restringida.

### 4.3 Verificación de correo

Funciones disponibles:

- Solicitar o reenviar verificación.
- Abrir un enlace/token de verificación.
- Marcar el correo como verificado.

### 4.4 Verificación telefónica

La confirmación telefónica usa Firebase:

- Se envía o valida un código.
- El servidor confirma la operación.
- `phoneVerified` y `phoneVerifiedAt` se actualizan.
- En cuentas normales, la aplicación puede forzar `/verify-phone` antes de permitir el uso operativo.

### 4.5 Recuperación de contraseña

El flujo incluye:

1. Solicitar recuperación con el correo.
2. Generar token temporal.
3. Recibir el enlace o token.
4. Establecer una nueva contraseña.
5. Invalidar o consumir el token.

Tiene un rate limit específico para impedir abuso.

### 4.6 Sesión e inactividad

- El cliente guarda el token de sesión en almacenamiento local.
- El usuario cacheado permite una hidratación rápida de la interfaz.
- El servidor usa JWT Bearer.
- La actividad de usuario se actualiza con una frecuencia limitada.
- La actividad de usuario se actualiza con una frecuencia limitada, pero la sesión no exige una selfie adicional por permanecer inactiva.
- La selfie de seguridad del experto se solicita al tomar un trabajo, antes de revelar la dirección y comenzar el desplazamiento.

### 4.7 Requisitos globales del frontend

Para usuarios no administradores:

- Un teléfono no verificado puede forzar la pantalla `/verify-phone`.
- La ausencia de avatar puede forzar la pantalla `/profile`.
- El administrador está exento de esos bloqueos de onboarding.

---

## 5. Funciones del cliente

### 5.1 Inicio

La pantalla de inicio del cliente puede mostrar:

- Saludo personalizado.
- Acceso rápido a **Solicitar servicio**.
- Acceso a **Mis servicios**.
- Servicios activos.
- Estado de cada solicitud.
- Alertas y novedades.
- Contenido comercial configurado por administración.
- Testimonios, preguntas frecuentes y planes de suscripción cuando están publicados.

Las tarjetas principales usan fondos sólidos y la identidad visual azul de Fixgo.

### 5.2 Categorías

El cliente puede:

- Ver grupos de categorías.
- Expandir un grupo.
- Ver categorías y subcategorías.
- Elegir una subcategoría.
- Ir directamente al formulario de publicación con la categoría preseleccionada.

La estructura actual es:

```text
Grupo de categorías
└── Categoría
    └── Subcategoría / especialidad
```

### 5.3 Búsqueda de expertos

En `/workers`, el cliente puede:

- Buscar por nombre.
- Buscar por habilidad.
- Filtrar por categoría.
- Ver expertos disponibles.
- Ver rating y cantidad de reseñas.
- Ver distancia.
- Ver habilidades.
- Identificar perfiles Pro mediante badge.
- Cambiar entre vista de lista y mapa.
- Consultar perfiles cercanos.

La búsqueda usa geolocalización cuando está disponible. Si no hay GPS, el frontend puede iniciar con coordenadas de Santiago; los resultados pueden ser imprecisos hasta obtener una ubicación real.

### 5.4 Perfil público del experto

El perfil de experto puede mostrar:

- Nombre y avatar.
- Biografía.
- Habilidades.
- Categorías.
- Rating.
- Reseñas.
- Disponibilidad.
- Portafolio.
- Certificaciones.
- Video de presentación.
- Badge de plan o nivel.
- Distancia aproximada.
- Botón para iniciar conversación directa cuando está permitido.

Desde determinados contextos también puede permitir:

- Abrir chat de negociación.
- Ver una propuesta.
- Aceptar una propuesta.
- Consultar la relación de confianza/favorito.

### 5.5 Publicar una solicitud

En `/services/new`, el cliente puede crear una solicitud con:

- Título.
- Descripción.
- Grupo/categoría.
- Subcategoría o especialidad.
- Dirección.
- Ubicación geográfica.
- Fecha o agenda.
- Urgencia.
- Fotografías.
- Tipo de inmueble: casa, departamento o local cuando corresponde.
- Presupuesto.
- Solicitud de cotización.
- Modalidad de pago declarada.
- Experto específico en solicitudes directas.

Opciones de presupuesto:

- Indicar un presupuesto aproximado.
- Solicitar cotización.
- El formulario evita combinar opciones incompatibles de presupuesto y cotización.

Opciones de pago declaradas:

- `cash`: efectivo.
- `transfer`: transferencia directa al experto.

Antes de publicar, la aplicación puede requerir:

- Aceptar términos.
- Tomar una selfie del cliente.
- Completar los campos obligatorios.
- Respetar el límite de publicaciones del plan.

Límites visibles actuales:

- Hasta 4 imágenes por solicitud.
- Hasta 10 MB por imagen.

### 5.6 Solicitud directa

El cliente puede iniciar una solicitud dirigida a un experto:

1. Abrir el perfil del experto o un contacto de confianza.
2. Elegir crear una solicitud directa.
3. Completar el formulario.
4. Enviar la solicitud con `directWorkerId`.
5. El experto puede aceptarla, rechazarla o convertirla en solicitud pública.

### 5.7 Mis contactos y servicios

En `/services`, el cliente puede:

- Ver contactos de confianza.
- Ver favoritos.
- Separar servicios activos y cerrados.
- Filtrar servicios.
- Abrir detalles.
- Abrir chat directo.
- Crear una solicitud directa.
- Ver el estado de cada relación o solicitud.

### 5.8 Mis trabajos

En `/mis-trabajos`, el cliente puede:

- Ver solicitudes propias.
- Ver estados de cada servicio.
- Editar solicitudes en fases permitidas.
- Eliminar solicitudes abiertas o pendientes.
- Ver propuestas recibidas.
- Elegir un experto.
- Rechazar propuestas.
- Negociar.
- Cancelar.
- Iniciar o continuar el servicio.
- Confirmar la realización.
- Revisar el cargo de cancelación si corresponde.
- Consultar información bancaria del experto cuando el servicio se paga por transferencia y está en la condición permitida.
- Abrir chat o llamada.

### 5.9 Detalle de servicio

El detalle muestra, según el estado:

- Título y descripción.
- Categoría y subcategoría.
- Dirección o ubicación.
- Origen y destino para fletes.
- Fecha programada.
- Urgencia.
- Imágenes.
- Trabajador asignado.
- Propuestas.
- Estado de negociación.
- Mapa.
- Seguimiento del experto.
- Chat.
- Indicador de escritura.
- Llamada.
- Acciones de cancelación.
- Acciones de confirmación.
- Reseña posterior.

Los servicios finalizados o cancelados no permiten continuar escribiendo; el historial puede quedar visible en modo de solo lectura.

### 5.10 Cancelación desde el cliente

El cliente puede cancelar en las fases permitidas. La interfaz:

- Muestra el motivo o aviso de cancelación.
- Informa si existe una posible visita técnica.
- Distingue la ventana gratuita de 10 minutos.
- Permite consultar el cargo generado.
- Permite adjuntar comprobante.
- Permite disputar el cargo.

La ventana gratuita se fija cuando ambas partes confirman el acuerdo mediante el flujo correspondiente:

- Duración: 10 minutos.
- Durante esa ventana el experto no recibe sanción por cancelar.
- La dirección del experto puede permanecer oculta durante la ventana.
- Fuera de la ventana puede generarse un cargo informativo de visita técnica.

### 5.11 Confirmación de realización

El cierre utiliza confirmación doble:

- El cliente marca que el servicio fue realizado.
- El experto marca que el servicio fue realizado.
- Si ambos confirman, el servicio puede cerrarse.
- Si solo una parte confirma, la otra tiene 24 horas para confirmar.
- Después de 24 horas, el motor puede completar automáticamente.

La lógica de aplicación también conserva textos históricos como “trabajo completado”, aunque la terminología operativa del proyecto busca hablar de conexión/servicio y no de intermediación de pago.

### 5.12 Reseñas

El cliente puede:

- Calificar al experto después de la condición de finalización.
- Escribir una opinión.
- Consultar sus valoraciones permitidas.
- Ver la reputación del experto.

El sistema evita duplicar determinadas reseñas por la combinación de servicio y cliente.

### 5.13 Notificaciones

El cliente puede:

- Ver notificaciones activas.
- Ver notificaciones finalizadas.
- Abrir el recurso relacionado.
- Marcar una notificación como leída.
- Marcar todas como leídas.
- Recibir propuestas.
- Recibir avisos de cambios de servicio.
- Recibir avisos de llamadas.
- Recibir avisos de KYC o suscripción.

Las notificaciones de servicios validan que el servicio relacionado siga siendo accesible antes de navegar.

### 5.14 Perfil del cliente

El cliente puede gestionar:

- Nombre.
- Biografía.
- Avatar.
- Teléfono y verificación.
- Preferencias.
- Notificaciones.
- Soporte.
- Suscripción.
- Reseñas.
- Cambio temporal a vista de experto si la cuenta lo permite.

---

## 6. Funciones del experto o trabajador

### 6.1 Onboarding profesional

El flujo de onboarding orienta al experto para completar:

- Perfil.
- Avatar.
- Biografía.
- Habilidades.
- Categorías.
- Categoría principal.
- Radio de servicio.
- Radio de alertas cuando el plan lo permite.
- Datos bancarios informativos.
- KYC.
- Portafolio.
- Certificaciones.
- Video de presentación.

### 6.2 KYC obligatorio

El experto debe tener KYC aprobado para activar disponibilidad y participar en acciones operativas que lo requieren.

Estados:

```text
not_submitted → pending → approved
                         └→ rejected
```

Si intenta conectarse sin KYC aprobado, la interfaz lo dirige a `/kyc`.

### 6.3 Inicio del experto

El home del experto incluye:

- Mapa de solicitudes.
- Solicitudes cercanas.
- Estado de conexión.
- Botón para conectarse o desconectarse.
- Indicador “EN LÍNEA — Recibiendo solicitudes”.
- Bandeja de solicitudes.
- Filtros y ordenamiento.
- Distancia.
- Urgencia.
- Tiempo desde la publicación.
- Categoría.
- Cliente.
- Dirección disponible según las reglas del servicio.

Ordenamiento habitual:

- Urgencia.
- Distancia.
- Antigüedad.

### 6.4 Disponibilidad

El experto puede:

- Activar disponibilidad.
- Desactivarla.
- Recibir solicitudes mientras está disponible.
- Compartir su ubicación.

Activar disponibilidad exige:

- Cuenta activa.
- Rol de experto.
- KYC aprobado.
- Condiciones del plan.

### 6.5 Alertas de solicitudes

El motor de solicitudes maneja:

- Alertas inmediatas para trabajadores prioritarios según el plan.
- Alertas de expertos cercanos.
- Alertas pasivas a trabajadores activos de la categoría.
- Modal “Nuevo contacto cerca”.
- Toast o push.
- Acciones de ver, ignorar o saltar.
- Seguimiento de qué trabajador vio una alerta.

El experto puede descartar solicitudes mediante swipe en la interfaz móvil.

### 6.6 Propuestas

El experto puede crear una propuesta con:

- Mensaje.
- Tiempo estimado.
- Datos de su perfil.
- Selfie de seguridad cuando corresponde.
- Información necesaria para la negociación.

Requisitos habituales:

- KYC aprobado.
- Ser elegible para el servicio.
- No estar suspendido.
- Tener los datos bancarios completos cuando el escenario de cancelación tardía los exige.

La propuesta puede:

- Quedar pendiente.
- Ser aceptada.
- Ser rechazada.
- Recibir una contrapropuesta.
- Ser negociada por chat.

### 6.7 Trabajos asignados

El experto puede:

- Ver solicitudes asignadas.
- Aceptar o iniciar según el flujo.
- Conversar con el cliente.
- Compartir ubicación durante `in_progress`.
- Marcar el servicio como realizado.
- Cancelar con motivo.
- Confirmar la realización.
- Calificar al cliente.

### 6.8 Perfil profesional

El experto puede editar:

- Nombre.
- Biografía.
- Habilidades.
- Avatar.
- Categorías profesionales.
- Categoría principal.
- Radio de servicio.
- Radio de alertas.
- Tarifa de visita informativa.
- Video de presentación.
- Portafolio.
- Certificaciones.

Los límites de cantidad de categorías y funciones de radio dependen del plan.

### 6.9 Valoraciones recibidas

En `/valoraciones`, el experto puede:

- Ver opiniones recibidas.
- Ver rating.
- Consultar la reputación acumulada.
- Identificar valoraciones asociadas a servicios permitidos.

### 6.10 Suspensiones automáticas

Las cancelaciones tardías pueden producir:

- Registro de motivo.
- Conteo de reincidencia.
- Suspensión temporal de 3 días.
- Suspensión temporal de 7 días.
- Suspensión temporal de 30 días.
- Bloqueo de elegibilidad para nuevas propuestas.

La suspensión automática no equivale a un bloqueo administrativo indefinido.

---

## 7. Funciones del administrador

### 7.1 Dashboard administrativo

El dashboard puede mostrar:

- Total de usuarios.
- Total de expertos.
- Expertos activos.
- Servicios en diferentes estados.
- Servicios pendientes.
- Servicios completados o archivados según la métrica implementada.
- Tasa de finalización.
- Distribuciones y gráficos.
- Accesos rápidos.
- Widget de tickets.
- Cambio temporal de rol.

> Las métricas y nombres visibles deben interpretarse junto con las reglas actuales del proyecto, que buscan evitar métricas financieras de intermediación.

### 7.2 Administración de usuarios

En `/admin/users`, el administrador puede:

- Buscar usuarios.
- Filtrar por rol.
- Filtrar por estado.
- Paginar.
- Exportar CSV.
- Abrir el detalle.
- Cambiar estado permitido.
- Bloquear.
- Desbloquear.
- Revisar suspensiones.
- Limpiar una suspensión.
- Eliminar según las reglas de la operación.

### 7.3 Detalle de usuario

El detalle puede incluir:

- Datos de perfil.
- Rol.
- Estado.
- Rating de cliente.
- Rating de experto.
- Número de reseñas.
- Estado KYC.
- Plan activo.
- Servicios relacionados.
- Reseñas.
- Estadísticas.
- Historial de bloqueos.
- Acciones de bloqueo, desbloqueo, suspensión o eliminación.

### 7.4 Cuentas bloqueadas

En `/admin/blocked-users`, el administrador puede:

- Ver cuentas bloqueadas.
- Ver la razón.
- Ver el administrador que aplicó el bloqueo.
- Ver la fecha de inicio.
- Ver el vencimiento.
- Ver bloqueos indefinidos.
- Desbloquear manualmente.
- Consultar historial.

Duraciones permitidas:

- 24 horas.
- 7 días.
- 30 días.
- Indefinido.

Cuando vence un bloqueo temporal:

- El scheduler reactiva la cuenta.
- La disponibilidad se deja desactivada.
- Se invalida la caché de autenticación.
- El cliente reconsulta `/auth/me`.

### 7.5 Restricción de cuentas bloqueadas

Una cuenta bloqueada:

- Puede iniciar sesión.
- Puede consultar su estado.
- Puede editar su perfil propio.
- Puede subir recursos propios de perfil.
- Puede mantener portfolio y certificaciones propias.
- Puede abrir tickets de soporte.
- No puede publicar solicitudes.
- No puede buscar o aceptar trabajos.
- No puede enviar mensajes operativos.
- No puede enviar ofertas.
- No puede cambiar de rol.
- No puede acceder a operaciones normales de servicios.

La restricción existe en el servidor, no solo en el menú de la interfaz.

### 7.6 Gestión de KYC

En `/admin/kyc`, el administrador puede:

- Ver documentos pendientes.
- Filtrar por estado.
- Abrir metadatos y archivos.
- Aprobar documentos.
- Rechazar documentos.
- Escribir un motivo de rechazo.
- Actualizar el estado KYC del usuario.
- Emitir notificación de cambio.

### 7.7 Selfies de seguridad

En `/admin/security-selfies`, el administrador puede:

- Ver metadata de selfies.
- Ver propósito.
- Ver usuario relacionado.
- Ver servicio o propuesta relacionada.
- Ver estado disponible o purgado.
- Descargar una selfie mientras no haya expirado.

Las selfies purgadas ya no se pueden descargar y pueden responder como recurso expirado.

### 7.8 Categorías y catálogo

En `/admin/categories`, el administrador puede:

- Crear grupos.
- Editar grupos.
- Eliminar grupos.
- Reordenar grupos.
- Crear categorías.
- Editar categorías.
- Eliminar categorías.
- Crear subcategorías.
- Editar subcategorías.
- Eliminar subcategorías.
- Cambiar iconos.
- Cambiar orden.
- Asociar plataformas.

### 7.9 Contenido del sitio

En `/admin/site-settings`, el administrador puede editar el contenido configurable de la landing:

- Textos para clientes.
- Textos para profesionales.
- Títulos.
- Descripciones.
- Llamadas a la acción.
- Preguntas frecuentes.
- Footer.
- Secciones comerciales.
- Contenido visible por plataforma.

La lectura de determinadas configuraciones del sitio puede ser pública; la escritura requiere administrador.

### 7.10 Tickets de soporte

El administrador puede:

- Ver todos los tickets.
- Filtrar o buscar.
- Abrir el historial.
- Responder.
- Cambiar el estado.
- Atender consultas de cuentas bloqueadas.

### 7.11 Planes y cupones

El administrador puede:

- Crear o editar planes.
- Activar/desactivar planes.
- Ordenar planes.
- Definir funciones en el JSON de features.
- Consultar suscripciones.
- Conceder planes.
- Editar suscripciones.
- Crear cupones.
- Editar cupones.
- Desactivar cupones.
- Eliminar cupones.
- Definir descuento porcentual o fijo.
- Definir máximo de usos.
- Definir planes válidos.
- Definir intervalos válidos.
- Definir vencimiento.

### 7.12 Métricas SaaS

El panel permite consultar:

- Suscripciones activas.
- Estados de suscripciones.
- Pagos de suscripción.
- Ingresos de suscripción por periodo.
- Métricas de planes.
- Uso de cupones.

### 7.13 Cancelaciones

En `/admin/cancellations`, el administrador puede:

- Ver cargos de cancelación.
- Ver cliente y experto.
- Ver motivo.
- Ver snapshot bancario permitido.
- Ver comprobante.
- Ver disputa.
- Agregar nota interna.
- Resolver como `settled`.
- Resolver como `voided`.

### 7.14 Logs

En `/admin/logs`, el administrador puede:

- Buscar logs.
- Filtrar por nivel.
- Consultar estadísticas.
- Ver registros recientes.
- Usar el stream SSE.
- Eliminar logs según permisos.

Los logs deben tratarse como información potencialmente sensible.

### 7.15 Comisión heredada

Existe una pantalla y API de configuración de comisión. Sin embargo:

- La comisión corresponde al modelo anterior.
- El modelo actual prohíbe comisiones por servicio.
- El administrador no debe usar esta función para cobrar o descontar dinero de servicios entre usuarios.
- Debe revisarse antes de producción para evitar contradicción con el modelo SaaS.

---

## 8. Navegación y rutas del frontend

Las rutas se definen principalmente en `client/App.tsx` usando Wouter.

### 8.1 Rutas públicas y de acceso

| Ruta | Función |
|---|---|
| `/` | Landing pública o inicio operativo según sesión |
| `/login` | Inicio de sesión |
| `/register` | Registro de cliente o experto |
| `/forgot-password` | Solicitar recuperación |
| `/reset-password` | Cambiar contraseña con token |
| `/verify-email` | Verificar correo |
| `/verify-phone` | Verificar teléfono |
| `/terms` | Términos y condiciones |
| `/privacy` | Política de privacidad |
| `/cookies` | Política de cookies |
| `/firmas` | Documentos y firmas |
| cualquier otra | Página de no encontrado |

### 8.2 Rutas de usuario

| Ruta | Función |
|---|---|
| `/services` | Contactos, favoritos y servicios del usuario |
| `/services/new` | Crear una solicitud |
| `/services/:id` | Detalle de servicio |
| `/workers` | Buscar expertos |
| `/workers/:id` | Perfil público del experto |
| `/categories` | Explorar catálogo |
| `/profile` | Perfil y configuración |
| `/notifications` | Notificaciones |
| `/support` | Centro de soporte |
| `/mis-trabajos` | Solicitudes y trabajos |
| `/valoraciones` | Valoraciones recibidas |
| `/kyc` | KYC del experto |

### 8.3 Rutas de suscripción

| Ruta | Función |
|---|---|
| `/planes` | Ver planes por rol e intervalo |
| `/checkout/:planCode` | Aplicar cupón y pagar plan |
| `/mi-plan` | Ver plan, vigencia, historial y cancelación |

### 8.4 Rutas administrativas

| Ruta | Función |
|---|---|
| `/admin` | Dashboard |
| `/admin/users` | Usuarios |
| `/admin/users/:id` | Detalle de usuario |
| `/admin/blocked-users` | Cuentas bloqueadas |
| `/admin/categories` | Categorías y subcategorías |
| `/admin/commission` | Configuración heredada de comisión |
| `/admin/site-settings` | Contenido del sitio |
| `/admin/kyc` | Revisión KYC |
| `/admin/security-selfies` | Revisión de selfies |
| `/admin/tickets` | Soporte |
| `/admin/coupons` | Cupones |
| `/admin/subscriptions` | Suscripciones |
| `/admin/subscription-stats` | Métricas SaaS |
| `/admin/plans` | Planes |
| `/admin/logs` | Logs |
| `/admin/cancellations` | Cargos y cancelaciones |

### 8.5 Navegación de escritorio

El layout de escritorio incluye:

- Header sticky.
- Logo Fixgo.
- Estado de conexión.
- Notificaciones.
- Logout.
- Enlaces principales.
- Sidebar administrativa.

La navegación cambia por rol.

### 8.6 Navegación móvil

La bottom navigation incluye normalmente:

Cliente:

- Inicio.
- Contactos.
- Categorías.
- Mis trabajos.
- Perfil.

Experto:

- Inicio.
- Contactos.
- Mi plan.
- Mis trabajos.
- Perfil.

Administrador:

- Panel.
- Usuarios.
- KYC.
- Selfies.
- Soporte.
- “Más”.

El menú “Más” del administrador contiene accesos secundarios a:

- Categorías.
- Cancelaciones.
- Sitio.
- Cupones.
- Suscripciones.
- Métricas.
- Logs.
- Cuentas bloqueadas.

---

## 9. Estados del negocio

### 9.1 Estados de servicio

```text
pending
  ↓
alerting
  ↓
open
  ↓
accepted
  ↓
in_progress
  ↓
completed
```

Desde varias fases se puede terminar en:

```text
cancelled
```

Descripción:

| Estado | Significado |
|---|---|
| `pending` | Solicitud recién creada o pendiente de motor |
| `alerting` | Se están enviando alertas a expertos |
| `open` | Disponible para expertos elegibles |
| `accepted` | Hay una conexión o aceptación |
| `in_progress` | Servicio iniciado |
| `completed` | Cierre confirmado o autocompletado |
| `cancelled` | Cancelado por una parte o por una regla |

### 9.2 Solicitud directa

Una solicitud directa puede:

- Ser aceptada por el experto.
- Ser rechazada.
- Continuar a conversación.
- Convertirse en pública.

### 9.3 Estados de propuesta

Según el código y las vistas, pueden observarse:

- `pending`.
- `open_chat`.
- `worker_accepted`.
- `accepted`.
- `rejected`.
- `countered`.

Flujo de negociación:

```text
pending → accepted
        → rejected
        → countered → accepted
                    → rejected
```

### 9.4 Estados de KYC

```text
not_submitted → pending → approved
                         └→ rejected
```

### 9.5 Estados de certificación

- En revisión.
- Verificada.
- Rechazada.

### 9.6 Estados de suscripción

El schema contempla:

- `trialing`.
- `active`.
- `past_due`.
- `cancelled`.
- `expired`.

La cancelación normalmente detiene la renovación y conserva acceso hasta el fin del periodo actual.

### 9.7 Estados de pago de suscripción

El pago de suscripción puede iniciar como:

- `pending`.
- Aprobado/completado según confirmación Webpay.
- Rechazado.

### 9.8 Estados de cargo por cancelación

Flujo habitual:

```text
open → proof_submitted → settled
  └→ disputed → settled
                 └→ voided
```

Descripción:

- `open`: cargo abierto.
- `proof_submitted`: cliente adjuntó comprobante.
- `disputed`: existe disputa.
- `settled`: resuelto como pagado/recibido.
- `voided`: anulado por administración.

---

## 10. Chat, contactos y comunicaciones

### 10.1 Chat de servicio

El chat de servicio permite:

- Mensajes de texto.
- Imágenes o adjuntos según flujo.
- Indicador de escritura.
- Estado leído/no leído.
- Chat de propuesta.
- Chat durante el servicio.
- Mensajes de confirmación de acuerdo.
- Inserción de datos bancarios oficiales en los escenarios permitidos.

La conversación está vinculada a:

- Servicio.
- Cliente.
- Experto asignado o hilo del experto.

Todo mensaje debe asociarse con `workerId` cuando el hilo de servicio lo requiere; si se omite, puede desaparecer del historial del hilo correcto.

Los chats de servicios `completed` o `cancelled` quedan cerrados o de solo lectura.

### 10.2 Cifrado E2E

El cliente implementa criptografía con:

- ECDH P-256.
- AES-GCM.
- Claves públicas por usuario.
- Respaldo cifrado de la llave privada.
- Dispositivos confiables.

El servidor actúa principalmente como transporte y almacena el contenido cifrado del chat de servicio.

Reglas:

- No rotar una clave pública sin preservar el respaldo de la privada.
- Asociar la clave local con el `userId` correcto.
- No generar una nueva clave cuando el estado de sincronización sea incierto.
- Si el cliente no puede descifrar, mostrar mensaje cifrado en lugar de inventar contenido.
- Administración no puede leer el contenido de los chats E2E.

### 10.3 Chat directo

El chat directo funciona entre contactos o participantes autorizados:

- Crear u obtener una conversación.
- Leer hasta 200 mensajes.
- Enviar mensaje.
- Marcar como leído.
- Mostrar typing.

Solo los dos participantes deben acceder a la conversación.

> Limitación actual: el módulo de mensajes directos conserva un campo `encrypted` opcional y puede aceptar contenido no cifrado. Esto debe revisarse si la política exige E2E obligatorio también para chats directos.

### 10.4 Favoritos y contactos de confianza

Funciones:

- Crear favorito.
- Eliminar favorito.
- Consultar favoritos.
- Comprobar si un usuario está en favoritos.
- Usar un favorito para una solicitud directa.
- Abrir conversación directa según autorización.

### 10.5 Bloqueo entre usuarios

Un usuario puede bloquear a otro:

- El bloqueo se registra en ambas direcciones.
- Impide la relación o contacto según el flujo.
- Puede eliminarse desde la aplicación.
- Se puede consultar si existe bloqueo en cualquier dirección.

---

## 11. Llamadas de voz y WebRTC

### 11.1 Funciones

El sistema incluye:

- Llamada entrante.
- Llamada saliente.
- Llamada activa.
- Contestar.
- Rechazar.
- Silenciar micrófono.
- Colgar.
- Temporizador.
- Indicador de señal.
- Llamada perdida.
- Notificación push.

### 11.2 Señalización

Socket.IO transporta:

- `call:offer`.
- `call:answer`.
- `call:ice`.
- `call:end`.
- `call:reject`.

Las llamadas pendientes y sus timers están en memoria del proceso.

### 11.3 STUN/TURN

El endpoint de ICE elige, por prioridad:

1. Credenciales dinámicas de Metered.
2. TURN estático configurado.
3. OpenRelay como último fallback no garantizado.

Sin TURN fiable, las llamadas pueden fallar en:

- Datos móviles.
- NAT simétrico.
- Redes corporativas.
- Redes con firewall estricto.

Un servidor coturn propio requiere VPS con IP pública y rango UDP; no debe asumirse que funciona directamente en Replit o Railway.

### 11.4 iOS cerrado

La llamada con la aplicación cerrada usa:

- PushKit.
- APNs VoIP.
- CallKit.
- Código Swift nativo.
- Plugin Capacitor.

Los eventos de respuesta pueden llegar antes de que cargue JavaScript, por lo que se usa buffer nativo y `retainUntilConsumed`.

### 11.5 Rechazo nativo

El endpoint de rechazo nativo utiliza un JWT especial `call_reject`, no el Bearer normal, para permitir responder desde el contexto de llamada.

---

## 12. Ubicación, mapas y seguimiento

### 12.1 Funciones de ubicación

- Solicitar permiso de ubicación.
- Detectar GPS apagado.
- Abrir ajustes del dispositivo.
- Reintentar al volver a la aplicación.
- Obtener posición real.
- Compartir ubicación del experto durante un servicio.
- Mostrar trabajadores cercanos.
- Mostrar rutas y marcadores.
- Recentrar mapa cuando existe fix GPS real.

### 12.2 Mapas disponibles

Componentes de mapa:

- `native-map.tsx`.
- `workers-map.tsx`.
- `service-location-map.tsx`.
- `service-tracking-map.tsx`.
- `worker-route-map.tsx`.

Según la plataforma se usa Google Maps web, Leaflet o Google Maps nativo.

### 12.3 Comportamiento sin GPS

- El mapa puede mostrar servicios sin mostrar la ubicación exacta del usuario.
- El botón de recentrado puede no hacer nada hasta obtener un fix real.
- La búsqueda inicial puede utilizar Santiago como fallback.
- Las distancias y resultados pueden ser incorrectos sin permiso o señal.

---

## 13. Selfies, identidad y privacidad

### 13.1 Selfie del cliente

La publicación de una solicitud puede requerir:

- Abrir cámara.
- Tomar selfie.
- Validar la captura.
- Guardarla asociada al servicio.

### 13.2 Selfie del experto

Una propuesta o un trabajo puede requerir:

- Selfie de seguridad.
- Asociación con usuario, servicio o propuesta.
- Registro del propósito.
- Validación del lado servidor.

Propósitos:

- `proposal`.
- `service`.
- `manual` (selfie de seguridad sin asociación específica).

### 13.3 Retención

Las selfies de seguridad son temporales:

- Se purgan cuando expira su ventana de retención.
- La purga ocurre al iniciar y durante tareas programadas.
- Una selfie purgada no debe poder descargarse.
- La metadata puede permanecer para auditoría.

### 13.4 Tipos KYC

El flujo puede contemplar:

- Cédula.
- Pasaporte.
- Licencia.
- Antecedentes.
- Selfie vinculada al proceso.

Los documentos KYC son sensibles y no deben exponerse en rutas públicas sin autorización.

---

## 14. Suscripciones y monetización

### 14.1 Suscripciones de plataforma

La plataforma tiene planes por rol:

- Planes de cliente.
- Planes de experto.
- Periodicidad mensual.
- Periodicidad anual.
- Plan gratuito.
- Planes premium/pro/pro+ según las filas configuradas.

Cada plan puede tener un JSON de funciones y límites:

- Publicaciones por mes.
- Número de categorías.
- Radio de alertas.
- Visibilidad o prioridad.
- Otras capacidades habilitadas.

La función frontend `useSubscription` permite comprobar:

- `can(feature)`.
- `limit(feature)`.

### 14.2 Checkout

El checkout permite:

- Seleccionar un plan.
- Elegir intervalo.
- Introducir cupón.
- Validar descuento.
- Activar plan gratuito.
- Crear una transacción Webpay para plan pagado.
- Confirmar el retorno de Webpay.
- Actualizar la suscripción.

### 14.3 Cupones

Un cupón puede tener:

- Código.
- Descuento porcentual.
- Descuento fijo.
- Máximo de usos.
- Cantidad utilizada.
- Planes válidos.
- Intervalos válidos.
- Fecha de expiración.
- Estado activo/inactivo.

### 14.4 Cancelación de suscripción

Cancelar una suscripción:

- Detiene la renovación futura.
- Conserva acceso hasta `currentPeriodEnd`.
- Registra fecha de cancelación.
- No equivale a borrar la cuenta.

### 14.5 Pagos prohibidos

No se debe implementar ni activar:

- Billetera interna.
- Saldo recargable.
- Créditos para comprar servicios.
- Pago del servicio cliente-experto dentro de Fixgo.
- Retención de dinero por Fixgo.
- Comisión por trabajo completado.
- Payout automático del servicio.
- PayPal para el modelo actual.

La función `triggerWorkerPayout` es un stub sin operación real.

### 14.6 Datos heredados

Todavía aparecen en schema/migraciones antiguos:

- `payments`.
- `balance_transactions`.
- `payouts`.
- `commission_config`.
- Campos de saldo.
- Campo de email PayPal.
- Campos históricos de precio.

Estos elementos no representan el modelo operativo aprobado y deben limpiarse o mantenerse claramente aislados.

---

## 15. Cancelaciones, cargos y sanciones

### 15.1 Ventana gratuita

- Se establece al confirmar el acuerdo.
- Dura 10 minutos.
- La dirección del experto puede ocultarse durante ese periodo.
- El experto no recibe sanción por cancelar dentro del periodo.

### 15.2 Cargo de visita técnica

Fuera de la ventana gratuita puede abrirse un cargo:

- Cliente como responsable potencial.
- Experto como destinatario.
- Snapshot de datos bancarios.
- Comprobante adjunto.
- Disputa.
- Confirmación de recepción.
- Resolución administrativa.

Fixgo no procesa ni verifica el dinero. Solo registra el estado informativo del proceso.

### 15.3 Sanciones a expertos

Las cancelaciones tardías pueden aumentar:

- Conteo de sanciones.
- Suspensión de 3 días.
- Suspensión de 7 días.
- Suspensión de 30 días.

El bloqueo indefinido es administrativo, no una consecuencia automática.

---

## 16. Notificaciones y tiempo real

### 16.1 Socket.IO

La conexión Socket.IO:

- Se autentica con JWT en `handshake.auth.token`.
- Une al usuario a `user_<id>`.
- Permite salas de servicio.
- Permite salas de conversación directa.
- Mantiene presencia.
- Se recupera después de reconexiones.

### 16.2 Salas

Eventos de entrada/salida:

- `join_service`.
- `leave_service`.
- `join_direct`.
- `leave_direct`.
- `join_user`.
- `leave_user`.

Las salas de servicio pueden distinguir el hilo del experto para que el mensaje llegue a la conversación correcta.

### 16.3 Eventos de presencia y estado

- `app:state`.
- `query_presence`.
- `unsubscribe_presence`.
- `disconnect`.
- `service:view_start`.
- `service:view_end`.

### 16.4 Eventos de chat

- `typing`.
- `stop_typing`.
- `direct_typing`.
- `direct_stop_typing`.
- `new_message`.
- `messages_read`.
- `user_typing`.

### 16.5 Eventos de servicio y propuestas

El sistema emite actualizaciones para:

- Nuevo servicio.
- Servicio disponible.
- Servicio tomado.
- Servicio actualizado.
- Servicio cancelado.
- Propuesta creada.
- Propuesta aceptada.
- Propuesta rechazada.
- Contrapropuesta.
- Cambio de estado.
- Confirmación de realización.

Cada ruta de escritura debe emitir su evento; esto incluye rutas REST, motor de servicios, cron y handlers de alertas.

### 16.6 Eventos de ubicación

- `worker_location`.
- `worker:live_location`.

### 16.7 Push

El sistema soporta:

- Firebase Cloud Messaging para web y app.
- Token FCM nativo.
- Token FCM web separado.
- Token VoIP para iOS.
- Notificaciones de solicitudes.
- Notificaciones de mensajes.
- Notificaciones de llamadas.
- Notificaciones KYC.
- Notificaciones de suscripción.
- Notificaciones de bloqueo o cambios de cuenta.

---

## 17. API REST completa

Todas las rutas se montan bajo:

```text
/api
```

Cuando se indica “auth”, se requiere:

```http
Authorization: Bearer <JWT>
```

### 17.1 Autenticación — `auth.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `POST` | `/auth/register` | Público | Registrar cuenta |
| `POST` | `/auth/login` | Público | Iniciar sesión |
| `POST` | `/auth/logout` | Auth | Cerrar sesión stateless |
| `POST` | `/auth/phone/confirm` | Auth | Confirmar teléfono mediante Firebase |
| `GET` | `/auth/me` | Auth | Usuario actual, rol, estado y métricas |
| `POST` | `/auth/switch-role` | Auth | Cambiar rol operativo |
| `GET` | `/auth/verify-email` | Público/token | Verificar correo |
| `POST` | `/auth/resend-verification` | Público/Auth | Reenviar verificación |
| `POST` | `/auth/forgot-password` | Público | Solicitar recuperación |
| `POST` | `/auth/reset-password` | Token | Cambiar contraseña |

### 17.2 Usuarios — `users.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/users` | Admin | Listar, buscar y paginar usuarios |
| `GET` | `/users/:id` | Auth | Consultar usuario |
| `PATCH` | `/users/:id` | Propio/Admin | Actualizar perfil |
| `PATCH` | `/users/:id/status` | Admin | Cambiar estado permitido |
| `POST` | `/users/:id/clear-suspension` | Admin | Limpiar suspensión |
| `GET` | `/workers/nearby` | Auth | Buscar expertos cercanos |
| `PATCH` | `/workers/:id/availability` | Propio worker/Admin | Cambiar disponibilidad |
| `GET` | `/workers/:id/categories` | Propio/Admin | Consultar categorías |
| `PUT` | `/workers/:id/categories` | Propio/Admin | Reemplazar categorías |

### 17.3 Servicios — `services.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/services` | Auth | Listar servicios con filtros |
| `POST` | `/services` | Cliente/Auth | Crear solicitud |
| `GET` | `/services/:id` | Participante/Admin | Ver detalle |
| `PATCH` | `/services/:id` | Propietario/Participante/Admin | Editar servicio |
| `DELETE` | `/services/:id` | Cliente propietario/Admin | Eliminar en fases permitidas |
| `POST` | `/services/:id/clear-budget` | Propietario/Admin | Limpiar presupuesto |
| `POST` | `/services/:id/accept` | Actor autorizado | Aceptar |
| `POST` | `/services/:id/start` | Actor autorizado | Iniciar |
| `POST` | `/services/:id/reject-direct` | Worker | Rechazar solicitud directa |
| `POST` | `/services/:id/convert-to-public` | Worker/actor autorizado | Convertir en pública |
| `POST` | `/services/:id/cancel` | Actor autorizado | Cancelar |
| `POST` | `/services/:id/requote` | Actor autorizado | Crear recotización |
| `POST` | `/services/:id/requote/accept` | Actor autorizado | Aceptar recotización |
| `POST` | `/services/:id/requote/reject` | Actor autorizado | Rechazar recotización |
| `POST` | `/services/:id/complete` | Cliente | Confirmar realización |
| `POST` | `/services/:id/worker-complete` | Worker | Confirmar realización |
| `GET` | `/services/:id/transfer-info` | Participante | Ver datos bancarios permitidos |
| `GET` | `/services/available` | Worker | Listar solicitudes públicas |
| `POST` | `/services/:id/relaunch` | Cliente/Admin | Relanzar fase activa |
| `POST` | `/services/:id/background` | Cliente/Admin | Pasar a bandeja general |

### 17.4 Propuestas — `proposals.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/proposals/my` | Worker | Propuestas propias |
| `GET` | `/services/:id/proposals` | Propietario/Worker/Admin | Propuestas del servicio |
| `POST` | `/services/:id/proposals` | Worker | Crear propuesta |
| `POST` | `/proposals/:id/accept` | Cliente | Aceptar propuesta |
| `POST` | `/services/:id/worker-accept` | Worker | Aceptar/asignar |
| `POST` | `/proposals/:id/reject` | Actor autorizado | Rechazar |
| `POST` | `/proposals/:id/counter` | Actor autorizado | Crear contrapropuesta |
| `POST` | `/proposals/:id/accept-counter` | Actor autorizado | Aceptar contrapropuesta |
| `POST` | `/proposals/:id/reject-counter` | Actor autorizado | Rechazar contrapropuesta |

### 17.5 Mensajes de servicio — `messages.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/services/:serviceId/messages` | Participante | Historial |
| `POST` | `/services/:serviceId/messages` | Participante | Enviar mensaje |
| `POST` | `/services/:serviceId/typing` | Participante | Escribir indicador |
| `PATCH` | `/services/:serviceId/messages/read` | Participante | Marcar leído |
| `GET` | `/messages/keys/backup` | Propio | Recuperar backup E2E |
| `POST` | `/messages/keys/backup/trust-device` | Propio | Confiar dispositivo |
| `GET` | `/messages/keys/:userId` | Auth | Obtener clave pública |
| `POST` | `/messages/keys` | Propio | Registrar clave pública |
| `DELETE` | `/messages/keys` | Propio | Eliminar clave propia |

### 17.6 Mensajes directos — `direct-messages.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/direct/conversation/:otherUserId` | Participante autorizado | Obtener/crear conversación |
| `GET` | `/direct/conversation/:id/messages` | Participante | Listar hasta 200 mensajes |
| `POST` | `/direct/conversation/:id/messages` | Participante | Enviar mensaje |
| `PATCH` | `/direct/conversation/:id/messages/read` | Participante | Marcar mensajes leídos |

### 17.7 Notificaciones — `notifications.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/notifications` | Auth | Listar notificaciones |
| `POST` | `/notifications/mark-all-read` | Auth | Marcar todas como leídas |
| `PATCH` | `/notifications/:id/read` | Auth | Marcar una como leída |
| `POST` | `/notifications/fcm-token` | Auth | Registrar token FCM |
| `DELETE` | `/notifications/fcm-token` | Auth | Eliminar token FCM |
| `POST` | `/notifications/voip-token` | Auth | Registrar token VoIP |
| `DELETE` | `/notifications/voip-token` | Auth | Eliminar token VoIP |

### 17.8 Alertas — `alert-sessions.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `PATCH` | `/alert-sessions/:serviceId/skip` | Worker con sesión | Saltar alerta |
| `PATCH` | `/alert-sessions/:serviceId/view` | Worker con sesión | Marcar alerta vista |

### 17.9 Llamadas — `calls.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/calls/ice-servers` | Auth | Obtener STUN/TURN |
| `POST` | `/calls/reject` | JWT especial | Rechazo nativo de llamada |

### 17.10 KYC — `kyc.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `POST` | `/kyc/submit` | Worker | Enviar documento |
| `GET` | `/kyc/status` | Auth | Consultar KYC propio |
| `GET` | `/admin/kyc` | Admin | Listar solicitudes |
| `POST` | `/admin/kyc/:id/approve` | Admin | Aprobar |
| `POST` | `/admin/kyc/:id/reject` | Admin | Rechazar con motivo |

### 17.11 Selfies — `security-selfies.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `POST` | `/security-selfies` | Auth | Registrar selfie |
| `GET` | `/admin/security-selfies` | Admin | Listar metadata |
| `GET` | `/admin/security-selfies/:id/file` | Admin | Descargar selfie no purgada |

### 17.12 Cancelaciones — `cancellation-charges.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/cancellation-charges/my` | Auth | Cargos propios |
| `GET` | `/services/:id/cancellation-charge` | Participante | Cargo del servicio |
| `POST` | `/services/:id/cancellation-charge/proof` | Cliente | Adjuntar comprobante |
| `POST` | `/services/:id/cancellation-charge/dispute` | Actor permitido | Disputar |
| `POST` | `/services/:id/cancellation-charge/settle` | Worker | Confirmar recepción |
| `GET` | `/admin/cancellation-charges` | Admin | Ver casos completos |
| `POST` | `/admin/cancellation-charges/:id/resolve` | Admin | Resolver |

### 17.13 Suscripciones — `subscriptions.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/subscriptions/plans` | Público | Planes activos |
| `GET` | `/subscriptions/me` | Auth | Suscripción propia |
| `POST` | `/subscriptions/validate-coupon` | Auth | Validar cupón |
| `POST` | `/subscriptions/checkout` | Auth | Activar gratis o iniciar Webpay |
| `GET` | `/subscriptions/confirm` | Callback público | Confirmar Webpay |
| `POST` | `/subscriptions/cancel` | Auth | Cancelar renovación |
| `GET` | `/subscriptions/history` | Auth | Historial |

### 17.14 Administración financiera heredada y SaaS — `admin.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/admin/commission` | Admin | Consultar comisión heredada |
| `PATCH` | `/admin/commission` | Admin | Modificar comisión heredada |
| `GET` | `/admin/revenue` | Admin | Ingresos por semana/mes/año |
| `GET` | `/admin/subscriptions/stats` | Admin | Métricas |
| `GET` | `/admin/subscriptions` | Admin | Listar suscripciones |
| `PATCH` | `/admin/subscriptions/:id` | Admin | Editar suscripción |
| `POST` | `/admin/subscriptions/grant` | Admin | Conceder plan |
| `GET` | `/admin/plans` | Admin | Listar planes |
| `PATCH` | `/admin/plans/:id` | Admin | Editar plan |
| `GET` | `/admin/coupons` | Admin | Listar cupones |
| `POST` | `/admin/coupons` | Admin | Crear cupón |
| `PATCH` | `/admin/coupons/:id` | Admin | Editar cupón |
| `DELETE` | `/admin/coupons/:id` | Admin | Eliminar cupón |

### 17.15 Bloqueos — `blocks.ts` y `admin.ts`

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `POST` | `/blocks` | Auth | Bloqueo usuario-usuario |
| `DELETE` | `/blocks/:blockedId` | Auth | Eliminar bloqueo |
| `GET` | `/blocks/check/:userId` | Auth | Consultar bloqueo |
| `GET` | `/admin/blocked-users` | Admin | Listar bloqueados |
| `POST` | `/admin/users/:id/block` | Admin | Aplicar bloqueo |
| `POST` | `/admin/users/:id/unblock` | Admin | Quitar bloqueo |
| `GET` | `/admin/users/:id/block-history` | Admin | Historial |

### 17.16 Categorías

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/categories` | Público | Listar categorías |
| `GET` | `/categories/:id/subcategories` | Público | Listar subcategorías |
| `POST` | `/categories` | Admin | Crear categoría |
| `PATCH` | `/categories/:id` | Admin | Editar categoría |
| `DELETE` | `/categories/:id` | Admin | Eliminar categoría |
| `POST` | `/categories/:categoryId/subcategories` | Admin | Crear subcategoría |
| `PATCH` | `/subcategories/:id` | Admin | Editar subcategoría |
| `DELETE` | `/subcategories/:id` | Admin | Eliminar subcategoría |
| `GET` | `/category-groups` | Público | Listar grupos |
| `GET` | `/admin/category-groups` | Admin | Listar grupos admin |
| `POST` | `/admin/category-groups` | Admin | Crear grupo |
| `PATCH` | `/admin/category-groups/:id` | Admin | Editar grupo |
| `DELETE` | `/admin/category-groups/:id` | Admin | Eliminar grupo |
| `PUT` | `/admin/category-groups/reorder` | Admin | Reordenar grupos |

### 17.17 Perfil profesional y reputación

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `GET` | `/portfolio/:userId` | Público/Auth | Ver portafolio |
| `POST` | `/portfolio` | Propio | Agregar imagen |
| `DELETE` | `/portfolio/:id` | Propio | Eliminar imagen |
| `GET` | `/certifications/:userId` | Público/Auth | Ver certificaciones |
| `POST` | `/certifications` | Propio | Agregar certificación |
| `DELETE` | `/certifications/:id` | Propio | Eliminar certificación |
| `GET` | `/admin/certifications` | Admin | Revisar certificaciones |
| `PATCH` | `/admin/certifications/:id` | Admin | Cambiar estado |
| `GET` | `/favorites` | Auth | Listar favoritos |
| `POST` | `/favorites` | Auth | Agregar favorito |
| `DELETE` | `/favorites/:vinculadoId` | Auth | Eliminar favorito |
| `GET` | `/favorites/check/:userId` | Auth | Consultar favorito |
| `POST` | `/reviews` | Actor permitido | Crear reseña |
| `POST` | `/reviews/rate-client` | Worker | Calificar cliente |
| `GET` | `/reviews/reviewable/:workerId` | Auth | Ver si se puede reseñar |
| `GET` | `/reviews/worker/:workerId` | Público/Auth | Reseñas del experto |

### 17.18 Soporte y utilidades

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| `POST` | `/tickets` | Auth | Crear ticket |
| `GET` | `/tickets` | Auth | Ver tickets propios |
| `GET` | `/admin/tickets` | Admin | Listar tickets |
| `POST` | `/admin/tickets/:id/respond` | Admin | Responder |
| `PATCH` | `/admin/tickets/:id/status` | Admin | Cambiar estado |
| `POST` | `/storage/uploads/request-url` | Auth | Solicitar URL firmada |
| `PUT` | `/storage/uploads/*` | URL firmada | Subir archivo |
| `GET` | `/storage/objects/*path` | Según objeto/token | Obtener archivo |
| `POST` | `/firmas` | Público/flujo de firma | Crear firma |
| `GET` | `/firmas` | Según flujo | Listar firmas |
| `GET` | `/firmas/:id` | Según flujo | Ver firma |
| `GET` | `/firmas/:id/png` | Según flujo | Obtener firma como PNG |
| `GET` | `/firmas/docs/list` | Público | Listar documentos |
| `GET` | `/firmas/:id/sign-doc` | Auth | Generar PDF firmado |
| `GET` | `/config/maps` | Auth | Configuración de mapas |
| `GET` | `/geoip` | Público | Geolocalización aproximada |
| `GET` | `/healthz` | Público | Salud del servidor |
| `POST` | `/client-errors` | Público | Registrar error del cliente |
| `GET` | `/admin/logs` | Admin | Consultar logs |
| `GET` | `/admin/logs/stats` | Admin | Estadísticas de logs |
| `DELETE` | `/admin/logs` | Admin | Limpiar logs |
| `GET` | `/admin/logs/stream` | JWT admin manual | Stream SSE |

---

## 18. Modelo de datos

El esquema está en `server/db/schema/` y las migraciones oficiales en `migrations/`.

### 18.1 `users`

Guarda:

- Identidad.
- Correo y contraseña hash.
- Rol.
- Estado.
- Teléfono.
- Avatar.
- Biografía.
- Habilidades.
- Categoría principal.
- Ratings de cliente y experto.
- Estado KYC.
- Disponibilidad.
- Radio de servicio.
- Latitud y longitud.
- Tokens FCM.
- Token VoIP.
- Verificación email/teléfono.
- Datos bancarios informativos.
- Campos históricos de saldo/payout.
- Tipo de plataforma.
- Video.
- Tarifa de visita.
- Radio de alertas.
- Suspensión.
- Última actividad.
- Requisito de selfie.

### 18.2 Catálogo

Tablas:

- `category_groups`.
- `categories`.
- `subcategories`.
- `worker_categories`.

Relaciones:

```text
category_groups 1 ─── N categories
categories      1 ─── N subcategories
users/workers   N ─── M categories mediante worker_categories
```

### 18.3 `services`

Guarda:

- Título.
- Descripción.
- Estado.
- Cliente.
- Experto asignado.
- Categoría.
- Subcategoría.
- Presupuesto/cotización heredados.
- Dirección.
- `originAddress`.
- `destinationAddress`.
- Latitud/longitud.
- Imágenes.
- Urgencia.
- Fecha programada.
- Confirmaciones de cliente/experto.
- Método declarado de pago.
- Nota de presupuesto.
- Selfies.
- Ventana de cancelación gratuita.
- Actor y motivo de cancelación.
- Recotización.
- Solicitud directa.

### 18.4 `proposals`

Guarda:

- Servicio.
- Trabajador.
- Estado.
- Mensaje.
- Tiempo estimado.
- Datos de propuesta.
- Contrapropuesta.

### 18.5 Alertas

`alert_sessions` registra:

- Servicio.
- Trabajador notificado.
- Estado de alerta.
- Visto/saltado.
- Relación única servicio-trabajador.

### 18.6 Mensajes y claves

Tablas:

- `messages`.
- `direct_conversations`.
- `direct_messages`.
- `user_crypto_keys`.
- `user_e2e_devices`.

Las conversaciones directas son diferentes de los chats vinculados a un servicio.

### 18.7 Reputación y relaciones

Tablas:

- `reviews`.
- `user_favorites`.
- `user_blocks`.

La reputación se calcula con ratings de usuario y experto separados.

### 18.8 Seguridad y operación

Tablas:

- `kyc_documents`.
- `security_selfies`.
- `admin_user_blocks`.
- `notifications`.
- `support_tickets`.
- `ticket_responses`.
- `signatures`.
- `site_settings`.

### 18.9 Suscripciones

Tablas:

- `subscription_plans`.
- `user_subscriptions`.
- `subscription_payments`.
- `coupons`.
- `coupon_uses`.

### 18.10 Cargos de cancelación

`cancellation_charges` registra:

- Servicio.
- Cliente.
- Experto.
- Snapshot bancario de destino.
- Monto informativo si aplica.
- Estado.
- Comprobante.
- Disputa.
- Resolución administrativa.
- Notas internas.

### 18.11 Tablas heredadas

El schema todavía declara elementos del modelo antiguo:

- `payments`.
- `balance_transactions`.
- `payouts`.
- `commission_config`.
- Campos `balance`.
- Campos de precio en servicios.

Esto debe considerarse deuda de migración y no una capacidad que se deba activar.

---

## 19. Procesos automáticos y tiempos

### 19.1 Motor de solicitudes

`server/lib/service-motor.ts`:

- Fase activa aproximada: 60 segundos.
- Pro Max puede recibir prioridad inmediata.
- Expertos cercanos pueden recibir alerta después de aproximadamente 13 segundos.
- Radio cercano aproximado: 10 km.
- Máximo inicial aproximado: 8 trabajadores.
- Fase pasiva: trabajadores activos de la categoría sin límite de distancia equivalente.
- Recupera solicitudes `pending` atascadas durante más de 2 minutos.
- Recupera alertas `alerting` atascadas durante más de 150 segundos.
- Puede autocompletar servicios después de 24 horas con una confirmación pendiente.

Los timers del motor son locales al proceso.

### 19.2 Scheduler de bloqueos

`server/lib/admin-blocks.ts`:

- Programa el próximo vencimiento.
- Expira el bloqueo.
- Cambia usuario a `active`.
- Desactiva disponibilidad.
- Invalida cache.
- Permite desbloqueo manual.

### 19.3 Cron de suscripciones

`server/lib/subscription-cron.ts`:

- Primer ciclo aproximadamente 30 segundos después de iniciar.
- Revisión cada 6 horas.
- Renueva o expira suscripciones.
- Notifica vencimientos.
- Evita push duplicado dentro de la ventana.
- Limita emails repetidos.
- Purga selfies.
- Ejecuta mantenimiento del motor.

### 19.4 Retención de selfies

Las selfies expiradas se purgan:

- Al arranque.
- Durante el cron.
- Según la fecha de expiración y política de retención.

---

## 20. Interfaz y experiencia de uso

### 20.1 Tema

- Tema oscuro permanente.
- Fondo negro azulado.
- Primary azul eléctrico.
- Texto claro.
- Bordes azulados oscuros.
- Rojo para acciones destructivas.
- No se debe usar amarillo como color de marca.

### 20.2 Componentes globales

El layout global monta:

- Error boundary.
- Toasts.
- Cookie banner.
- Proveedor de Google Maps.
- Precalentamiento de mapas.
- Socket global.
- Push.
- CallKit.
- Ubicación inicial.
- Banner offline.
- Banner de cuenta bloqueada.
- Modal de selfie cuando corresponde.
- Overlay de llamadas.

### 20.3 Componentes funcionales principales

- Tarjeta rápida de servicio activo.
- Autocomplete de dirección.
- Diálogo de bloqueo administrativo.
- Overlay de llamada.
- Tarjeta de cargo de cancelación.
- Chat directo.
- Chat de propuesta.
- Modal de selfie.
- Selector de fotos.
- Selector de fuente de foto.
- Modal de alerta de servicio.
- Mapas de trabajadores, servicios y rutas.
- Centro de soporte.
- Onboarding de experto.
- Perfil de usuario.
- Badge Pro.

### 20.4 Estados visuales

La interfaz incluye:

- Skeletons.
- Spinners.
- Estados vacíos.
- Estados de error.
- Toasts.
- Botones deshabilitados durante mutaciones.
- Banner offline.
- Mensajes cifrados no descifrables.
- Pantalla de cuenta bloqueada.
- Manejo de `ChunkLoadError` con recarga automática.

---

## 21. Móvil y Capacitor

### 21.1 Configuración general

`capacitor.config.ts` define:

- App ID técnico: `com.fixxer.app`.
- Nombre visible: Fixgo.
- Directorio web: `dist/public`.
- Esquema HTTPS.
- Cleartext deshabilitado.
- Splash screen.
- Status bar.
- Teclado.
- KeepAwake.
- Plugins Capacitor.

### 21.2 Permisos

La aplicación puede solicitar:

- Ubicación.
- Cámara.
- Micrófono.
- Fotos.
- Notificaciones.
- Red.

### 21.3 Android

Incluye:

- Proyecto Gradle.
- Firebase Messaging.
- `FixxerMessagingService`.
- Actividad de llamada entrante.
- Google Maps.
- Manejo del botón Atrás.
- Deep links.
- Ajuste al teclado.

Requisitos externos:

- Android Studio.
- Android SDK.
- Configuración Firebase.
- `google-services.json`.
- Clave Maps restringida.
- Keystore de firma.

### 21.4 iOS

Incluye:

- Proyecto Xcode.
- Capacitor App.
- Push normal.
- PushKit.
- CallKit.
- Background Modes.
- Permisos de cámara, micrófono, fotos y ubicación.

Requisitos externos:

- Mac.
- Xcode.
- Cuenta Apple Developer.
- Certificados/perfiles de firma.
- `GoogleService-Info.plist`.
- APNs Auth Key con VoIP.
- Capabilities de Push Notifications y Background Modes.

Replit no compila ni firma la aplicación iOS; esa parte requiere Mac/Xcode.

### 21.5 URLs nativas

El WebView nativo está configurado para comunicarse con el backend público configurado en la aplicación. Las URLs de imágenes y llamadas a `/api` se reescriben para evitar recursos rotos dentro del WebView.

---

## 22. Seguridad

### 22.1 Seguridad implementada

- Hash de contraseña con bcrypt.
- JWT Bearer.
- Roles.
- Propiedad de recursos.
- Bloqueos.
- Suspensiones.
- Rate limiting.
- CORS.
- Compresión.
- Logging estructurado.
- Selfie de seguridad asociada al trabajo.
- KYC.
- E2E en chat de servicio.
- Backup cifrado de claves.
- Tokens separados para FCM web, FCM nativo y VoIP.

### 22.2 Límites de red

- Rate limit general aproximado: 200 solicitudes por minuto.
- Auth: aproximadamente 20 solicitudes cada 15 minutos.
- Recuperación: aproximadamente 5 solicitudes por hora.
- JSON HTTP: aproximadamente 2 MB.
- Workers disponibles: máximo aproximado de 200.
- Mensajes directos: máximo aproximado de 200.
- Selfies administrativas: máximo aproximado de 500.
- Logs: máximo por defecto aproximado de 500.

### 22.3 Autorización

El servidor valida:

- JWT.
- Rol.
- Estado.
- Propiedad.
- Participación en servicio.
- Participación en conversación.
- Elegibilidad.
- KYC.
- Suspensión.
- Bloqueo administrativo.

El router frontend registra muchas rutas para simplificar la navegación; eso no reemplaza la autorización del servidor.

### 22.4 Información sensible

Debe protegerse especialmente:

- Contraseñas.
- JWT.
- Datos bancarios.
- Documentos KYC.
- Selfies.
- Tokens FCM/APNs/VoIP.
- URLs firmadas.
- Contenido de mensajes.
- Logs con PII.

No incluir secretos reales en Markdown, frontend, commits o archivos públicos.

---

## 23. Almacenamiento de archivos

El módulo de storage permite:

- Solicitar una URL de carga.
- Subir archivos.
- Obtener objetos.
- Guardar URLs en perfiles, servicios, portfolio, certificaciones, selfies o documentos.

Archivos posibles:

- Fotos de servicios.
- Avatar.
- Portfolio.
- Certificaciones.
- Videos de presentación.
- Selfies.
- Documentos KYC.
- Comprobantes de cargos.
- PDFs y firmas.

Recomendaciones operativas:

- Validar MIME.
- Validar tamaño.
- Validar propiedad.
- Usar URLs firmadas.
- No exponer documentos sensibles públicamente.
- Definir retención y purga.
- Usar almacenamiento persistente/objeto en producción.

---

## 24. Variables de entorno e integraciones

Los valores reales nunca deben escribirse en este documento. Deben configurarse mediante secretos o variables de entorno.

### 24.1 Base y servidor

- `DATABASE_URL`: conexión PostgreSQL.
- `PORT`: puerto HTTP.
- `NODE_ENV`: ambiente.
- `APP_URL`: origen público y CORS.
- `SESSION_SECRET`: firma de JWT.
- `UPLOAD_DIR`: almacenamiento local opcional.
- `LOG_LEVEL`: nivel de logs.

### 24.2 Correo

- `RESEND_API_KEY`.
- `EMAIL_FROM`.

### 24.3 Google Maps

- `GOOGLE_MAPS_API_KEY`.
- `GOOGLE_MAPS_API_KEY_MOBILE`.

Las claves del frontend son visibles en el bundle y deben estar restringidas por dominio, package name y firma.

### 24.4 Firebase

Servidor:

- `FIREBASE_PROJECT_ID`.
- `FIREBASE_CLIENT_EMAIL`.
- `FIREBASE_PRIVATE_KEY`.

Cliente web:

- `VITE_FIREBASE_API_KEY`.
- `VITE_FIREBASE_AUTH_DOMAIN`.
- `VITE_FIREBASE_PROJECT_ID`.
- `VITE_FIREBASE_APP_ID`.
- `VITE_FIREBASE_MESSAGING_SENDER_ID`.
- `VITE_FIREBASE_VAPID_KEY`.

Móvil:

- `google-services.json`.
- `GoogleService-Info.plist`.

### 24.5 Transbank

- `TBK_COMMERCE_CODE`.
- `TBK_API_KEY_SECRET`.
- `TBK_ENVIRONMENT`.

Solo debe utilizarse para suscripciones de Fixgo.

### 24.6 TURN

Metered:

- `METERED_TURN_DOMAIN`.
- `METERED_TURN_API_KEY`.

TURN estático:

- `TURN_URLS`.
- `TURN_USERNAME`.
- `TURN_CREDENTIAL`.

### 24.7 APNs/VoIP

- `APNS_KEY_ID`.
- `APNS_TEAM_ID`.
- `APNS_PRIVATE_KEY`.
- `APNS_BUNDLE_ID`.
- `APNS_ENVIRONMENT`.

### 24.8 Escalado

- `REDIS_URL`: opcional para Redis Adapter de Socket.IO.

Redis no externaliza automáticamente todos los timers del motor, llamadas o procesos pendientes.

---

## 25. Comandos del proyecto

### 25.1 Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` ejecuta `tsx server/index.ts`.

### 25.2 Build y producción

```bash
pnpm build
pnpm start
```

El build:

- Compila frontend con Vite.
- Genera `dist/public`.
- Empaqueta servidor con `build.mjs`.

Producción inicia con:

```bash
NODE_ENV=production node --enable-source-maps dist/server/index.mjs
```

### 25.3 Base de datos

```bash
pnpm db:migrate
pnpm db:push
pnpm db:push-force
```

Recomendación:

- Usar `pnpm db:migrate` como camino principal.
- Revisar cambios antes de `db:push`.
- Usar `db:push-force` solo con respaldo y autorización.

### 25.4 Pruebas existentes

```bash
pnpm test:home-alerts
```

También existen scripts de apoyo para:

- Seeds de administrador.
- Seeds de pruebas E2E.
- Persistencia de chat.
- Propuestas.
- Reproducción de bugs.
- Generación de documentos.
- PDFs.
- Parches Android.

### 25.5 Móvil

```bash
pnpm mobile:build
pnpm mobile:android
pnpm mobile:ios
pnpm mobile:sync
```

`postinstall` aplica parches Android automáticamente.

---

## 26. Migraciones

Las migraciones oficiales están en `migrations/` y cubren:

- Schema inicial.
- Recuperación de contraseña.
- Verificación de email.
- PayPal histórico.
- Payout histórico.
- Categorías.
- KYC.
- Selfies.
- Índices.
- Tickets.
- Subcategorías.
- FCM.
- Recotizaciones.
- Teléfono.
- Suscripciones.
- E2E.
- Tipo de plataforma.
- Presupuesto/cotización.
- Bloqueos.
- Favoritos.
- Motor de solicitudes.
- Conversaciones directas.
- Tarifa de visita.
- Radio de alertas.
- Dispositivos E2E.
- Transporte.
- Reseñas.
- Cargos de cancelación.
- Suspensiones.
- Confirmación doble.
- Selfies.
- Bloqueos administrativos.

El migrador:

- Ordena archivos.
- Usa transacción por archivo.
- Registra migraciones en `_migrations`.
- Usa advisory lock de PostgreSQL.

Precauciones:

- Existen dos archivos con prefijo `0032`.
- Existe una migración duplicada de radio de alertas en `server/db/migrations/`.
- `0001_initial_schema.sql` representa un modelo histórico.
- No hay rollback automático general.
- `scripts/limpiar-db-produccion.sql` es destructivo.

---

## 27. Estructura principal de carpetas

```text
client/
  components/       Componentes reutilizables y UI
  hooks/             Auth, sockets, push, ubicación, llamadas y suscripción
  lib/               Criptografía, geolocalización, storage y utilidades
  pages/             Pantallas web
  App.tsx            Router y composición global
  main.tsx           Entrada web/native

server/
  db/                Conexión y schema Drizzle
  lib/               Auth, sockets, motor, cron, correo, storage y pagos
  middlewares/       Autenticación y autorización
  routes/            API REST
  zod/               Tipos y validaciones
  app.ts             Aplicación Express
  index.ts           Arranque del servidor

migrations/          Migraciones SQL oficiales
android/             Proyecto Android Capacitor
ios/                 Proyecto iOS Capacitor
scripts/              Seeds, pruebas, PDFs y mantenimiento
attached_assets/     Assets, PDFs e imágenes adjuntas
public/              Manifest y recursos públicos
```

---

## 28. Limitaciones y temas que deben conocerse

### 28.1 Autorización frontend

Wouter registra muchas rutas para todos los usuarios. Ocultar un enlace no es una barrera suficiente. La seguridad depende del backend y de las comprobaciones internas por recurso.

### 28.2 Pagos antiguos

El schema y migraciones mantienen entidades financieras heredadas. Deben alinearse con el modelo SaaS y la regla de pagos directos fuera de Fixgo.

### 28.3 E2E en mensajes directos

El chat de servicio tiene infraestructura E2E, pero el módulo directo todavía contempla contenido no cifrado opcional.

### 28.4 Timers locales

Los timers de:

- Llamadas.
- Alertas.
- Motor de solicitudes.

son locales al proceso. Redis solo ayuda con Socket.IO y no convierte automáticamente esos timers en distribuidos.

### 28.5 TURN

La calidad de llamadas depende de Metered o TURN estático fiable. OpenRelay no debe considerarse una solución de producción.

### 28.6 iOS

La compilación y firma requieren Mac/Xcode, Apple Developer y configuración de APNs.

### 28.7 GPS

Sin permiso o fix real:

- No se muestra correctamente la posición del experto.
- La búsqueda puede usar Santiago como fallback.
- El mapa puede tener distancias imprecisas.

### 28.8 Storage

Se debe revisar cada tipo de archivo para que los documentos KYC, selfies, datos bancarios y comprobantes no queden expuestos por una ruta pública.

### 28.9 Documentos legales y marcas

Existen documentos históricos Fixgo, Fixxer, FixMaster y Zigo. Antes de una entrega legal o contractual se deben regenerar desde la fuente correcta y verificar la marca visible.

### 28.10 Backups

El repositorio contiene migraciones, pero no reemplaza:

- Backups automáticos de PostgreSQL.
- Retención definida.
- Pruebas de restauración.
- Backups previos a migraciones destructivas.
- Plan de recuperación.

---

## 29. Reglas de operación recomendadas

1. Mantener los pagos cliente-experto fuera de Fixgo.
2. Usar Webpay solo para suscripciones.
3. No activar billetera, saldo o payouts.
4. Proteger todas las selfies y documentos KYC.
5. Mantener E2E del chat de servicios.
6. No rotar claves E2E sin respaldo.
7. Verificar `workerId` en cada inserción de mensaje de servicio.
8. Emitir Socket.IO en cada escritura de servicio/propuesta.
9. Ejecutar migraciones oficiales antes de iniciar producción.
10. Configurar `SESSION_SECRET` real y fuerte.
11. No usar fallbacks inseguros en producción.
12. Configurar TURN fiable antes de prometer llamadas en móvil.
13. Configurar almacenamiento persistente.
14. Restringir claves de Google Maps.
15. Hacer backup antes de cambios de schema.
16. No exponer tokens, URLs firmadas ni PII en logs.
17. Validar permisos nativos en Android/iOS.
18. Probar expiración de bloqueos y reactivación.
19. Probar confirmación doble y autocompletado de 24 horas.
20. Verificar la marca y los documentos legales antes de publicar.

---

## 30. Glosario

| Término | Significado |
|---|---|
| Cliente | Usuario que busca o solicita un servicio |
| Experto/Worker | Usuario que ofrece sus capacidades |
| Servicio | Solicitud de conexión publicada por un cliente |
| Propuesta | Oferta de participación enviada por un experto |
| Contrapropuesta | Respuesta de negociación a una propuesta |
| Solicitud directa | Servicio dirigido a un experto específico |
| KYC | Verificación de identidad |
| Selfie de seguridad | Captura temporal para validar presencia |
| E2E | Cifrado de extremo a extremo |
| TURN | Servidor de relay para WebRTC |
| FCM | Firebase Cloud Messaging |
| APNs | Apple Push Notification service |
| CallKit | Framework de llamadas nativas de iOS |
| Webpay | Integración de suscripción de Transbank |
| Cargo de visita | Registro informativo de una cancelación tardía |
| Scheduler | Proceso que ejecuta vencimientos y mantenimiento |
| Motor de solicitudes | Proceso que alerta a expertos elegibles |
| Cuenta bloqueada | Cuenta autenticada con permisos reducidos |
| Suscripción | Plan de uso de la plataforma |
| Fixgo | Marca visible actual |
| Fixxer/Zigo/FixMaster | Referencias históricas o técnicas heredadas |

---

## 31. Referencias de código

Archivos de mayor importancia:

- `client/App.tsx`
- `client/components/layout.tsx`
- `client/components/blocked-account-access.tsx`
- `client/components/client-home.tsx`
- `client/components/worker-home.tsx`
- `client/components/service-alert-modal.tsx`
- `client/components/call-overlay.tsx`
- `client/pages/home.tsx`
- `client/pages/services/new.tsx`
- `client/pages/services/detail.tsx`
- `client/pages/mis-trabajos.tsx`
- `client/pages/profile.tsx`
- `client/pages/planes.tsx`
- `client/pages/mi-plan.tsx`
- `client/pages/admin/`
- `client/hooks/use-auth.tsx`
- `client/hooks/use-global-socket.ts`
- `client/hooks/use-push-notifications.ts`
- `client/hooks/use-call.ts`
- `client/lib/e2e-crypto.ts`
- `server/app.ts`
- `server/index.ts`
- `server/middlewares/authenticate.ts`
- `server/routes/index.ts`
- `server/routes/auth.ts`
- `server/routes/users.ts`
- `server/routes/services.ts`
- `server/routes/proposals.ts`
- `server/routes/messages.ts`
- `server/routes/direct-messages.ts`
- `server/routes/subscriptions.ts`
- `server/routes/cancellation-charges.ts`
- `server/routes/kyc.ts`
- `server/routes/security-selfies.ts`
- `server/routes/admin.ts`
- `server/lib/service-motor.ts`
- `server/lib/socketio.ts`
- `server/lib/subscription-cron.ts`
- `server/lib/admin-blocks.ts`
- `server/lib/transbank.ts`
- `server/lib/payout-service.ts`
- `server/db/schema/`
- `migrations/`

---

## 32. Estado de esta documentación

Este archivo es un manual técnico-funcional, no un contrato legal ni una especificación OpenAPI. Debe actualizarse cuando cambien:

- Roles.
- Estados.
- Rutas.
- Planes.
- Reglas de pago.
- Retención de documentos.
- Permisos.
- Integraciones móviles.
- Flujo de KYC.
- Motor de alertas.
- Políticas de privacidad.

La fuente de verdad para cada tema es:

- Código activo para comportamiento real.
- Schema y migraciones para datos.
- Reglas del proyecto para cumplimiento operativo.
- Documentos legales aprobados para contratos y privacidad.
