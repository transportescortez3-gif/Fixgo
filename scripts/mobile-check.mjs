#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "all";
const release = process.argv.includes("--release");
const errors = [];
const warnings = [];

function requireFile(relativePath, label = relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${label}: falta ${relativePath}`);
  }
  return absolutePath;
}

function requireText(relativePath, text, label) {
  const absolutePath = requireFile(relativePath, label);
  if (existsSync(absolutePath) && !readFileSync(absolutePath, "utf8").includes(text)) {
    errors.push(`${label}: no contiene ${text}`);
  }
}

function checkAndroid() {
  const localPropertiesPath = resolve(repoRoot, "android/local.properties");
  const localProperties = existsSync(localPropertiesPath)
    ? readFileSync(localPropertiesPath, "utf8")
    : "";
  const configuredSdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    localProperties.match(/^sdk\.dir=(.+)$/m)?.[1];
  if (!configuredSdk || !existsSync(configuredSdk.replace(/\\:/g, ":"))) {
    errors.push(
      "Android SDK: define ANDROID_HOME/ANDROID_SDK_ROOT o crea android/local.properties con sdk.dir=/ruta/al/sdk",
    );
  }

  requireFile("android/gradlew", "Gradle wrapper Android");
  requireFile("android/app/src/main/assets/public/index.html", "frontend Android");
  requireFile(
    "android/app/src/main/assets/capacitor.config.json",
    "configuración Capacitor Android",
  );
  requireFile("android/app/src/main/AndroidManifest.xml", "manifest Android");
  requireFile("android/app/google-services.json", "configuración Firebase Android");
  requireText("android/app/build.gradle", 'applicationId "com.fixxer.app"', "package Android");
  requireText(
    "android/app/src/main/AndroidManifest.xml",
    '${mapsApiKey}',
    "API key de Google Maps Android",
  );

  if (release) {
    const keystore = process.env.ANDROID_KEYSTORE_FILE;
    const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
    const keyAlias = process.env.ANDROID_KEY_ALIAS;
    const keyPassword = process.env.ANDROID_KEY_PASSWORD;
    if (!keystore || !storePassword || !keyAlias || !keyPassword) {
      errors.push(
        "firma Android release: define ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS y ANDROID_KEY_PASSWORD",
      );
    } else if (!existsSync(resolve(repoRoot, keystore))) {
      errors.push(`firma Android release: no existe ${keystore}`);
    }
  }
}

function checkIos() {
  requireFile("ios/App/App.xcodeproj/project.pbxproj", "proyecto Xcode");
  requireFile("ios/App/App/AppDelegate.swift", "AppDelegate iOS");
  requireFile("ios/App/App/App.entitlements", "entitlements iOS");
  requireFile("ios/App/App/Info.plist", "Info.plist iOS");
  requireFile("ios/App/App/config.xml", "config.xml iOS");
  requireFile("ios/App/App/capacitor.config.json", "configuración Capacitor iOS");
  requireFile("ios/App/App/public/index.html", "frontend iOS");
  requireText(
    "ios/App/App.xcodeproj/project.pbxproj",
    "PRODUCT_BUNDLE_IDENTIFIER = com.fixxer.app;",
    "bundle identifier iOS",
  );

  if (process.platform !== "darwin") {
    warnings.push("la compilación iOS requiere macOS y Xcode; la preparación sí quedó validada");
  }
}

if (target === "all" || target === "android") checkAndroid();
if (target === "all" || target === "ios") checkIos();

for (const warning of warnings) console.warn(`[mobile-check] aviso: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[mobile-check] error: ${error}`);
  process.exit(1);
}

console.log(`[mobile-check] ${target}${release ? " release" : ""}: listo`);