import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getStorageUrl(objectPath: string): string {
  const token = localStorage.getItem("fixgo_token");
  const base = `/api/storage/objects/${objectPath}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
