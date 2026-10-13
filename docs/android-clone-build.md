# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.# Clonar y compilar Fixgo para Android

Esta guía prepara una clonación limpia del proyecto y genera el bundle Android
sin subir secretos ni keystores al repositorio.

## Requisitos

- Node.js 20.x
- pnpm 10.26.1
- Java compatible con Gradle 8.11
- Android SDK con:
  - Platform Android API 36
  - Build Tools compatibles
  - Android SDK Platform-Tools
- Un emulador o dispositivo Android para probar el build

El proyecto usa:

- Gradle Wrapper 8.11
- Android Gradle Plugin 8.8.2
- `compileSdk` y `targetSdk` 36
- Package Android `com.fixxer.app`

No cambiar AGP o Gradle manualmente en Android Studio. Usar siempre el wrapper
incluido en `android/gradlew`.

## Clonación inicial

```bash
git clone <URL_DEL_REPOSITORIO>
cd <CARPETA_DEL_REPOSITORIO>
pnpm install --frozen-lockfile
```

Configura el SDK Android con una de estas opciones:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
```

o crea `android/local.properties` con una ruta local que no se versiona:

```properties
sdk.dir=/ruta/absoluta/al/Android/Sdk
```

El archivo `android/app/google-services.json` está versionado para el proyecto
Android. Si se reemplaza por otro proyecto Firebase, debe corresponder al
package `com.fixxer.app`.

## Preparar el bundle web y los proyectos nativos

```bash
pnpm mobile:prepare
```

Este comando:

1. Compila el frontend.
2. Copia `dist/public` a los assets Android e iOS.
3. Regenera la configuración Capacitor versionada.
4. Reaplica las preparaciones nativas del proyecto.

No usar `npx cap sync` directamente en este entorno: la versión de Node del
proyecto puede ser incompatible con la versión requerida por Capacitor.

## Validar una clonación Android

```bash
node scripts/mobile-check.mjs android
```

La validación comprueba el SDK, el wrapper, el frontend nativo, Firebase, el
manifest, el package Android y la configuración de Google Maps.

## Compilar para desarrollo

```bash
pnpm mobile:android
```

El APK de debug queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Compilar el AAB release optimizado

El release usa R8 con el perfil optimizado para minificar, ofuscar y eliminar
código y recursos no utilizados. También genera símbolos nativos para que
Google Play pueda diagnosticar crashes y ANR. La firma no se almacena en Git.

Define las variables de firma en el entorno de compilación, sin pegarlas en
archivos versionados:

```bash
export ANDROID_KEYSTORE_FILE=/ruta/local/fixgo-release.jks
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
```

Antes de compilar:

```bash
node scripts/mobile-check.mjs android --release
```

Luego genera el AAB:

```bash
pnpm mobile:android:release
```

La salida esperada es:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Los símbolos nativos opcionales para Google Play quedan en:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

Si Play Console solicita un archivo de desofuscación de R8, el archivo separado
es:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

Si solo se necesita verificar R8 sin una firma local, se puede ejecutar:

```bash
cd android
./gradlew bundleRelease
```

El AAB resultante no debe subirse a Google Play si no está firmado con el
keystore de publicación correcto.

## Verificación posterior

Antes de subir una nueva versión a Google Play:

1. Instalar el release en un dispositivo limpio.
2. Probar arranque, login y navegación por roles.
3. Probar mapas, ubicación y cámara.
4. Probar notificaciones y llamadas.
5. Probar chat, cifrado y adjuntos.
6. Probar suscripciones y los límites por plan.
7. Confirmar que el número de versión sea superior al ya publicado.
8. Revisar los warnings de R8 y no dejar advertencias sin evaluar.

Los cambios en el frontend requieren repetir `pnpm mobile:prepare` antes de
compilar Android o iOS.