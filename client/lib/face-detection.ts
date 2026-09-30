// Detección de rostro que corre DENTRO del WebView (web y Android nativo).
//
// La API `FaceDetector` del navegador no existe en el WebView de Android, por lo
// que usamos MediaPipe Tasks Vision (WASM) que funciona en ambos entornos.
//
// El WASM y el modelo se cargan desde CDN (URLs absolutas https, no pasan por el
// monkeypatch de fetch que solo reescribe rutas "/api/"). La app ya requiere red
// para subir las fotos, así que la dependencia de red es aceptable.

import type { FaceDetector } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type FaceResult = "face" | "no-face" | "unavailable";

let detectorPromise: Promise<FaceDetector | null> | null = null;

async function getDetector(): Promise<FaceDetector | null> {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        // Las cámaras frontales de Android suelen entregar imágenes más
        // oscuras/comprimidas. Un umbral de 0.5 produce falsos negativos
        // incluso cuando el rostro está claramente centrado.
        minDetectionConfidence: 0.35,
      });
    } catch (err) {
      console.warn("[face-detection] no se pudo cargar el detector:", err);
      // No cachear el fallo: permitir reintento en la próxima llamada
      // (ej. si falló por un corte de red puntual al cargar el WASM/modelo).
      detectorPromise = null;
      return null;
    }
  })();
  return detectorPromise;
}

/** Precarga el detector en segundo plano (opcional, para reducir latencia). */
export function warmUpFaceDetector(): void {
  void getDetector();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para análisis"));
    img.src = src;
  });
}

/**
 * Devuelve "face" si se detecta al menos un rostro, "no-face" si no, y
 * "unavailable" si el detector no pudo cargarse (el llamador debe permitir
 * continuar en ese caso para no bloquear al usuario por un fallo de red).
 */
export async function detectFace(
  input: HTMLImageElement | HTMLCanvasElement | string,
): Promise<FaceResult> {
  const detector = await getDetector();
  if (!detector) return "unavailable";
  try {
    const source = typeof input === "string" ? await loadImage(input) : input;
    const result = detector.detect(source);
    if ((result?.detections?.length ?? 0) > 0) return "face";

    // En móviles la cara puede ocupar una porción pequeña del cuadro 4:3.
    // Reintentamos sobre un recorte cuadrado centrado para darle más escala
    // al rostro, sin aceptar imágenes que no contengan una detección real.
    const width = "naturalWidth" in source ? source.naturalWidth || source.width : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight || source.height : source.height;
    if (!width || !height) return "no-face";

    const side = Math.min(width, height);
    const crop = document.createElement("canvas");
    crop.width = 640;
    crop.height = 640;
    const context = crop.getContext("2d");
    if (!context) return "no-face";
    context.drawImage(
      source,
      (width - side) / 2,
      (height - side) / 2,
      side,
      side,
      0,
      0,
      crop.width,
      crop.height,
    );

    const croppedResult = detector.detect(crop);
    return (croppedResult?.detections?.length ?? 0) > 0 ? "face" : "no-face";
  } catch (err) {
    console.warn("[face-detection] error al detectar rostro:", err);
    return "unavailable";
  }
}
