import { Crown } from "lucide-react";

interface ProBadgeProps {
  planCode: string | null | undefined;
  size?: "sm" | "md";
}

export function getProTier(planCode: string | null | undefined): "pro_plus" | "pro" | null {
  if (!planCode) return null;
  if (planCode.startsWith("pro_plus")) return "pro_plus";
  if (planCode.startsWith("pro")) return "pro";
  return null;
}

export function ProBadge({ planCode, size = "sm" }: ProBadgeProps) {
  const tier = getProTier(planCode);
  if (!tier) return null;

  const isProPlus = tier === "pro_plus";

  if (size === "md") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${
          isProPlus
            ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
            : "bg-blue-500/20 border-blue-500/50 text-blue-300"
        }`}
      >
        <Crown size={11} className={isProPlus ? "text-purple-300" : "text-blue-400"} />
        {isProPlus ? "Pro+" : "Pro"}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold border ${
        isProPlus
          ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
          : "bg-blue-500/20 border-blue-500/40 text-blue-300"
      }`}
    >
      <Crown size={9} className={isProPlus ? "text-purple-300" : "text-blue-400"} />
      {isProPlus ? "Pro+" : "Pro"}
    </span>
  );
}
