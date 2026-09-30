import { createContext, useContext } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCall, UseCallReturn } from "@/hooks/use-call";
import { CallOverlay } from "@/components/call-overlay";

const CallContext = createContext<UseCallReturn | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const call = useCall(user?.id ?? null, (user as any)?.name ?? "");

  return (
    <CallContext.Provider value={call}>
      {children}
      {/* Audio remoto — montado siempre para evitar restricciones de autoplay */}
      <audio ref={call.remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCallContext(): UseCallReturn {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallContext debe usarse dentro de CallProvider");
  return ctx;
}
