#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const versionName = process.env.MOBILE_VERSION_NAME || packageJson.version;
const outputDir = resolve(repoRoot, "generated-artifacts/google-play", versionName);
const gradleConfig = readFileSync(resolve(repoRoot, "android/app/build.gradle"), "utf8");
const r8MinificationEnabled = /minifyEnabled\s+true/.test(gradleConfig);
const requiredBundle = resolve(repoRoot, "android/app/build/outputs/bundle/release/app-release.aab");
const optionalOutputs = [
  {
    source: resolve(repoRoot, "android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip"),
    destination: "native-debug-symbols.zip",
    label: "Símbolos nativos para diagnósticos",
  },
  {
    source: resolve(repoRoot, "android/app/build/outputs/mapping/release/mapping.txt"),
    destination: "mapping.txt",
    label: "Mapa R8/ProGuard",
  },
];

if (!r8MinificationEnabled) {
  optionalOutputs[1].skipReason =
    "R8 está desactivado; no se genera ni se necesita un mapping.txt";
}

if (!existsSync(requiredBundle)) {
  console.error(`No se encontró el AAB firmado esperado: ${requiredBundle}`);
  process.exit(1);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
copyFileSync(requiredBundle, resolve(outputDir, "fixgo-release.aab"));

const included = ["fixgo-release.aab (obligatorio para el lanzamiento en Play Console)"];
const omitted = [];
const requiredMissing = [];

for (const artifact of optionalOutputs) {
  if (artifact.skipReason) {
    omitted.push(`${artifact.destination} — ${artifact.skipReason}`);
    continue;
  }
  if (existsSync(artifact.source)) {
    copyFileSync(artifact.source, resolve(outputDir, artifact.destination));
    included.push(`${artifact.destination} — ${artifact.label}`);
  } else {
    const requiredForThisRelease =
      artifact.destination === "native-debug-symbols.zip" ||
      (artifact.destination === "mapping.txt" && r8MinificationEnabled);
    if (requiredForThisRelease) {
      requiredMissing.push(`${artifact.destination}: ${artifact.source}`);
    } else {
      omitted.push(`${artifact.destination} — no fue generado por la configuración actual`);
    }
  }
}

if (requiredMissing.length > 0) {
  rmSync(outputDir, { recursive: true, force: true });
  console.error("No se empaquetó el lanzamiento porque faltan archivos de Play Console:");
  for (const file of requiredMissing) console.error(`- ${file}`);
  console.error(
    "Revisa que bundleRelease use android/app/build.gradle actualizado y repite con ./gradlew bundleRelease --info. Busca el aviso 'Unable to extract native debug metadata' (puede indicar que una dependencia ya viene sin símbolos).",
  );
  process.exit(1);
}

const notes = [
  `Nombre interno de versión: Fixgo ${versionName} — Compatibilidad Android 15+ y optimización`,
  "Tipo de lanzamiento: pista interna. No promover a producción hasta verificar permisos de notificaciones en Android 13+.",
  "",
  "Novedades:",
  "• Actualizamos la compilación de Android y la optimización del código.",
  "• Mejoramos la compatibilidad con Android 15 y versiones posteriores.",
  "• Aplicamos correcciones de estabilidad en la aplicación.",
  "",
  "Archivos incluidos:",
  ...included.map((item) => `• ${item}`),
  "",
  "Archivos no generados:",
  ...(omitted.length ? omitted.map((item) => `• ${item}`) : ["• Ninguno"]),
  "",
  r8MinificationEnabled
    ? "R8 está habilitado; usa el mapping.txt generado por esta misma compilación junto con el AAB."
    : "R8 está desactivado; no se genera mapping.txt. No subas un mapa vacío o inventado.",
].join("\n");

writeFileSync(resolve(outputDir, "PLAY-STORE-RELEASE-NOTES.txt"), `${notes}\n`, "utf8");
console.log(`Archivos de Play Store preparados en: ${outputDir}`);
console.log(notes);
