# Diseño: plataformas Android e iOS reproducibles para Fixgo

## Objetivo

Dejar las carpetas `android/` e `ios/` de Fixgo preparadas para que otra persona pueda
clonar el repositorio, instalar las dependencias, generar el frontend, sincronizar
Capacitor y abrir una compilación nativa sin depender de cambios manuales ocultos.

La identidad técnica se conserva en ambas plataformas:

- Aplicación visible: `Fixgo`
- Identificador Android/iOS: `com.fixxer.app`
- Versión actual Android: `versionName 1.0`, `versionCode 1`

## Alcance

### Android

- Mantener la configuración Gradle y el wrapper versionados.
- Automatizar la generación del frontend y la copia de `dist/public` a los assets
  nativos cuando el entorno no pueda ejecutar `cap sync`.
- Reaplicar de forma idempotente el parche de Google Maps oscuro después de instalar
  dependencias.
- Mantener manifiesto, permisos, servicio FCM, actividad de llamada entrante,
  configuración de mapas y recursos de la aplicación.
- Añadir comprobaciones previas para detectar API key ausente, Firebase ausente,
  Java/Android SDK no disponible y configuración de firma incompleta.
- Documentar la diferencia entre compilar un artefacto local y generar un AAB aceptado
  por Google Play.

### iOS

- Mantener el proyecto Xcode, SPM, entitlements, `Info.plist`, CallKit/PushKit y
  capacidades necesarias.
- Añadir una preparación reproducible de assets web y dependencias de Capacitor.
- Añadir plantillas y validaciones para `GoogleService-Info.plist`, APNs/VoIP y
  configuración de firma sin versionar secretos.
- Mantener el bundle identifier `com.fixxer.app`, nombre visible `Fixgo` y versiones
  sincronizadas con Android.
- Documentar que la compilación y firma final requieren macOS, Xcode y una cuenta
  Apple Developer.

### Repositorio y documentación

- Incluir únicamente plantillas no secretas y ejemplos de configuración.
- No incluir certificados, perfiles de aprovisionamiento, keystores, claves privadas,
  archivos `.p8`, `google-services.json` real ni `GoogleService-Info.plist` real.
- Hacer que los scripts fallen con mensajes accionables, no con fallbacks silenciosos.
- Documentar comandos de preparación, compilación local y generación de artefactos.

## Flujo propuesto

1. Instalar con la versión de Node declarada por el proyecto.
2. Ejecutar `pnpm install`.
3. Ejecutar la preparación móvil:
   - construir el frontend;
   - sincronizar Capacitor cuando el entorno sea compatible;
   - usar la copia manual de assets como ruta compatible con Node 20;
   - reaplicar los parches nativos idempotentes.
4. Validar configuración nativa y dependencias requeridas.
5. Compilar Android desde Gradle o abrir iOS desde Xcode.
6. Aplicar firma únicamente con credenciales existentes en el entorno local o en el
   sistema seguro de CI.

## Decisiones

### Identidad técnica existente

No se cambia `com.fixxer.app`. Cambiarlo produciría una aplicación distinta en
Google Play y exigiría configurar nuevamente servicios, firma y distribución.

### Sincronización Capacitor

Se conserva el workaround del proyecto para Node 20: construir primero y copiar
`dist/public` a los assets Android cuando `npx cap sync` no sea viable. El flujo no
debe borrar personalizaciones nativas ni depender de una edición manual posterior.

### Secretos y firma

Los scripts detectarán archivos o variables faltantes y explicarán cómo aportarlos,
pero nunca crearán credenciales falsas ni imprimirán valores sensibles. La
reproducibilidad significa reproducir la configuración y el proceso; no significa
versionar certificados o claves privadas.

## Manejo de errores

- Si falta `google-services.json`, Android podrá preparar el proyecto, pero la
  validación indicará que las funciones Firebase/push no estarán listas para
  producción.
- Si falta `GoogleService-Info.plist`, iOS podrá abrir el proyecto, pero la
  validación bloqueará el archive de distribución hasta que se aporte el archivo.
- Si falta una API key de Maps, la preparación fallará indicando el nombre de la
  variable o propiedad esperada.
- Si falta firma, se distinguirá entre una compilación local de prueba y un artefacto
  apto para Play Store/App Store.
- Los parches ya aplicados no se duplicarán en ejecuciones repetidas.

## Verificación

La entrega se considerará completa cuando:

1. Un clon limpio pueda instalar dependencias y preparar Android/iOS con comandos
   documentados.
2. Android genere un artefacto release reproducible con `versionCode` y
   `versionName` esperados cuando se proporcionen la firma y los servicios requeridos.
3. iOS abra y compile el workspace en Xcode cuando se proporcionen los archivos y
   certificados de Apple requeridos.
4. La aplicación conserve `com.fixxer.app` y el nombre visible `Fixgo`.
5. Las llamadas nativas, Firebase, mapas y assets web no dependan de ediciones
   manuales posteriores a la preparación.
6. Los scripts fallen claramente cuando falte una dependencia externa.
7. El repositorio no incluya secretos ni artefactos de firma.

## Fuera de alcance

- Crear o rotar certificados de Apple, claves APNs, keystores Android o claves de
  Google Maps.
- Publicar automáticamente en Google Play o App Store.
- Cambiar el identificador de la aplicación.
- Migrar el proyecto a Expo o reemplazar Capacitor.