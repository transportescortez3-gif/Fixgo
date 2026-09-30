import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { getSocket } from "./use-socket";

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  role: "client" | "worker";
  interval: "monthly" | "annual";
  priceClp: number;
  features: Record<string, any>;
  isActive: boolean;
  sortOrder: number;
}

export interface UserSubscription {
  id: number;
  userId: number;
  planCode: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  interval: "monthly" | "annual";
  pricePaidClp: number;
  couponCode: string | null;
  discountClp: number;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
}

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("fixgo_token");
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["subscription", "me"],
    queryFn: async () => {
      const res = await authFetch("/api/subscriptions/me");
      if (!res.ok) throw new Error("Error al obtener suscripción");
      return res.json() as Promise<{ subscription: UserSubscription | null; plan: SubscriptionPlan | null }>;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const handleUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", "me"] });
    };
    socket.on("subscription:updated", handleUpdated);
    return () => { socket.off("subscription:updated", handleUpdated); };
  }, [user, queryClient]);

  const subscription = data?.subscription ?? null;
  const plan = data?.plan ?? null;

  const FREE_PLAN_CODES = ["client_free", "pro_free"];
  const isFree = !subscription || FREE_PLAN_CODES.includes(subscription.planCode ?? "");
  const isActive =
    subscription?.status === "active" ||
    subscription?.status === "trialing" ||
    (isFree && !!subscription);
  const isPro = subscription?.planCode === "pro_monthly" || subscription?.planCode === "pro_annual";
  const isProPlus = subscription?.planCode === "pro_plus_monthly" || subscription?.planCode === "pro_plus_annual";
  const isPremiumClient = subscription?.planCode === "client_premium_monthly" || subscription?.planCode === "client_premium_annual";
  // An active plan is the source of truth for access to the publishing flow.
  // The publication screen must not show a block when the plan is active but
  // its feature payload is stale or missing from an older plan record.
  const hasActivePlan = isActive && !!subscription && !!plan;

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / 86400000))
    : 0;

  function can(feature: string): boolean {
    if (!isActive || !plan) return false;
    const val = plan.features[feature];
    if (val === true) return true;
    if (val === -1) return true;
    if (typeof val === "number" && val > 0) return true;
    return false;
  }

  function limit(feature: string): number {
    if (!isActive || !plan) return 0;
    const val = plan.features[feature];
    if (val === -1) return Infinity;
    if (typeof val === "number") return val;
    return 0;
  }

  return {
    subscription,
    plan,
    isLoading,
    isActive,
    isFree,
    isPro,
    isProPlus,
    isPremiumClient,
    hasActivePlan,
    daysLeft,
    can,
    limit,
    refetch,
  };
}

export function useAllPlans() {
  return useQuery({
    queryKey: ["subscription", "plans"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions/plans");
      if (!res.ok) throw new Error("Error al obtener planes");
      return res.json() as Promise<SubscriptionPlan[]>;
    },
    staleTime: 1000 * 60 * 30,
  });
}
