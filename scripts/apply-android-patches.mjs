#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const patches = [
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
