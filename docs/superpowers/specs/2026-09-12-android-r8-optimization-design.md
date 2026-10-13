# Optimización R8 del release Android

## Contexto

Google Play marca el paquete Android de Fixgo con optimización baja, solo 2% de
ofuscación y sin reducción de código o recursos. La configuración actual del
release tiene `minifyEnabled false` y usa un archivo ProGuard sin reglas propias.

La compatibilidad con páginas de memoria de 16 KB ya aparece como admitida y no
requiere cambios. El proyecto debe conservar AGP 8.8.2 y Gradle 8.11 durante
esta mejora; la recomendación de Google Play de AGP 9.0 queda fuera del alcance.

## Objetivo

Activar la optimización R8 únicamente para el build `release`, reduciendo y
ofuscando el código Java/Kotlin incluido en el AAB sin romper:

- arranque de Capacitor y carga del bundle web;
- Firebase Messaging y notificaciones;
- Google Maps;
- cámara, geolocalización y plugins Capacitor;
- llamadas nativas Android;
- cifrado y almacenamiento local;
- generación de un AAB firmado instalable.

## Diseño

### Configuración de release

- Cambiar `minifyEnabled` a `true`.
- Activar `shrinkResources` después de confirmar que el build optimizado se
  genera correctamente.
- Mantener los archivos predeterminados de Android y el archivo de reglas del
  proyecto.
- No modificar `debug`, `applicationId`, versión de AGP, Gradle ni el esquema de
  firma.

### Reglas de conservación

Agregar únicamente reglas justificadas por advertencias de R8 o por APIs que
se cargan mediante reflexión, manifiesto, JNI o configuración de plugins.
Priorizar conservar atributos necesarios para:

- serialización/reflexión de librerías Android;
- clases declaradas en `AndroidManifest.xml`;
- interfaces JavaScript expuestas por WebView, si las hubiera;
- metadatos de anotaciones y firmas requeridos por las dependencias.

No usar reglas globales que conserven toda la aplicación ni desactivar R8 ante
una advertencia. Si una función concreta falla, añadir una regla mínima y
documentada.

### Verificación

Después del cambio:

1. Ejecutar la compilación TypeScript/web.
2. Generar el bundle nativo actualizado.
3. Ejecutar `bundleRelease` con la configuración de firma disponible.
4. Revisar advertencias de R8 y errores de Gradle.
5. Confirmar que el AAB se crea y que el tamaño disminuye o, si no disminuye,
   que la optimización sigue siendo válida.
6. Probar en el release optimizado:
   - arranque y login;
   - navegación por roles;
   - mapas y ubicación;
   - notificaciones;
   - llamadas;
   - chat y adjuntos;
   - almacenamiento/cifrado local;
   - flujo de suscripciones y pagos.
7. Ejecutar las comprobaciones existentes del proyecto y `git diff --check`.

## Riesgos y mitigaciones

- R8 puede eliminar clases usadas dinámicamente por plugins. Se resolverá con
  reglas específicas basadas en las advertencias, no con un keep-all global.
- La optimización puede ocultar demasiado los stack traces. Mantener
  `SourceFile` y `LineNumberTable` mientras se valida el release.
- El incremento a AGP 9.0 puede introducir incompatibilidades con Capacitor,
  AndroidX o el entorno de resolución actual. Se evaluará en una tarea
  separada, no como parte de este cambio.

## Fuera de alcance

- Migración a AGP 9.0 o Gradle 9.
- Cambios al `applicationId`, firma o keystore.
- Cambios funcionales en la app.
- Reconfiguración de soporte para páginas de memoria de 16 KB.
- Optimización del JavaScript web más allá de la configuración existente de Vite.

## Criterio de aceptación

El proyecto genera un AAB release firmado con R8 activo, sin errores de
compilación ni advertencias no evaluadas, y los flujos nativos críticos siguen
funcionando en una instalación limpia.