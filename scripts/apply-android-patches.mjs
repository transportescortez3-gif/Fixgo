#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const patches = [
  {
    name: "@capacitor/camera Gradle config (AGP 9 built-in Kotlin + edge-to-edge deps)",
    src: resolve(__dirname, "android-patches/capacitor-camera-build.gradle"),
    dest: resolve(repoRoot, "node_modules/@capacitor/camera/android/build.gradle"),
    marker: "ioncamera-android:1.0.2",
  },
  {
    name: "@capacitor/google-maps GoogleMapConfig.kt (androidMapColorScheme)",
    src: resolve(__dirname, "android-patches/GoogleMapConfig.kt"),
    dest: resolve(
      repoRoot,
      "node_modules/@capacitor/google-maps/android/src/main/java/com/capacitorjs/plugins/googlemaps/GoogleMapConfig.kt",
    ),
    marker: "androidMapColorScheme",
  },
];

let applied = 0;
let skipped = 0;

const agp9BuiltInKotlinGradleFiles = [
  {
    name: "@capacitor/geolocation built-in Kotlin compatibility",
    path: resolve(repoRoot, "node_modules/@capacitor/geolocation/android/build.gradle"),
  },
  {
    name: "@capacitor/google-maps built-in Kotlin compatibility",
    path: resolve(repoRoot, "node_modules/@capacitor/google-maps/android/build.gradle"),
  },
];

for (const target of agp9BuiltInKotlinGradleFiles) {
  if (!existsSync(target.path)) {
    console.warn(`[android-patch] skip (target missing): ${target.path}`);
    skipped++;
    continue;
  }

  const original = readFileSync(target.path, "utf8");
  const patched = original
    .replace(/^\s*classpath ["']org\.jetbrains\.kotlin:kotlin-gradle-plugin:\$kotlin_version["']\s*\r?\n/gm, "")
    .replace(/^\s*apply plugin: ['"]kotlin-android['"]\s*\r?\n/gm, "")
    .replace(/^\s*kotlin\s*\{\s*\r?\n\s*jvmToolchain\(21\)\s*\r?\n\s*\}\s*\r?\n/gm, "");

  if (patched === original && original.includes("apply plugin: 'kotlin-android'")) {
    throw new Error(`[android-patch] no se pudo migrar el plugin Kotlin en ${target.path}`);
  }
  if (/apply plugin: ['"]kotlin-android['"]/.test(patched)) {
    throw new Error(`[android-patch] quedó una aplicación de kotlin-android en ${target.path}`);
  }

  if (patched !== original) {
    writeFileSync(target.path, patched, "utf8");
    console.log(`[android-patch] applied: ${target.name}`);
    applied++;
  } else {
    console.log(`[android-patch] up-to-date: ${target.name}`);
    skipped++;
  }
}

for (const p of patches) {
  if (!existsSync(p.dest)) {
    console.warn(`[android-patch] skip (target missing): ${p.dest}`);
    skipped++;
    continue;
  }
  if (!existsSync(p.src)) {
    console.warn(`[android-patch] skip (source missing): ${p.src}`);
    skipped++;
    continue;
  }
  const current = readFileSync(p.dest, "utf8");
  const patched = readFileSync(p.src, "utf8");
  if (current === patched) {
    console.log(`[android-patch] up-to-date: ${p.name}`);
    skipped++;
    continue;
  }
  mkdirSync(dirname(p.dest), { recursive: true });
  writeFileSync(p.dest, patched, "utf8");
  console.log(`[android-patch] applied: ${p.name}`);
  applied++;
}

console.log(`[android-patch] done. applied=${applied} skipped=${skipped}`);
