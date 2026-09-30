import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";

interface PhotoPickerProps {
  onFile: (file: File) => void;
  capture?: "user" | "environment";
  children: (open: () => void) => React.ReactNode;
}

async function openNativeCamera(capture: "user" | "environment", onFile: (f: File) => void) {
  const { Camera, CameraSource, CameraResultType, CameraDirection } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    direction: capture === "user" ? CameraDirection.Front : CameraDirection.Rear,
    saveToGallery: false,
    width: 1600,
    height: 1600,
    correctOrientation: true,
  });
  if (!photo.dataUrl) return;
  const res = await fetch(photo.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
  onFile(file);
}

async function openNativeGallery(onFile: (f: File) => void) {
  const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    width: 1600,
    height: 1600,
    correctOrientation: true,
  });
  if (!photo.dataUrl) return;
  const res = await fetch(photo.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
  onFile(file);
}

export function openBrowserCamera(capture: "user" | "environment", onFile: (f: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  (input as any).capture = capture;
  input.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
  document.body.appendChild(input);
  input.onchange = () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (file) onFile(file);
  };
  input.oncancel = () => { document.body.removeChild(input); };
  input.click();
}

export function openBrowserGallery(onFile: (f: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
  document.body.appendChild(input);
  input.onchange = () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (file) onFile(file);
  };
  input.oncancel = () => { document.body.removeChild(input); };
  input.click();
}

export default function PhotoPicker({ onFile, capture = "environment", children }: PhotoPickerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const open = () => {
    setSheetOpen(true);
  };

  return (
    <>
      {children(open)}
      <PhotoSourceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCamera={() => {
          setSheetOpen(false);
          if (Capacitor.isNativePlatform()) {
            openNativeCamera(capture, onFile).catch(console.error);
          } else {
            openBrowserCamera(capture, onFile);
          }
        }}
        onGallery={() => {
          setSheetOpen(false);
          if (Capacitor.isNativePlatform()) {
            openNativeGallery(onFile).catch(console.error);
          } else {
            openBrowserGallery(onFile);
          }
        }}
      />
    </>
  );
}
