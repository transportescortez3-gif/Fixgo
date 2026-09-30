import {
  Wrench, Zap, Droplets, Sparkles, Hammer, PaintBucket, Leaf, Key, Wind,
  Flame, Truck, ShieldCheck, Tv, Wifi, Bug, Pipette, HardHat, Paintbrush,
  Trees, Plug, Lock, Snowflake, SprayCan, Scissors, Brush, Car, Heart, PawPrint,
  type LucideIcon,
} from "lucide-react";

export interface CategoryStyle {
  icon: LucideIcon;
  bg: string;
  color: string;
  border: string;
}

const categoryStyleMap: Record<string, CategoryStyle> = {
  Zap:         { icon: Zap,         bg: "bg-amber-500/15",   color: "text-amber-400",   border: "border-amber-500/20" },
  Droplets:    { icon: Droplets,    bg: "bg-blue-500/15",    color: "text-blue-400",    border: "border-blue-500/20" },
  Sparkles:    { icon: Sparkles,    bg: "bg-cyan-500/15",    color: "text-cyan-400",    border: "border-cyan-500/20" },
  Hammer:      { icon: Hammer,      bg: "bg-orange-500/15",  color: "text-orange-400",  border: "border-orange-500/20" },
  PaintBucket: { icon: PaintBucket, bg: "bg-violet-500/15",  color: "text-violet-400",  border: "border-violet-500/20" },
  Leaf:        { icon: Leaf,        bg: "bg-emerald-500/15", color: "text-emerald-400", border: "border-emerald-500/20" },
  Key:         { icon: Key,         bg: "bg-rose-500/15",    color: "text-rose-400",    border: "border-rose-500/20" },
  Wind:        { icon: Wind,        bg: "bg-sky-500/15",     color: "text-sky-400",     border: "border-sky-500/20" },
  Flame:       { icon: Flame,       bg: "bg-red-500/15",     color: "text-red-400",     border: "border-red-500/20" },
  Truck:       { icon: Truck,       bg: "bg-slate-500/15",   color: "text-slate-400",   border: "border-slate-500/20" },
  ShieldCheck: { icon: ShieldCheck,  bg: "bg-green-500/15",   color: "text-green-400",   border: "border-green-500/20" },
  Tv:          { icon: Tv,          bg: "bg-blue-500/15",  color: "text-blue-400",  border: "border-blue-500/20" },
  Wifi:        { icon: Wifi,        bg: "bg-teal-500/15",    color: "text-teal-400",    border: "border-teal-500/20" },
  Bug:         { icon: Bug,         bg: "bg-lime-500/15",    color: "text-lime-400",    border: "border-lime-500/20" },
  Pipette:     { icon: Pipette,     bg: "bg-fuchsia-500/15", color: "text-fuchsia-400", border: "border-fuchsia-500/20" },
  HardHat:     { icon: HardHat,     bg: "bg-blue-500/15",  color: "text-blue-400",  border: "border-blue-500/20" },
  Paintbrush:  { icon: Paintbrush,  bg: "bg-violet-500/15",  color: "text-violet-400",  border: "border-violet-500/20" },
  Trees:       { icon: Trees,       bg: "bg-emerald-500/15", color: "text-emerald-400", border: "border-emerald-500/20" },
  Wrench:      { icon: Wrench,      bg: "bg-zinc-500/15",    color: "text-zinc-400",    border: "border-zinc-500/20" },
  Scissors:    { icon: Scissors,    bg: "bg-pink-500/15",    color: "text-pink-400",    border: "border-pink-500/20" },
  Car:         { icon: Car,         bg: "bg-blue-500/15",    color: "text-blue-400",    border: "border-blue-500/20" },
  Heart:       { icon: Heart,       bg: "bg-rose-500/15",    color: "text-rose-400",    border: "border-rose-500/20" },
  PawPrint:    { icon: PawPrint,    bg: "bg-amber-500/15",   color: "text-amber-400",   border: "border-amber-500/20" },
};

const defaultStyle: CategoryStyle = {
  icon: Wrench,
  bg: "bg-primary/10",
  color: "text-primary",
  border: "border-primary/20",
};

export function getCategoryIcon(iconName?: string): LucideIcon {
  if (!iconName) return Wrench;
  return categoryStyleMap[iconName]?.icon || Wrench;
}

export function getCategoryStyle(iconName?: string): CategoryStyle {
  if (!iconName) return defaultStyle;
  return categoryStyleMap[iconName] || defaultStyle;
}

const markerColorMap: Record<string, string> = {
  Zap: "#f59e0b",
  Droplets: "#3b82f6",
  Sparkles: "#06b6d4",
  Hammer: "#f97316",
  PaintBucket: "#8b5cf6",
  Leaf: "#10b981",
  Key: "#f43f5e",
  Wind: "#0ea5e9",
};

export function getCategoryMarkerColor(iconName?: string): string {
  if (!iconName) return "#2563EB";
  return markerColorMap[iconName] || "#2563EB";
}

const markerEmojiMap: Record<string, string> = {
  Zap: "⚡",
  Droplets: "🔧",
  Sparkles: "✨",
  Hammer: "🔨",
  PaintBucket: "🎨",
  Leaf: "🌿",
  Key: "🔑",
  Wind: "❄️",
};

export function getCategoryEmoji(iconName?: string): string {
  if (!iconName) return "🔧";
  return markerEmojiMap[iconName] || "🔧";
}
