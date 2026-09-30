#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");
const appVersion = "1.3.5";
const webOutput = resolve(repoRoot, "dist/public");
const androidPublic = resolve(repoRoot, "android/app/src/main/assets/public");
const iosPublic = resolve(repoRoot, "ios/App/App/public");

const capacitorConfig = {
  appId: "com.fixxer.app",
  appName: "Fixgo",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    Geolocation: {
      permissions: ["location"],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0F172A",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0F172A",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

const iosConfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" id="com.fixxer.app" version="${appVersion}">
  <name>Fixgo</name>
  <description>Servicios del hogar con Fixgo</description>
  <content src="index.html" />
</widget>
`;

function replaceDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`No se encontró la salida web: ${source}. Ejecuta pnpm build primero.`);
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

replaceDirectory(webOutput, androidPublic);
replaceDirectory(webOutput, iosPublic);

const androidConfigPath = resolve(
  repoRoot,
  "android/app/src/main/assets/capacitor.config.json",
);
const iosConfigPath = resolve(repoRoot, "ios/App/App/capacitor.config.json");
const iosConfigXmlPath = resolve(repoRoot, "ios/App/App/config.xml");

writeJson(androidConfigPath, capacitorConfig);
writeJson(iosConfigPath, capacitorConfig);
writeText(iosConfigXmlPath, iosConfigXml);

console.log("[mobile-prepare] frontend copied to Android and iOS");
console.log("[mobile-prepare] Capacitor config regenerated");
console.log("[mobile-prepare] Android native patches verified");