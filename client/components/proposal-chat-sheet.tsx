import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";

async function openExternalUrl(url: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    }
  } catch (e) {
    console.warn("[openExternalUrl] native open failed, falling back to window.open", e);
  }
  try { window.open(url, "_blank", "noopener,noreferrer"); }
  catch { window.location.href = url; }
}
import { useAuth } from "@/hooks/use-auth";
import { releaseWorkerAlertSlot, useCreateMessage } from "@/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/custom-fetch";
import { useSocket, getSocket } from "@/hooks/use-socket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Check, CheckCheck, CheckCircle, Loader2, Lock, Send, ThumbsDown,
  DollarSign, RefreshCw, Phone, PhoneMissed, X, ArrowLeft, Handshake, MapPin, Navigation,
  Landmark, Copy, ShieldCheck, Receipt, Paperclip, FileText, Image as ImageIcon,
  Video, Music, Archive, Download,
} from "lucide-react";
import { UserProfileSheet } from "@/components/user-profile-sheet";
import { useCountdown } from "@/components/cancellation-charge";
import { PostServiceModal } from "@/components/post-service-modal";
import { useCallContext } from "@/contexts/call-context";
import { toast } from "sonner";
import {
  encryptMessage,
  decryptMessage,
  fetchPublicKey,
  uploadPublicKey,
  localKeyMatchesServer,
  isEncryptedBlob,
} from "@/lib/e2e-crypto";
import { getAuthToken } from "@/lib/brand-storage";
import {
  downloadAndDecryptChatAttachment,
  formatAttachmentSize,
  uploadChatAttachment,
  validateChatFiles,
  type ChatAttachmentMeta,
} from "@/lib/chat-attachments";

const PRICE_PREFIX = "__PRICE_PROPOSAL__";
const AGREEMENT_PREFIX = "__AGREEMENT__";
const TRANSFER_CARD_PREFIX = "__TRANSFER_CARD__";
const CANCELLATION_CHARGE_CARD_PREFIX = "__CANCELLATION_CHARGE_CARD__";
const UNREADABLE_ENCRYPTED_MESSAGE = "🔐 Este mensaje fue cifrado con una llave anterior";
const DISMISSED_TRANSFER_CARDS_PREFIX = "fixgo_dismissed_transfer_cards";
const CLIENT_AGREEMENT_NOTICE =
  "🔼 El experto también tiene 10 minutos para confirmar. Si cancela dentro de ese plazo, te notificaremos de inmediato para que puedas elegir a otro experto.";

function isPriceProposal(text: string): boolean {
  return text.startsWith(PRICE_PREFIX);
}

function parsePriceProposal(text: string): { price: number; isCounter?: boolean } | null {
  try {
    const json = text.slice(PRICE_PREFIX.length);
    const parsed = JSON.parse(json);
    return typeof parsed.price === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function isAgreement(text: string): boolean {
  return text.startsWith(AGREEMENT_PREFIX);
}

function parseAgreement(text: string): { address?: string; lat?: number; lng?: number } | null {
  try {
    const json = text.slice(AGREEMENT_PREFIX.length);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonCard(text: string, prefix: string): Record<string, any> | null {
  if (!text.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(text.slice(prefix.length));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function formatCLP(n: number): string {
  return "$" + n.toLocaleString("es-CL") + " CLP";
}

function AttachmentIcon({ category }: { category: string }) {
  if (category === "image") return <ImageIcon className="w-4 h-4" />;
  if (category === "video") return <Video className="w-4 h-4" />;
  if (category === "audio") return <Music className="w-4 h-4" />;
  if (category === "archive") return <Archive className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function AttachmentMessage({
  serviceId,
  workerId,
  attachments,
  otherPublicKey,
  isMe,
  caption,
}: {
  serviceId: number;
  workerId: number;
  attachments: ChatAttachmentMeta[];
  otherPublicKey: string | null;
  isMe: boolean;
  caption?: string;
}) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!otherPublicKey) return;
    let alive = true;
    const load = async (attachment: ChatAttachmentMeta) => {
      if (!attachment.e2eAvailable || urls[attachment.id] || loading[attachment.id]) return;
      setLoading(prev => ({ ...prev, [attachment.id]: true }));
      try {
        const blob = await downloadAndDecryptChatAttachment(serviceId, attachment.id, otherPublicKey, workerId);
        if (alive) setUrls(prev => ({ ...prev, [attachment.id]: URL.createObjectURL(new Blob([blob], { type: attachment.contentType })) }));
      } catch {
        if (alive) setErrors(prev => ({ ...prev, [attachment.id]: true }));
      } finally {
        if (alive) setLoading(prev => ({ ...prev, [attachment.id]: false }));
      }
    };
    attachments.forEach(attachment => { void load(attachment); });
    return () => {
      alive = false;
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [attachments, otherPublicKey, serviceId, workerId]);

  return (
    <>
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
      <div className="max-w-[88%] min-w-[240px] rounded-2xl overflow-hidden p-1.5"
        style={{
          background: isMe ? "linear-gradient(145deg, hsl(213 100% 45%), hsl(213 100% 36%))" : "hsl(218 15% 13%)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}>
        <div className="space-y-1.5">
          {attachments.map(attachment => {
            if (!attachment.e2eAvailable) {
              return (
                <div key={attachment.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 bg-black/20 text-white/60">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="text-xs">Adjunto eliminado al cerrar el trabajo</span>
                </div>
              );
            }
            const url = urls[attachment.id];
            const isMedia = attachment.category === "image" || attachment.category === "video";
            return (
              <div key={attachment.id} className="rounded-xl overflow-hidden bg-black/25">
                {attachment.category === "image" && url ? (
                  <button
                    type="button"
                    onClick={() => setViewer({ url, name: attachment.originalName })}
                    className="block w-full cursor-zoom-in"
                    aria-label={`Ampliar ${attachment.originalName}`}
                  >
                    <img src={url} alt={attachment.originalName} className="max-h-[420px] min-h-36 w-full object-cover" />
                  </button>
                ) : attachment.category === "video" && url ? (
                  <video src={url} controls playsInline preload="metadata" className="max-h-[420px] w-full bg-black" />
                ) : attachment.category === "audio" && url ? (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <Music className="h-4 w-4" />
                    </span>
                    <audio src={url} controls preload="metadata" className="h-10 min-w-0 flex-1" />
                  </div>
                ) : (
                  <a
                    href={url || undefined}
                    download={attachment.originalName}
                    className={`flex items-center gap-2.5 px-3 py-3 text-white/90 ${url ? "hover:bg-white/5" : "pointer-events-none"}`}
                  >
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 shrink-0">
                      <AttachmentIcon category={attachment.category} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{attachment.originalName}</span>
                      <span className="block text-[10px] uppercase text-white/55">
                        {attachment.originalName.split(".").pop() || attachment.category} · {formatAttachmentSize(attachment.size)}
                      </span>
                    </span>
                    <Download className="w-4 h-4 text-white/60 shrink-0" />
                  </a>
                )}
                {!url && !errors[attachment.id] && (
                  <div className="px-2.5 pb-2 text-[10px] text-white/55">
                    {loading[attachment.id] ? "Descifrando adjunto…" : isMedia ? "Preparando vista previa…" : "Preparando descarga…"}
                  </div>
                )}
                {errors[attachment.id] && (
                  <div className="px-2.5 pb-2 text-[10px] text-amber-200/80">No se pudo abrir este adjunto.</div>
                )}
              </div>
            );
          })}
          {caption ? <p className="px-2 py-1 text-[13px] text-white/90 whitespace-pre-wrap break-words">{caption}</p> : null}
          <div className="flex justify-end px-1 pb-0.5 text-[10px] text-white/45">
            {new Date(attachments[0]?.createdAt ?? Date.now()).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            {isMe ? <CheckCheck className="ml-0.5 h-3 w-3" /> : null}
          </div>
        </div>
      </div>
    </div>
    {viewer && createPortal(
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/95 p-3"
        onClick={() => setViewer(null)}
        role="dialog"
        aria-modal="true"
        aria-label={viewer.name}
      >
        <button
          type="button"
          onClick={() => setViewer(null)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Cerrar imagen"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={viewer.url}
          alt={viewer.name}
          className="max-h-[92dvh] max-w-full object-contain"
          onClick={event => event.stopPropagation()}
        />
      </div>,
      document.body,
    )}
    </>
  );
}

function PendingFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  if (file.type.startsWith("image/") && url) {
    return <img src={url} alt="" className="h-24 w-24 rounded-xl object-cover" />;
  }
  if (file.type.startsWith("video/") && url) {
    return <video src={url} muted preload="metadata" className="h-24 w-24 rounded-xl bg-black object-cover" />;
  }
  return (
    <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-white/5">
      <AttachmentIcon category={file.type.startsWith("audio/") ? "audio" : "document"} />
    </span>
  );
}

export interface ProposalChatSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceId: number;
  workerId: number;
  workerName: string;
  workerAvatar?: string | null;
  proposalId?: number;
  onAccept?: () => void;
  onReject?: () => void;
  accepting?: boolean;
  acceptLabel?: string;
  otherUserId?: number;
  onCounter?: (proposalId: number) => Promise<void>;
  budgetNote?: string | null;
  isPending?: boolean;
  /** true cuando el usuario actual es el CLIENTE del servicio (no el trabajador) */
  iAmClient?: boolean;
  /** Dirección y coordenadas del cliente — usadas para el botón "Llegamos a un acuerdo" */
  clientAddress?: string | null;
  clientLat?: number | null;
  clientLng?: number | null;
  /** true cuando el servicio está cerrado/completado — muestra historial sin input de envío */
  readOnly?: boolean;
  /** Estado del servicio (completed, cancelled, etc.) — usado para el mensaje mostrado cuando readOnly es true */
  serviceStatus?: string | null;
  /** Método de pago del servicio — permite recuperar la tarjeta oficial si el marcador no llegó al historial */
  paymentMethod?: string | null;
  /** Estado de la propuesta — "rejected" muestra banner de no seleccionado */
  proposalStatus?: string | null;
  /** true cuando el cliente solicitó cotización explícita */
  requestQuote?: boolean;
  /** Fin de la ventana de cancelación gratis (10 min tras confirmar el acuerdo).
   *  Mientras está activa: el cliente puede cancelar sin costo y el experto NO
   *  ve la dirección (debe esperar antes de salir). */
  freeCancelUntil?: string | null;
  /** El experto ya completó la selfie requerida para iniciar el desplazamiento. */
  workerSelfieCompleted?: boolean;
}

export function ProposalChatSheet({
  open, onOpenChange, serviceId, workerId, workerName, workerAvatar,
  proposalId, onAccept, onReject, accepting, acceptLabel = "Conectar",
  otherUserId, onCounter, budgetNote, isPending, serviceStatus,
  iAmClient, clientAddress, clientLat, clientLng, readOnly, proposalStatus,
  requestQuote, freeCancelUntil, paymentMethod, workerSelfieCompleted = false,
}: ProposalChatSheetProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { startCall } = useCallContext();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [priceMode, setPriceMode] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [sendingPrice, setSendingPrice] = useState(false);
  const [counteringMsg, setCounteringMsg] = useState<number | null>(null);
  const [addressMode, setAddressMode] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const [decryptedCache, setDecryptedCache] = useState<Record<number, string>>({});
  const [otherPublicKey, setOtherPublicKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [keyRestoring, setKeyRestoring] = useState(false);
  const [secureCardData, setSecureCardData] = useState<Record<number, Record<string, any>>>({});
  const [secureCardErrors, setSecureCardErrors] = useState<Record<number, string>>({});
  const dismissedTransferStorageKey = `${DISMISSED_TRANSFER_CARDS_PREFIX}:${user?.id ?? "unknown"}`;
  const [dismissedCardIds, setDismissedCardIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(dismissedTransferStorageKey);
      const ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []);
    } catch {
      return new Set();
    }
  });
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [otherPresence, setOtherPresence] = useState<{ online: boolean; lastSeen: number | null }>({ online: false, lastSeen: null });
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSecurityBanner, setShowSecurityBanner] = useState(true);
  // Finalización en vivo: cuando el cliente completa el trabajo con el chat
  // abierto, el sheet pasa a solo-lectura y al trabajador se le abre el modal
  // de calificación encima del chat (el Dialog usa z-[1101] > z-[100] del sheet).
  const [liveCompleted, setLiveCompleted] = useState(false);
  // Cancelación en vivo: el servicio fue cancelado con el chat abierto.
  const [liveCancelled, setLiveCancelled] = useState(false);
  // El cliente eligió a OTRO profesional mientras este chat está abierto:
  // congelar el input en vivo (el prop proposalStatus puede tardar en refrescar
  // o quedar stale si la query de propuestas del padre está deshabilitada).
  const [liveRejected, setLiveRejected] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSentBudget = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dismissTransferCard = (messageId: number) => {
    setDismissedCardIds(prev => {
      const next = new Set(prev);
      next.add(messageId);
      try {
        localStorage.setItem(dismissedTransferStorageKey, JSON.stringify([...next]));
      } catch {
        // El estado local sigue ocultando la tarjeta durante esta apertura.
      }
      return next;
    });
  };

  const markTransferNotificationsRead = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch("/api/notifications?unreadOnly=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const notifications = await response.json();
      const paymentNotifications = (Array.isArray(notifications) ? notifications : [])
        .filter((notification: any) =>
          notification.type === "payment" && notification.relatedId === serviceId
        );
      await Promise.all(paymentNotifications.map((notification: any) =>
        fetch(`/api/notifications/${notification.id}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        })
      ));
    } catch {
      // La tarjeta ya quedó oculta localmente; el aviso se sincronizará
      // cuando el servidor confirme la transferencia.
    }
  };

  // Las tarjetas automáticas no transportan datos bancarios en el mensaje.
  // El cliente los obtiene únicamente al abrir este hilo autorizado.
  useEffect(() => {
    if (!iAmClient || localMsgs.length === 0) return;
    const pending = localMsgs.filter((m: any) => {
      const content = getDisplayContent(m);
      return (content === TRANSFER_CARD_PREFIX || content === CANCELLATION_CHARGE_CARD_PREFIX)
        && !secureCardData[m.id];
    });
    if (pending.length === 0) return;
    const token = getAuthToken();
    pending.forEach(async (m: any) => {
      try {
        const content = getDisplayContent(m);
        const url = content === TRANSFER_CARD_PREFIX
          ? `/api/services/${serviceId}/transfer-info`
          : `/api/cancellation-charges/my`;
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          if (content === TRANSFER_CARD_PREFIX && response.status === 404) {
            setSecureCardErrors(prev => ({
              ...prev,
              [m.id]: "El experto aún no tiene sus datos bancarios completos registrados.",
            }));
          }
          return;
        }
        const body = await response.json();
        const data = content === TRANSFER_CARD_PREFIX
          ? body
          : (body.asClient ?? []).find((charge: any) => charge.serviceId === serviceId);
        if (data) {
          setSecureCardData(prev => ({ ...prev, [m.id]: data }));
          if (content === TRANSFER_CARD_PREFIX) {
            setSecureCardErrors(prev => {
              if (!prev[m.id]) return prev;
              const next = { ...prev };
              delete next[m.id];
              return next;
            });
          }
        }
      } catch {
        // El marcador permanece en el chat; no se muestra ningún dato parcial.
      }
    });
  }, [iAmClient, localMsgs, secureCardData, serviceId]);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const createMsg = useCreateMessage();

  const myId = user?.id;
  const otherId = otherUserId ?? (myId === workerId ? undefined : workerId);
  const isClient = myId !== workerId;

  // Estado local para el freeCancelUntil/serviceStatus que llegan vía socket
  // (cuando el chat ya estaba abierto al momento de la aceptación).
  const [liveFreeCancelUntil, setLiveFreeCancelUntil] = useState<string | null | undefined>(undefined);
  const [liveServiceStatus, setLiveServiceStatus] = useState<string | null>(null);

  // Usar el valor en vivo si llegó vía socket, incluso cuando sea null para
  // limpiar un contador anterior; si no, conservar el prop del servidor.
  const effectiveFreeCancelUntil = liveFreeCancelUntil !== undefined ? liveFreeCancelUntil : freeCancelUntil;
  const effectiveServiceStatus   = liveServiceStatus   ?? serviceStatus;
  const isEffectivelyPending = !!isPending &&
    !["in_progress", "completed", "cancelled"].includes(effectiveServiceStatus ?? "");

  // En servicios completados antiguos puede existir la transferencia pero no
  // el mensaje marcador (por ejemplo, si la finalización ocurrió mientras el
  // servidor estaba reiniciándose). Al abrir el hilo, recuperar los datos por
  // el endpoint autorizado y crear un marcador local evita dejar al cliente
  // sin la tarjeta oficial. El mensaje real, si llega después, prevalece.
  useEffect(() => {
    if (
      !open ||
      !iAmClient ||
      !messagesLoaded ||
      effectiveServiceStatus !== "completed"
    ) return;

    const hasTransferMarker = localMsgs.some(
      (m: any) => getDisplayContent(m) === TRANSFER_CARD_PREFIX,
    );
    const fallbackMessageId = -serviceId;
    if (
      hasTransferMarker ||
      dismissedCardIds.has(fallbackMessageId) ||
      secureCardData[fallbackMessageId] ||
      secureCardErrors[fallbackMessageId]
    ) {
      return;
    }

    const token = getAuthToken();
    fetch(`/api/services/${serviceId}/transfer-info`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async response => {
        if (response.ok) return response.json();
        if (response.status === 404) {
          setSecureCardErrors(prev => ({
            ...prev,
            [fallbackMessageId]: "El experto aún no tiene sus datos bancarios completos registrados.",
          }));
          setLocalMsgs(prev => {
            if (prev.some((m: any) => getDisplayContent(m) === TRANSFER_CARD_PREFIX)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: fallbackMessageId,
                serviceId,
                senderId: workerId,
                workerId,
                content: TRANSFER_CARD_PREFIX,
                messageType: "transfer_card",
                createdAt: new Date().toISOString(),
                sender: null,
              },
            ];
          });
        }
        return null;
      })
      .then(data => {
        if (!data) return;
        setSecureCardData(prev => ({ ...prev, [fallbackMessageId]: data }));
        setSecureCardErrors(prev => {
          if (!prev[fallbackMessageId]) return prev;
          const next = { ...prev };
          delete next[fallbackMessageId];
          return next;
        });
        setLocalMsgs(prev => {
          if (prev.some((m: any) => getDisplayContent(m) === TRANSFER_CARD_PREFIX)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: fallbackMessageId,
              serviceId,
              senderId: workerId,
              workerId,
              content: TRANSFER_CARD_PREFIX,
              messageType: "transfer_card",
              createdAt: new Date().toISOString(),
              sender: null,
            },
          ];
        });
      })
      .catch(() => {
        // El marcador real o la siguiente apertura podrá reintentar la carga.
      });
  }, [
    open,
    iAmClient,
    messagesLoaded,
    effectiveServiceStatus,
    serviceId,
    workerId,
    localMsgs,
    secureCardData,
    secureCardErrors,
    dismissedCardIds,
  ]);

  // Ventana de cancelación gratis (10 min desde que se confirma el acuerdo):
  // mientras esté activa, el experto NO ve la dirección y debe esperar antes
  // de salir; el cliente puede cancelar sin costo.
  const freeCancel = useCountdown(effectiveFreeCancelUntil);
  const freeCancelActive = freeCancel.active && effectiveServiceStatus === "in_progress";
  // "Recién expiró": mostrar aviso de que ya puede salir / va en camino.
  const freeCancelJustEnded = !!effectiveFreeCancelUntil && freeCancel.expired && effectiveServiceStatus === "in_progress";
  const workerNeedsSecuritySelfie = !isClient && !workerSelfieCompleted;
  const releaseStateRef = useRef({ open, serviceId, iAmClient });
  const latestReservationRef = useRef({ open, serviceId, iAmClient });
  const unmountReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestReservationRef.current = { open, serviceId, iAmClient };

  useEffect(() => {
    const previous = releaseStateRef.current;
    if (
      previous.open &&
      (!open || previous.serviceId !== serviceId) &&
      !previous.iAmClient
    ) {
      void releaseWorkerAlertSlot(previous.serviceId).catch(() => {});
    }
    releaseStateRef.current = { open, serviceId, iAmClient };
  }, [open, serviceId, iAmClient]);

  useEffect(() => {
    if (unmountReleaseTimerRef.current) {
      clearTimeout(unmountReleaseTimerRef.current);
      unmountReleaseTimerRef.current = null;
    }
    return () => {
      const current = latestReservationRef.current;
      if (!current.open || current.iAmClient) return;
      unmountReleaseTimerRef.current = setTimeout(() => {
        void releaseWorkerAlertSlot(current.serviceId).catch(() => {});
        unmountReleaseTimerRef.current = null;
      }, 0);
    };
  }, []);

  /* Animación de entrada/salida */
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = "hidden";
    } else {
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    setOtherPublicKey(null);
    setKeyError(false);
  }, [otherId]);

  useEffect(() => {
    setDecryptedCache(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(next).forEach(([id, value]) => {
        if (value === UNREADABLE_ENCRYPTED_MESSAGE) {
          delete next[Number(id)];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [otherPublicKey]);

  useEffect(() => {
    if (open) setKeyError(false);
  }, [open]);

  useEffect(() => {
    if (!open || !otherId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Sube la clave propia. NUNCA se auto-regenera la llave aquí ante un fallo:
    // rotar sin confirmación del usuario dejaría indescifrable el historial
    // para ambos participantes (ver invariante de llaves E2E). uploadPublicKey
    // ya absorbe sus propios errores de red/estado internamente; si el envío
    // real de un mensaje falla más adelante por falta de llave, se le pedirá
    // al usuario restaurar el acceso explícitamente (botón dedicado).
    const syncKeys = async () => {
      const delays = [0, 800, 1800, 3500];
      for (const delay of delays) {
        if (cancelled) return;
        if (delay > 0) {
          await new Promise<void>(resolve => {
            retryTimer = setTimeout(resolve, delay);
          });
        }
        if (cancelled) return;
        await uploadPublicKey();
        const key = await fetchPublicKey(otherId);
        if (cancelled) return;
        if (key) {
          setOtherPublicKey(key);
          return;
        }
      }
    };

    void syncKeys();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [open, otherId, effectiveServiceStatus]);

  // Cada par trabajador-cliente es un hilo independiente.
  // El cliente filtra por ?workerId=X para ver solo el hilo con ese trabajador.
  // El trabajador no filtra (el servidor usa su propia ID automáticamente).
  const messagesQueryKey = [`/api/services/${serviceId}/messages`, workerId] as const;
  const { data: messagesData } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: () => {
      const url = isClient
        ? `/api/services/${serviceId}/messages?workerId=${workerId}`
        : `/api/services/${serviceId}/messages`;
      return customFetch<any>(url);
    },
    // La query se activa apenas existe serviceId, no solo cuando el chat está abierto.
    // Así los mensajes están listos antes de que el usuario abra el sheet (comportamiento WhatsApp).
    enabled: !!serviceId,
    refetchInterval: false,
    staleTime: 0,
    refetchOnMount: 'always' as const,
  });

  const fetched: any[] = (messagesData as any)?.messages || (Array.isArray(messagesData) ? messagesData : []);

  // Bug 1: Forzar re-fetch del historial cada vez que se abre el chat.
  // staleTime: Infinity previene re-fetch automático; esta invalidación asegura
  // que el mensaje de "acuerdo" (y cualquier mensaje reciente) siempre aparezca.
  useEffect(() => {
    if (!open) return;
    queryClient.invalidateQueries({ queryKey: messagesQueryKey });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Limpiar mensajes locales cuando cambia el hilo (workerId distinto = otra propuesta).
  // NO se limpia al cerrar/abrir el mismo hilo: así al reabrir se muestran los mensajes
  // previos instantáneamente mientras llegan los datos frescos del servidor.
  // IMPORTANTE: ignorar transiciones a undefined/null — ocurren durante el re-render
  // posterior a aceptar una propuesta y causan limpiezas falsas del historial.
  const prevWorkerIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!workerId) return; // ignorar estados intermedios sin workerId válido
    if (prevWorkerIdRef.current !== null && prevWorkerIdRef.current !== workerId) {
      setLocalMsgs([]);
      setDecryptedCache({});
      setMessagesLoaded(false);
    }
    prevWorkerIdRef.current = workerId;
  }, [workerId]);

  // Carga inicial y merges tras reconexión/re-apertura.
  // Al recibir datos del servidor: MERGE — nunca reemplaza mensajes optimistas/socket.
  useEffect(() => {
    if (!messagesData) return;
    setLocalMsgs(prev => {
      // Primera carga (lista vacía): inicializar directamente
      if (prev.length === 0) return fetched;
      // Re-fetch o reconexión: añadir solo mensajes que faltan
      const existingIds = new Set(prev.map((m: any) => m.id));
      const missing = fetched.filter((m: any) => !existingIds.has(m.id));
      if (missing.length === 0) return prev;
      return [...prev, ...missing].sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
    setMessagesLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesData]);

  useEffect(() => {
    if (!otherPublicKey || localMsgs.length === 0) return;
    const pending = localMsgs.filter(m => isEncryptedBlob(m.content) && !decryptedCache[m.id]);
    if (pending.length === 0) return;
    let keyHealthPromise: Promise<boolean | null> | null = null;
    Promise.all(
      pending.map(async m => {
        try {
          const plain = await decryptMessage(m.content, otherPublicKey);
          return { id: m.id, text: plain };
        } catch {
          keyHealthPromise ??= localKeyMatchesServer().catch(() => null);
          const keyIsCurrent = await keyHealthPromise;
          if (keyIsCurrent === false) setKeyError(true);
          return { id: m.id, text: UNREADABLE_ENCRYPTED_MESSAGE };
        }
      })
    ).then(results => {
      setDecryptedCache(prev => {
        const next = { ...prev };
        results.forEach(r => {
          if (r) next[r.id] = r.text;
        });
        return next;
      });
    });
  }, [localMsgs, otherPublicKey]);

  const handleNewMessage = useCallback((msg: any) => {
    // Filtrar mensajes que no corresponden a este servicio (pueden llegar del user-room global)
    if (msg.serviceId && msg.serviceId !== serviceId) return;
    setLocalMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    if (msg.senderId === otherId) setIsOtherTyping(false);
    // Invalidar query para sincronizar con el servidor
    queryClient.invalidateQueries({ queryKey: [`/api/services/${serviceId}/messages`, workerId] });
  }, [otherId, serviceId, workerId, queryClient]);

  // Listener de socket para mensajes del user-room — activo SIEMPRE que exista serviceId,
  // independientemente de si el chat está abierto o cerrado. Esto garantiza que mensajes
  // enviados vía emitToUser (ej. "⛔ El cliente eligió a otro profesional") lleguen aunque
  // el trabajador tenga el chat cerrado en ese momento.
  useEffect(() => {
    if (!serviceId) return;
    const socket = getSocket();
    const qKey = [`/api/services/${serviceId}/messages`, workerId];

    const handler = (msg: any) => {
      if (msg.serviceId && msg.serviceId !== serviceId) return;
      setLocalMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    };

    // Al reconectar: fetch único para recuperar mensajes perdidos durante la desconexión
    const handleReconnect = () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    };

    socket.on("new_message", handler);
    socket.on("connect", handleReconnect);
    return () => {
      socket.off("new_message", handler);
      socket.off("connect", handleReconnect);
    };
  }, [serviceId, workerId, queryClient]);

  const conversation = useMemo(() => {
    return localMsgs.filter(m => m.senderId === myId || m.senderId === otherId);
  }, [localMsgs, myId, otherId]);

  const handleUserTyping = useCallback((data: { userId: number; name: string }) => {
    if (otherId && data.userId === otherId) {
      setIsOtherTyping(true);
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      otherTypingTimer.current = setTimeout(() => setIsOtherTyping(false), 4000);
    }
  }, [otherId]);

  const handleUserStopTyping = useCallback((data: { userId: number }) => {
    if (otherId && data.userId === otherId) {
      setIsOtherTyping(false);
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
    }
  }, [otherId]);

  const handlePresenceUpdate = useCallback((data: { userId: number; online: boolean; lastSeen: number | null }) => {
    if (otherId && data.userId === otherId) {
      setOtherPresence({ online: data.online, lastSeen: data.lastSeen });
    }
  }, [otherId]);

  const handleServiceUpdated = useCallback((data: { serviceId: number; status?: string; freeCancelUntil?: string | null }) => {
    if (data.serviceId !== serviceId) return;
    if (data.status === "cancelled") {
      // Cancelación en vivo: bloquear el input de inmediato para que el otro
      // participante no siga escribiendo en una conversación cerrada.
      setLiveCancelled(true);
      return;
    }
    if (data.status === "in_progress") {
      // Propuesta aceptada con chat ya abierto: actualizar estado local para
      // mostrar el countdown de cancelación gratis SIN necesitar salir y volver.
      setLiveServiceStatus("in_progress");
      if (data.freeCancelUntil !== undefined) setLiveFreeCancelUntil(data.freeCancelUntil);
      queryClient.invalidateQueries({
        queryKey: [`/api/services/${serviceId}/messages`],
      });
      return;
    }
    if (data.status !== "completed") return;
    setLiveCompleted(true);
    // Solo el trabajador califica desde aquí: el cliente ya tiene su propio
    // modal post-servicio en el flujo donde marca el trabajo como completado.
    if (myId === workerId && otherId) setRateOpen(true);
  }, [serviceId, myId, workerId, otherId, queryClient]);

  const handleProposalUpdated = useCallback((data: { serviceId: number; action?: string }) => {
    if (data.serviceId !== serviceId) return;
    // El servidor emite "not_selected" SOLO al worker rechazado (emitToUser).
    // Si soy el worker de este hilo, congelar el chat de inmediato.
    if (data.action === "not_selected" && myId === workerId) {
      setLiveRejected(true);
      // Cerrar modos de edición abiertos (precio/dirección) para que el banner
      // de rechazo reemplace la barra inferior de inmediato.
      setPriceMode(false);
      setPriceInput("");
      setCounteringMsg(null);
      setAddressMode(false);
    }
  }, [serviceId, myId, workerId]);

  const { emitTyping, emitStopTyping, queryPresence, unsubscribePresence } = useSocket({
    serviceId: open ? serviceId : null,
    // workerId identifica el hilo trabajador-cliente; aísla esta sala de otros hilos
    // del mismo servicio y previene que mensajes lleguen a trabajadores no relacionados.
    threadWorkerId: isEffectivelyPending ? workerId : null,
    onNewMessage: handleNewMessage,
    onUserTyping: handleUserTyping,
    onUserStopTyping: handleUserStopTyping,
    onPresenceUpdate: handlePresenceUpdate,
    onServiceUpdated: handleServiceUpdated,
    onProposalUpdated: handleProposalUpdated,
  });

  useEffect(() => {
    if (!open || !otherId) return;
    const t = setTimeout(() => queryPresence(otherId), 200);
    return () => {
      clearTimeout(t);
      unsubscribePresence(otherId);
    };
  }, [open, otherId, queryPresence, unsubscribePresence]);

  const handleTextChange = (v: string) => {
    setText(v);
    if (!myId || !user?.name) return;
    if (!isTypingRef.current && v.length > 0) {
      isTypingRef.current = true;
      emitTyping(myId, user.name);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      if (isTypingRef.current && myId) {
        isTypingRef.current = false;
        emitStopTyping(myId);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (isTypingRef.current && myId) {
        isTypingRef.current = false;
        emitStopTyping(myId);
      }
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
    };
  }, [myId, emitStopTyping]);

  const presenceText = useMemo(() => {
    if (isOtherTyping) return null;
    if (otherPresence.online) return "en línea";
    if (!otherPresence.lastSeen) return null;
    const now = Date.now();
    const diff = now - otherPresence.lastSeen;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "última vez hace un momento";
    if (mins < 60) return `última vez hace ${mins} min`;
    const d = new Date(otherPresence.lastSeen);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const timeStr = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `última vez hoy a las ${timeStr}`;
    if (d.toDateString() === yesterday.toDateString()) return `última vez ayer a las ${timeStr}`;
    return `última vez ${d.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`;
  }, [isOtherTyping, otherPresence]);

  /* Auto-envío del presupuesto como mensaje cifrado (solo cliente, solo 1 vez) */
  useEffect(() => {
    if (
      !open ||
      !messagesLoaded ||
      !budgetNote ||
      !isClient ||
      !otherPublicKey ||
      autoSentBudget.current ||
      conversation.length > 0
    ) return;

    autoSentBudget.current = true;

    const token = getAuthToken();

    // Extraer número si el budgetNote contiene uno (ej: "45.000 CLP" → 45000)
    const digits = budgetNote.replace(/\./g, "").replace(/,/g, "").match(/\d+/);
    const price = digits ? parseInt(digits[0], 10) : null;

    const sendBudget = async () => {
      try {
        let content: string;
        if (price && price > 0) {
          content = `${PRICE_PREFIX}${JSON.stringify({ price, isCounter: false })}`;
        } else {
          content = `💰 Mi presupuesto de referencia: ${budgetNote}`;
        }

        // Cifrado obligatorio (el efecto solo corre con otherPublicKey presente).
        // Si el cifrado falla, se aborta el auto-envío en vez de mandar texto plano.
        let payload: string;
        try {
          payload = await encryptMessage(content, otherPublicKey!);
        } catch {
          autoSentBudget.current = false;
          return;
        }

        const extraData: any = { content: payload };
        if (isEffectivelyPending) extraData.workerId = workerId;

        const msg = await createMsg.mutateAsync({ serviceId, data: extraData as any });
        setDecryptedCache(prev => ({ ...prev, [msg.id]: content }));
        handleNewMessage(msg);
        queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      } catch {}
    };

    sendBudget();
  }, [open, messagesLoaded, budgetNote, isClient, conversation.length, otherPublicKey]);

  useEffect(() => {
    if (!open) return;

    // Esperar a que el historial y las tarjetas hayan terminado de renderizarse.
    // El scroll suave sobre el marcador podía dejar la vista a mitad del hilo
    // cuando el contenido cambiaba mientras se abría en un móvil.
    const scrollToLatest = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    };

    const firstFrame = requestAnimationFrame(() => {
      scrollToLatest();
      requestAnimationFrame(scrollToLatest);
    });
    return () => cancelAnimationFrame(firstFrame);
  }, [conversation.length, decryptedCache, messagesLoaded, open]);

  const getDisplayContent = (m: any): string => {
    if (isEncryptedBlob(m.content)) return decryptedCache[m.id] ?? "🔐 Descifrando…";
    return m.content;
  };

  const encryptAndSend = async (content: string, extraBodyData?: Record<string, any>): Promise<any> => {
    if (!otherPublicKey) {
      throw new Error("Aún no se pudo establecer el cifrado con el otro usuario. Intenta de nuevo en unos segundos.");
    }
    let payload: string;
    try {
      payload = await encryptMessage(content, otherPublicKey);
    } catch {
      // NUNCA regenerar la llave automáticamente aquí: si falla el cifrado
      // (p.ej. este dispositivo no tiene la llave original y el servidor ya
      // tiene una pública sin respaldo), auto-regenerar rotaría la pública en
      // el servidor y dejaría INDESCIFRABLE todo el historial para ambos
      // participantes — justo lo que la invariante de llaves E2E prohíbe. Se
      // bloquea el envío y se exige una acción explícita del usuario (botón
      // "Restaurar acceso E2E"), que es la única vía legítima de rotar.
      setKeyError(true);
      throw new Error("No se pudo establecer el cifrado. Usa el botón para restaurar tu acceso E2E.");
    }
    const extraData: any = { content: payload, ...extraBodyData };
    if (isEffectivelyPending) extraData.workerId = workerId;
    const msg = await createMsg.mutateAsync({ serviceId, data: extraData as any });
    setDecryptedCache(prev => ({ ...prev, [msg.id]: content }));
    handleNewMessage(msg);
    queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    return msg;
  };

  const addFiles = (incoming: File[]) => {
    if (!canSendAttachments) {
      toast.info(attachmentLockedMessage);
      return;
    }
    const combined = [...pendingFiles, ...incoming];
    if (combined.length > 5) {
      toast.error("Puedes enviar hasta 5 archivos por mensaje");
      return;
    }
    const next = combined;
    const validationError = validateChatFiles(next);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPendingFiles(next);
  };

  const send = async () => {
    const content = text.trim();
    if (!content && pendingFiles.length === 0) return;
    const filesToSend = pendingFiles;
    if (filesToSend.length > 0 && !canSendAttachments) {
      toast.info(attachmentLockedMessage);
      return;
    }
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setPendingFiles([]);
    try {
      if (filesToSend.length > 0) {
        if (!otherPublicKey) throw new Error("Aún no se pudo establecer el cifrado con el otro usuario.");
        setSendingAttachments(true);
        const totalBytes = filesToSend.reduce((sum, file) => sum + file.size, 0);
        const uploaded: ChatAttachmentMeta[] = [];
        for (const file of filesToSend) {
          uploaded.push(await uploadChatAttachment(serviceId, file, otherPublicKey, filesToSend.length, totalBytes, workerId));
        }
        await encryptAndSend(content, {
          attachmentIds: uploaded.map(attachment => attachment.id),
        });
      } else {
        await encryptAndSend(content);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Error al enviar mensaje");
      setText(content);
      setPendingFiles(filesToSend);
    } finally {
      setSendingAttachments(false);
    }
  };

  const hasAgreement = useMemo(
    () => conversation.some(m => isAgreement(getDisplayContent(m))),
    [conversation, decryptedCache]
  );
  const canSendAttachments =
    !readOnly &&
    !liveCompleted &&
    !liveCancelled &&
    !liveRejected &&
    !["cancelled", "completed"].includes(effectiveServiceStatus ?? "");
  const attachmentLockedMessage = "Los adjuntos no están disponibles en este momento";

  // Hay contraoferta del trabajador si existe algún mensaje de precio enviado por el otro usuario
  const hasWorkerCounterOffer = useMemo(
    () => conversation.some(m => isPriceProposal(getDisplayContent(m)) && m.senderId !== myId),
    [conversation, myId, decryptedCache]
  );

  // Presupuesto numérico del cliente (null si no puso monto o "no tiene idea")
  const clientBudgetPrice = useMemo(() => {
    if (!budgetNote) return null;
    const digits = budgetNote.replace(/\./g, "").replace(/,/g, "").match(/\d+/);
    const p = digits ? parseInt(digits[0], 10) : null;
    return p && p > 0 ? p : null;
  }, [budgetNote]);

  // ¿Ya envié yo un precio en este chat? (para el trabajador: su cotización)
  const hasMyPrice = useMemo(
    () => conversation.some(m => isPriceProposal(getDisplayContent(m)) && m.senderId === myId),
    [conversation, myId, decryptedCache]
  );

  const openAddressMode = async () => {
    if (hasAgreement) { toast.info("Ya enviaste el acuerdo"); return; }
    if (clientAddress) {
      if (sendingAgreement) return;
      setSendingAgreement(true);
      try {
        const payload = {
          address: clientAddress,
          lat: typeof clientLat === "number" ? clientLat : null,
          lng: typeof clientLng === "number" ? clientLng : null,
        };
        const content = `${AGREEMENT_PREFIX}${JSON.stringify(payload)}`;
        await encryptAndSend(content, { messageType: "agreement" });
        toast.success("Acuerdo enviado al profesional");
      } catch (e: any) {
        toast.error(e?.response?.data?.error || e?.message || "No se pudo enviar el acuerdo");
      } finally {
        setSendingAgreement(false);
      }
      return;
    }
    setAddressInput("");
    setAddressMode(true);
    setPriceMode(false);
  };

  const sendAgreement = async () => {
    if (hasAgreement) { toast.info("Ya enviaste el acuerdo"); return; }
    if (!iAmClient) return;
    const addr = addressInput.trim();
    if (!addr) { toast.error("Ingresa tu dirección"); return; }
    setSendingAgreement(true);
    try {
      const payload = {
        address: addr,
        lat: typeof clientLat === "number" ? clientLat : null,
        lng: typeof clientLng === "number" ? clientLng : null,
      };
      const content = `${AGREEMENT_PREFIX}${JSON.stringify(payload)}`;
      await encryptAndSend(content, { messageType: "agreement" });
      setAddressMode(false);
      setAddressInput("");
      toast.success("Acuerdo enviado al profesional");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "No se pudo enviar el acuerdo");
    } finally {
      setSendingAgreement(false);
    }
  };

  /* Acepta la propuesta Y envía inmediatamente el mensaje de ubicación/acuerdo.
     Usado cuando el CLIENTE presiona "Aceptar Trabajador" o "Aceptar oferta". */
  const handleClientAccept = useCallback(async () => {
    if (!onAccept) return;
    try {
      const result = (onAccept as any)();
      if (result instanceof Promise) await result;
    } catch {}
    await openAddressMode();
  }, [onAccept, openAddressMode]);

  /* El acuerdo/ubicación se envía SOLO cuando el cliente presiona explícitamente
     "Aceptar Trabajador" (handleClientAccept) o "Enviar Ubicación". El auto-envío
     fue eliminado porque disparaba la ubicación en cuanto el chat se abría, antes
     de que el cliente aceptara la propuesta. */

  const sendPrice = async () => {
    // Guarda: el cliente ya eligió a otro profesional (la acción pudo iniciarse
    // antes del re-render que congela la barra inferior).
    if (liveRejected || proposalStatus === "rejected") {
      toast.error("El cliente eligió a otro profesional para este trabajo");
      return;
    }
    const raw = priceInput.replace(/\./g, "").replace(/,/g, "").trim();
    const amount = parseInt(raw, 10);
    if (!amount || amount <= 0) { toast.error("Ingresa un precio válido"); return; }
    setSendingPrice(true);
    try {
      // Solo es contraoferta si el OTRO ya envió un precio; si el trabajador
      // reenvía/ajusta su propia cotización (cliente sin presupuesto), no lo es.
      const prevPriceMsgs = conversation.filter(
        m => isPriceProposal(getDisplayContent(m)) && m.senderId !== myId
      );
      const isCounter = prevPriceMsgs.length > 0;
      const content = `${PRICE_PREFIX}${JSON.stringify({ price: amount, isCounter })}`;
      await encryptAndSend(content);
      if (proposalId && onCounter && isCounter) {
        const lastFromOther = [...prevPriceMsgs].reverse().find(m => m.senderId !== myId);
        if (lastFromOther) await onCounter(proposalId).catch(() => {});
      }
      setPriceMode(false);
      setPriceInput("");
      setCounteringMsg(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Error al enviar precio");
    } finally {
      setSendingPrice(false);
    }
  };

  const formatTime = (d: string | Date) => {
    try { return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  const formatDate = (d: string | Date) => {
    try {
      const date = new Date(d);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "Hoy";
      if (date.toDateString() === yesterday.toDateString()) return "Ayer";
      return date.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
    } catch { return ""; }
  };

  const groupedConversation = useMemo(() => {
    const groups: { date: string; messages: any[] }[] = [];
    let currentDate = "";
    conversation.forEach(m => {
      const d = formatDate(m.createdAt);
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, messages: [m] });
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }, [conversation]);

  if (!open && !visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex min-h-0 flex-col"
      style={{
        backgroundColor: "hsl(220 15% 5%)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── HEADER ── */}
      <div
        className="flex items-center gap-3 px-2 py-2 flex-shrink-0"
        style={{
          background: "hsl(218 25% 9%)",
          borderBottom: "1px solid hsl(218 12% 13%)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 8px)",
        }}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-white/5 transition-all active:scale-90 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
        >
          <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-primary/20">
            <AvatarImage src={workerAvatar || undefined} />
            <AvatarFallback className="text-sm font-bold bg-primary/20 text-primary">
              {workerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] leading-tight truncate text-foreground flex items-center gap-1.5">
              {workerName}
              {otherPresence.online && (
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
              )}
            </p>
            {isOtherTyping ? (
              <p className="text-[11px] leading-tight flex items-center gap-1 mt-0.5" style={{ color: "hsl(142 71% 55%)" }}>
                <span className="flex gap-[3px] items-end h-3">
                  <span className="w-1 h-1 rounded-full bg-current animate-typing-dot" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-current animate-typing-dot" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full bg-current animate-typing-dot" style={{ animationDelay: "300ms" }} />
                </span>
                escribiendo…
              </p>
            ) : presenceText ? (
              <p className="text-[11px] leading-tight mt-0.5" style={{ color: otherPresence.online ? "hsl(142 71% 55%)" : "hsl(218 10% 60%)" }}>
                {presenceText}
              </p>
            ) : (
              <p className="text-[11px] leading-tight flex items-center gap-1 mt-0.5" style={{ color: "hsl(213 80% 65%)" }}>
                <Lock className="w-2.5 h-2.5 flex-shrink-0" />
                Cifrado extremo a extremo
              </p>
            )}
          </div>
        </button>

        {otherId && (
          <button
            onClick={() => startCall(otherId, workerName, serviceId)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-90 flex-shrink-0"
            title="Llamada de voz"
          >
            <Phone className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* ── BANNER DE SEGURIDAD ── */}
      {showSecurityBanner && (
        <div className="px-3 pt-2 pb-0 shrink-0">
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-snug"
            style={{
              background: "hsl(30 90% 50% / 0.10)",
              border: "1px solid hsl(30 90% 50% / 0.30)",
              color: "hsl(30 90% 70%)",
            }}
          >
            <span className="text-base leading-none mt-0.5 shrink-0">⚠️</span>
            <span className="flex-1">
              <strong>AVISO DE SEGURIDAD:</strong> Para tu protección y mayor seguridad, las conversaciones deben mantenerse dentro de la plataforma. No compartas números de teléfono ni datos de pago por fuera: los datos de transferencia oficiales (como la visita técnica) se muestran directamente en la app cuando corresponde. El uso indebido de la plataforma con fines de fraude puede derivar en el bloqueo de la cuenta.
            </span>
            <button
              onClick={() => setShowSecurityBanner(false)}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors mt-0.5"
              aria-label="Cerrar aviso"
            >
              <X className="w-3 h-3" style={{ color: "hsl(30 90% 70%)" }} />
            </button>
          </div>
        </div>
      )}

      {/* ── VENTANA DE CANCELACIÓN GRATIS (10 min) ── */}
      {freeCancelActive && (
        <div className="px-3 pt-2 pb-0 shrink-0">
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-snug"
            style={{
              background: "hsl(213 100% 55% / 0.12)",
              border: "1px solid hsl(213 100% 55% / 0.30)",
            }}
          >
            <span className="text-lg leading-none mt-0.5 shrink-0">⏱️</span>
            <div className="flex-1">
              {isClient ? (
                <>
                  <p className="font-bold text-foreground">Puedes cancelar gratis: <span className="tabular-nums" style={{ color: "hsl(213 100% 65%)" }}>{freeCancel.label}</span></p>
                  <p className="text-muted-foreground mt-0.5">Si cancelas después de este tiempo, deberás pagar la visita técnica del experto.</p>
                  <p className="mt-1 font-semibold text-destructive">
                    Para cancelar debes dirigirte a{" "}
                    <Link href="/mis-trabajos" className="underline underline-offset-2 font-bold">
                      Mis Trabajos
                    </Link>.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-foreground">Puedes cancelar gratis: <span className="tabular-nums" style={{ color: "hsl(213 100% 65%)" }}>{freeCancel.label}</span></p>
                  <p className="text-muted-foreground mt-0.5">Experto: Si cancelas después de este tiempo, tu cuenta puede quedar suspendida temporalmente por infringir los Términos de uso.</p>
                  <p className="mt-1 font-semibold text-destructive">
                    Para cancelar debes dirigirte a{" "}
                    <Link href="/mis-trabajos" className="underline underline-offset-2 font-bold">
                      Mis Trabajos
                    </Link>.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {freeCancelJustEnded && !isClient && (
        <div className="px-3 pt-2 pb-0 shrink-0">
          <div
            role={workerNeedsSecuritySelfie ? "status" : undefined}
            className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-snug ${
              workerNeedsSecuritySelfie
                ? "ring-2 ring-amber-400/70 shadow-lg shadow-amber-500/10 motion-safe:animate-pulse motion-reduce:animate-none"
                : ""
            }`}
            style={{
              background: workerNeedsSecuritySelfie ? "hsl(38 92% 50% / 0.16)" : "hsl(142 65% 45% / 0.12)",
              border: workerNeedsSecuritySelfie ? "2px solid hsl(38 92% 55% / 0.75)" : "1px solid hsl(142 65% 45% / 0.30)",
            }}
          >
            <span className="text-lg leading-none mt-0.5 shrink-0">🚗</span>
            <div className="flex-1">
              {workerNeedsSecuritySelfie ? (
                <>
                  <p className="font-bold text-foreground">Confirma tu selfie antes de salir</p>
                  <p className="text-muted-foreground mt-0.5">El tiempo de cancelación gratis terminó. Toma tu selfie de seguridad en Mis Trabajos para ver la dirección y comenzar el desplazamiento.</p>
                  <button
                    type="button"
                    onClick={() => setLocation(`/mis-trabajos?securitySelfieServiceId=${serviceId}`)}
                    className="mt-2 rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-green-500"
                  >
                    Ir a Mis Trabajos
                  </button>
                </>
              ) : (
                <>
                  <p className="font-bold text-foreground">¡Ya puedes salir!</p>
                  <p className="text-muted-foreground mt-0.5">El tiempo de cancelación gratis del cliente terminó. Revisa la dirección en la tarjeta del acuerdo.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {freeCancelJustEnded && isClient && (
        <div className="px-3 pt-2 pb-0 shrink-0">
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-snug"
            style={{
              background: "hsl(142 65% 45% / 0.12)",
              border: "1px solid hsl(142 65% 45% / 0.30)",
            }}
          >
            <span className="text-lg leading-none mt-0.5 shrink-0">🚗</span>
            <div className="flex-1">
              <p className="font-bold text-foreground">¡El experto ya va en camino!</p>
              <p className="text-muted-foreground mt-0.5">El tiempo de cancelación gratuita terminó. El experto no canceló y ya se dirige a tu domicilio.</p>
            </div>
          </div>
        </div>
      )}

      {/* Bug 5: Banner de cotización cuando el cliente solicitó presupuesto explícito */}
      {requestQuote && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
            style={{ background: "hsl(213 100% 55% / 0.12)", border: "1px solid hsl(213 100% 55% / 0.25)" }}
          >
            <span className="text-lg leading-none mt-0.5">💬</span>
            <div>
              <p className="font-semibold text-primary text-[11px] uppercase tracking-wider mb-0.5">Cotización solicitada</p>
              <p className="text-muted-foreground leading-relaxed">
                {isClient
                  ? "PEDISTE UNA COTIZACIÓN A ESTE EXPERTO."
                  : "Este cliente solicita una cotización."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MENSAJES ── */}
      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 10% 90%, hsl(213 100% 55% / 0.04) 0%, transparent 60%)," +
            "radial-gradient(ellipse at 90% 10%, hsl(213 100% 55% / 0.03) 0%, transparent 60%)",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {/* Tarjeta de presupuesto del cliente (visible siempre que exista) */}
        {budgetNote && (
          <div className="flex justify-start mb-3 mt-2">
            <div
              className="w-64 rounded-2xl overflow-hidden"
              style={{
                background: "hsl(218 15% 13%)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
              }}
            >
              <div
                className="px-3 py-2 flex items-center gap-2"
                style={{
                  background: "hsl(218 15% 17%)",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(213 100% 70%)" }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "hsl(213 100% 70%)" }}>
                  Presupuesto del cliente
                </span>
              </div>
              <div className="px-3 py-3">
                {(() => {
                  const digits = budgetNote.replace(/\./g, "").replace(/,/g, "").match(/\d+/);
                  const price = digits ? parseInt(digits[0], 10) : null;
                  return price && price > 0
                    ? <p className="text-2xl font-black text-white leading-none">{formatCLP(price)}</p>
                    : <p className="text-base font-bold text-white leading-snug">{budgetNote}</p>;
                })()}
                <p className="text-[11px] mt-1" style={{ color: "hsl(213 80% 65%)" }}>
                  Referencia del cliente para este trabajo
                </p>
                {/* Botón aceptar trabajador — solo visible para el cliente cuando no hay contraoferta aún */}
                {isClient && onAccept && !hasAgreement && !hasWorkerCounterOffer && (
                  <button
                    onClick={async () => {
                      await onAccept?.();
                      await openAddressMode();
                    }}
                    disabled={accepting}
                    className="mt-3 w-full rounded-xl py-2 text-sm font-bold text-white transition-opacity disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #60c8ff 0%, #1a8cf8 40%, #0050d0 100%)" }}
                  >
                    {accepting ? "Aceptando…" : "✓ Aceptar trabajador"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Banner de error de clave E2E con botón de recuperación manual */}
        {keyError && (
          <div className="mx-3 my-2 p-3 rounded-xl border border-destructive/40 bg-destructive/10 flex items-start gap-3">
            <Lock className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">Acceso E2E bloqueado</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Para recuperar tu llave original sin borrar tu historial, cierra sesión e inicia sesión nuevamente.
              </p>
              <button
                disabled={keyRestoring}
                onClick={async () => {
                  setKeyRestoring(true);
                  onOpenChange(false);
                  logout();
                  setLocation("/login");
                }}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 disabled:opacity-60 transition-colors"
              >
                {keyRestoring
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                {keyRestoring ? "Abriendo inicio de sesión…" : "Restaurar desde inicio de sesión"}
              </button>
            </div>
          </div>
        )}

        {/* Estado vacío */}
        {conversation.length === 0 && !keyError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "hsl(213 100% 55% / 0.1)" }}
            >
              <Lock className="w-6 h-6" style={{ color: "hsl(213 100% 65% / 0.7)" }} />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta conversación está cifrada. Solo tú y {workerName} pueden leer los mensajes.
            </p>
          </div>
        )}

        {/* Grupos por fecha */}
        {groupedConversation.map(group => (
          <div key={group.date}>
            <div className="flex justify-center my-3">
              <span
                className="text-[11px] text-muted-foreground px-3 py-1 rounded-full select-none"
                style={{ background: "hsl(218 12% 11%)" }}
              >
                {group.date}
              </span>
            </div>

            {group.messages.map((m, idx) => {
              const isMe = m.senderId === myId;
              const rawContent = getDisplayContent(m);
              const isLoading = rawContent === "🔐 Descifrando…";
              const isPrice = !isLoading && isPriceProposal(rawContent);
              const isAgree = !isLoading && isAgreement(rawContent);
              const agreementData = isAgree ? parseAgreement(rawContent) : null;
              const isTransferCard = !isLoading && rawContent === TRANSFER_CARD_PREFIX;
              const isChargeCard = !isLoading && rawContent === CANCELLATION_CHARGE_CARD_PREFIX;
              const transferData = isTransferCard ? secureCardData[m.id] ?? null : null;
              const chargeData = isChargeCard ? secureCardData[m.id] ?? null : null;
              const priceData = isPrice ? parsePriceProposal(rawContent) : null;
              const priceAmount = priceData?.price ?? null;
              const isCounterOffer = priceData?.isCounter === true;
              const messageAttachments = (m.attachments ?? []) as ChatAttachmentMeta[];
              // Cotización del experto: precio enviado por el trabajador sin
              // presupuesto previo del cliente que contraofertar
              const isWorkerQuote = isPrice && !isCounterOffer && m.senderId === workerId;
              const canRespondToPrice = isPrice && !isMe && !!onAccept;
              const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
              const isSameSender = prevMsg?.senderId === m.senderId;

              if (isTransferCard || isChargeCard) {
                if (dismissedCardIds.has(m.id)) return null;
                const data = transferData ?? chargeData;
                const isCharge = isChargeCard;
                if (!iAmClient) return null;
                if (!data) {
                  const error = secureCardErrors[m.id];
                  return (
                    <div key={m.id} className="flex justify-center my-3">
                      <div className="rounded-2xl border border-amber-500/30 bg-[hsl(218_15%_13%)] px-4 py-3 text-xs text-amber-200">
                        {error ? `⚠️ ${error}` : "🔒 Protegiendo y cargando los datos oficiales…"}
                      </div>
                    </div>
                  );
                }
                const copyData = [
                  `Titular: ${data.holderName}`,
                  `Banco: ${data.bankName}`,
                  `Tipo de cuenta: ${data.bankAccountType}`,
                  `N° de cuenta: ${data.bankAccountNumber}`,
                  `RUT: ${data.bankRut}`,
                  ...(isCharge ? [`Monto: ${formatCLP(Number(data.amount))}`] : []),
                ].join("\n");
                return (
                  <div key={m.id} className="flex justify-center my-4">
                    <div className="w-80 max-w-full overflow-hidden rounded-2xl border border-amber-500/40 bg-[hsl(218_15%_13%)] shadow-lg">
                      <div className="flex items-center gap-2 border-b border-white/10 bg-amber-500/15 px-3 py-2.5">
                        {isCharge
                          ? <Receipt className="h-4 w-4 shrink-0 text-amber-400" />
                          : <Landmark className="h-4 w-4 shrink-0 text-amber-400" />}
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          {isCharge ? "Visita técnica pendiente" : "Datos oficiales de transferencia"}
                        </span>
                      </div>
                      <div className="space-y-2 px-3 py-3 text-[13px] text-white/90">
                        {isCharge && (
                          <p className="font-bold text-amber-300">
                            Debes transferir {formatCLP(Number(data.amount))} al experto
                          </p>
                        )}
                        <p><span className="text-white/50">Titular:</span> <strong>{data.holderName}</strong></p>
                        <p><span className="text-white/50">Banco:</span> {data.bankName}</p>
                        <p><span className="text-white/50">Tipo de cuenta:</span> {data.bankAccountType}</p>
                        <p><span className="text-white/50">N° de cuenta:</span> {data.bankAccountNumber}</p>
                        <p><span className="text-white/50">RUT:</span> {data.bankRut}</p>
                        {isCharge && data.deadlineAt && (
                          <p className="text-[11px] text-white/60">
                            Envía el comprobante antes del {new Date(data.deadlineAt).toLocaleString("es-CL")}
                          </p>
                        )}
                        <div className="flex items-start gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-[11px] leading-snug text-emerald-300">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Datos bancarios oficiales y protegidos dentro del chat. Nunca pagues ni compartas datos fuera de Fixgo.
                        </div>
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[12px] font-bold text-black transition hover:bg-amber-400"
                          onClick={() => {
                            navigator.clipboard?.writeText(copyData);
                            toast.success("Datos copiados");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" /> Copiar datos
                        </button>
                        {!isCharge && (
                          <button
                            type="button"
                            className="w-full rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-white/75 transition hover:bg-white/5"
                            onClick={() => {
                              dismissTransferCard(m.id);
                              void markTransferNotificationsRead();
                            }}
                          >
                            Transferencia realizada
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              /* ── Mensaje de sistema (ej: propuesta aceptada) ── */
              if (m.messageType === "system") {
                // Los avisos negativos (cancelación, rechazo) van con ⛔ y se
                // pintan en rojo; el resto mantiene el verde de confirmación.
                const isNegativeSystem = String(m.content).startsWith("⛔");
                return (
                  <div key={m.id} className="flex justify-center my-3">
                    <div
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold max-w-[80%] text-center"
                      style={isNegativeSystem
                        ? { background: "hsl(0 50% 12%)", border: "1px solid hsl(0 50% 25%)", color: "hsl(0 70% 70%)" }
                        : { background: "hsl(142 50% 15%)", border: "1px solid hsl(142 50% 25%)", color: "hsl(142 70% 70%)" }}
                    >
                      {isNegativeSystem
                        ? <X className="w-3.5 h-3.5 flex-shrink-0" />
                        : <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span>{m.content}</span>
                    </div>
                  </div>
                );
              }

              /* ── Dirección del trabajo (enviada automáticamente al aceptar) ── */
              if (m.messageType === "location_share") {
                let locAddress = "";
                try { locAddress = JSON.parse(m.content)?.address ?? ""; } catch { locAddress = m.content; }
                if (!isClient && !workerSelfieCompleted) {
                  return (
                    <div key={m.id} className="flex justify-center my-3">
                      <div className="w-72 rounded-2xl border border-amber-400/30 bg-[hsl(218_15%_13%)] px-3 py-3 text-xs">
                        <p className="font-bold text-amber-300">Dirección protegida</p>
                        <p className="mt-1 text-white/65">
                          Completa tu selfie de seguridad en Mis Trabajos para verla y comenzar el desplazamiento.
                        </p>
                        <button
                          type="button"
                          onClick={() => setLocation(`/mis-trabajos?securitySelfieServiceId=${serviceId}`)}
                          className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 font-bold text-black"
                        >
                          Ir a Mis Trabajos
                        </button>
                      </div>
                    </div>
                  );
                }
                const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locAddress)}&travelmode=driving`;
                const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(locAddress)}&navigate=yes`;
                return (
                  <div key={m.id} className="flex justify-center my-3">
                    <div
                      className="w-72 rounded-2xl overflow-hidden"
                      style={{ background: "hsl(218 15% 13%)", boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}
                    >
                      <div
                        className="px-3 py-2 flex items-center gap-2"
                        style={{ background: "hsl(213 100% 18%)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(213 100% 70%)" }} />
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(213 100% 75%)" }}>
                          Dirección del trabajo
                        </span>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-[13px] text-white/90 leading-snug break-words">{locAddress}</p>
                      </div>
                      {locAddress && (
                        <div className="flex" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            type="button"
                            onClick={() => openExternalUrl(gmapsUrl)}
                            className="flex-1 py-2.5 text-[13px] font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ background: "hsl(213 100% 38%)" }}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Google Maps
                          </button>
                          <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
                          <button
                            type="button"
                            onClick={() => openExternalUrl(wazeUrl)}
                            className="flex-1 py-2.5 text-[13px] font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ background: "hsl(195 100% 35%)" }}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Waze
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              /* ── Llamada perdida ── */
              if (m.messageType === "missed_call") {
                return (
                  <div key={m.id} className="flex justify-center my-1.5">
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] text-muted-foreground"
                      style={{ background: "hsl(218 12% 11%)" }}
                    >
                      <PhoneMissed className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(0 72% 55%)" }} />
                      <span>{isMe ? "Llamada sin respuesta" : "Llamada perdida"}</span>
                      <span className="opacity-50">{formatTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              }

              /* ── Tarjeta de ACUERDO (cliente confirmó) ── */
              if (isAgree && agreementData) {
                const hasCoords = typeof agreementData.lat === "number" && typeof agreementData.lng === "number";
                const lat = agreementData.lat as number;
                const lng = agreementData.lng as number;
                const addr = agreementData.address || "";
                const gmapsUrl = hasCoords
                  ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
                const wazeUrl = hasCoords
                  ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
                  : `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
                const agreementAddressHidden = !isClient && !workerSelfieCompleted;
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
                    <div
                      className="w-72 rounded-2xl overflow-hidden"
                      style={{
                        background: isMe
                          ? "linear-gradient(150deg, hsl(142 65% 30%) 0%, hsl(142 65% 20%) 100%)"
                          : "hsl(218 15% 13%)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                      }}
                    >
                      <div
                        className="px-3 py-2 flex items-center gap-2"
                        style={{
                          background: isMe ? "rgba(0,0,0,0.18)" : "hsl(142 50% 18%)",
                          borderBottom: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <Handshake className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(142 75% 65%)" }} />
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(142 75% 70%)" }}>
                          ¡Llegaron a un acuerdo!
                        </span>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-[13px] text-white/95 leading-snug">
                          {isClient
                            ? freeCancelActive
                              ? `Confirmaste el acuerdo. La dirección se mostrará en ${freeCancel.label} (tiempo de cancelación gratis).`
                              : "Confirmaste el acuerdo. El profesional ya puede ir a tu dirección."
                            : freeCancelActive
                              ? `El cliente confirmó el acuerdo. La dirección se mostrará en ${freeCancel.label} (tiempo de cancelación gratis del cliente).`
                              : agreementAddressHidden
                                ? (
                                  <>
                                    El cliente confirmó el acuerdo. Completa tu selfie de seguridad en{" "}
                                    <Link
                                      href="/mis-trabajos"
                                      className="underline underline-offset-2 font-bold"
                                      style={{ color: "hsl(142 75% 70%)" }}
                                    >
                                      Mis Trabajos
                                    </Link>{" "}
                                    para ver la dirección.
                                  </>
                                )
                                : "El cliente confirmó el acuerdo. Puedes dirigirte a su dirección."}
                        </p>
                        {freeCancelActive ? (
                          <p className="mt-2 text-[12px] leading-snug text-white/80">
                            {isClient
                              ? CLIENT_AGREEMENT_NOTICE
                              : "🔼 El cliente tiene 10 minutos para cancelar sin costo. La dirección se mostrará cuando termine el tiempo de espera. Para cancelar esta solicitud debes dirigirte a Mis Trabajos."}
                          </p>
                        ) : null}
                        {addr && (isMe || (!freeCancelActive && !agreementAddressHidden)) && (
                          <div className="mt-2 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "hsl(142 75% 70%)" }} />
                            <p className="text-[12px] text-white/85 leading-snug break-words">{addr}</p>
                          </div>
                        )}
                        {!isMe && (freeCancelActive || agreementAddressHidden) && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0 opacity-60" style={{ color: "hsl(142 75% 70%)" }} />
                            <p className="text-[12px] text-white/60 leading-snug italic">
                              {freeCancelActive
                                ? <>Dirección oculta — espera {freeCancel.label} ⏱️</>
                                : "Dirección oculta — completa tu selfie de seguridad en Mis Trabajos."}
                            </p>
                          </div>
                        )}
                        <div className="flex justify-end mt-2">
                          <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                            {formatTime(m.createdAt)}
                            {isMe && <CheckCheck className="w-3 h-3 text-white/40" />}
                          </span>
                        </div>
                      </div>
                      {!isMe && !freeCancelActive && !agreementAddressHidden && (hasCoords || addr) && (
                        <div className="flex" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            type="button"
                            onClick={() => openExternalUrl(gmapsUrl)}
                            className="flex-1 py-2.5 text-[13px] font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ background: "hsl(213 100% 38%)" }}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Google Maps
                          </button>
                          <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
                          <button
                            type="button"
                            onClick={() => openExternalUrl(wazeUrl)}
                            className="flex-1 py-2.5 text-[13px] font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ background: "hsl(195 100% 35%)" }}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Waze
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              /* ── Tarjeta de precio ── */
              if (isPrice) {
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
                    <div
                      className="w-64 rounded-2xl overflow-hidden"
                      style={{
                        background: isMe
                          ? "linear-gradient(150deg, hsl(213 100% 38%) 0%, hsl(213 100% 28%) 100%)"
                          : "hsl(218 15% 13%)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                      }}
                    >
                      {/* Encabezado tarjeta */}
                      <div
                        className="px-3 py-2 flex items-center gap-2"
                        style={{
                          background: isMe ? "rgba(0,0,0,0.18)" : "hsl(218 15% 17%)",
                          borderBottom: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        {isCounterOffer
                          ? <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(213 100% 70%)" }} />
                          : <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(213 100% 70%)" }} />
                        }
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "hsl(213 100% 70%)" }}>
                          {isCounterOffer
                            ? (isMe ? "Tu contraoferta" : "Contraoferta recibida")
                            : isWorkerQuote
                              ? (isMe ? "Tu precio" : "Precio del experto")
                              : (isMe ? "Tu propuesta" : "Propuesta de precio")}
                        </span>
                      </div>

                      {/* Monto */}
                      <div className="px-3 py-3">
                        <p className="text-2xl font-black text-white leading-none">
                          {priceAmount !== null ? formatCLP(priceAmount) : "—"}
                        </p>
                        {isWorkerQuote && (
                          <p className="text-[11px] mt-1" style={{ color: isMe ? "hsl(213 80% 80%)" : "hsl(213 80% 65%)" }}>
                            {isMe ? "Tu precio para este trabajo" : "Lo que te cobraría por este trabajo"}
                          </p>
                        )}
                        <div className="flex justify-end mt-2">
                          <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                            {formatTime(m.createdAt)}
                            {isMe && <CheckCheck className="w-3 h-3 text-white/40" />}
                          </span>
                        </div>
                      </div>

                      {/* Botones acción */}
                      {canRespondToPrice && (
                        <div className="flex" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            onClick={isClient ? handleClientAccept : onAccept}
                            disabled={accepting || sendingAgreement}
                            className="flex-1 py-2.5 text-[13px] font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ background: "hsl(142 65% 32%)" }}
                          >
                            {(accepting || sendingAgreement) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {priceAmount !== null ? `Aceptar oferta — ${formatCLP(priceAmount)}` : "Aceptar oferta"}
                          </button>
                          <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
                          <button
                            onClick={() => { setCounteringMsg(m.id); setPriceMode(true); setPriceInput(""); }}
                            className="flex-1 py-2.5 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                            style={{ color: "hsl(213 100% 70%)" }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Contraofertar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (messageAttachments.length > 0) {
                return (
                  <AttachmentMessage
                    key={m.id}
                    serviceId={serviceId}
                    workerId={workerId}
                    attachments={messageAttachments}
                    otherPublicKey={otherPublicKey}
                    isMe={isMe}
                    caption={rawContent && !isLoading ? rawContent : undefined}
                  />
                );
              }

              /* ── Burbuja de texto ── */
              return (
                <div
                  key={m.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"} ${isSameSender ? "mt-0.5" : "mt-2"}`}
                >
                  {/* Avatar receptor */}
                  {!isMe && (
                    <div className="w-8 flex-shrink-0 self-end mr-1">
                      {!isSameSender && (
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={workerAvatar || undefined} />
                          <AvatarFallback className="text-[10px] font-bold bg-primary/20 text-primary">
                            {workerName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )}

                  <div
                    className="max-w-[72%] px-3 py-2"
                    style={{
                      borderRadius: isMe
                        ? isSameSender ? "18px 4px 18px 18px" : "18px 4px 18px 18px"
                        : isSameSender ? "4px 18px 18px 18px" : "4px 18px 18px 18px",
                      background: isMe
                        ? "linear-gradient(135deg, hsl(213 100% 50%) 0%, hsl(213 100% 40%) 100%)"
                        : "hsl(218 15% 13%)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  >
                    <p
                      className="text-[14px] leading-[1.45] whitespace-pre-wrap break-words"
                      style={{ color: isLoading ? "rgba(255,255,255,0.4)" : "white" }}
                    >
                      {isLoading ? <em>{rawContent}</em> : rawContent}
                    </p>
                    <div className="flex justify-end items-center gap-0.5 mt-0.5">
                      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {formatTime(m.createdAt)}
                      </span>
                      {isMe && <CheckCheck className="w-[11px] h-[11px]" style={{ color: "rgba(255,255,255,0.4)" }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={endRef} className="h-2" />
      </div>

      {/* ── BARRA INFERIOR ── */}
      <div
        className="flex-shrink-0"
        style={{
          background: "hsl(218 25% 9%)",
          borderTop: "1px solid hsl(218 12% 13%)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 4px)",
        }}
      >
        {/* Indicador conectado */}
        {!onAccept && !priceMode && !addressMode && !(proposalStatus === 'rejected' || liveRejected) && (
          <div className="flex items-center justify-center gap-1.5 px-4 pt-1.5 pb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
            <span className="text-[11px] text-green-400 font-medium">Conectados — coordina por aquí</span>
          </div>
        )}

        {/* Input de dirección para el acuerdo.
            El estado RECHAZADO tiene prioridad absoluta sobre cualquier modo de
            edición (precio/dirección): el chat queda congelado, solo banner. */}
        {(proposalStatus === 'rejected' || liveRejected) ? (
          /* No seleccionado — banner de cierre */
          <div className="px-4 py-3 flex items-center justify-center gap-2">
            <span className="text-base">😔</span>
            <span className="text-[12px] text-muted-foreground/80 font-medium">
              El cliente eligió a otro profesional
            </span>
          </div>
        ) : addressMode ? (
          <div className="px-3 py-2 flex flex-col gap-2">
            <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "hsl(142 75% 70%)" }}>
              <Handshake className="w-3 h-3" />
              Confirma tu dirección para enviar al profesional:
            </p>
            <div className="flex gap-2 items-center">
              <div
                className="flex-1 flex items-center gap-2 px-3 rounded-2xl"
                style={{
                  background: "hsl(218 15% 13%)",
                  border: "1.5px solid hsl(142 65% 45% / 0.5)",
                  height: 44,
                }}
              >
                <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(142 75% 65%)" }} />
                <input
                  type="text"
                  placeholder="Ej: Av. Providencia 1234, Depto 5B, Providencia"
                  value={addressInput}
                  onChange={e => setAddressInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendAgreement(); } }}
                  autoFocus
                  className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder:text-white/30 w-0"
                />
              </div>
              <button
                onClick={sendAgreement}
                disabled={sendingAgreement || !addressInput.trim()}
                className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-40 flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(142 65% 40%), hsl(142 65% 28%))" }}
                title="Enviar dirección"
              >
                {sendingAgreement ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
              </button>
              <button
                onClick={() => { setAddressMode(false); setAddressInput(""); }}
                className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition active:scale-90 flex-shrink-0"
                style={{ background: "hsl(218 15% 15%)" }}
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground px-1">
              El chat sigue activo. La dirección se envía cifrada solo al profesional.
            </p>
          </div>
        ) : priceMode ? (
          <div className="px-3 py-2 flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              {counteringMsg
                ? <><RefreshCw className="w-3 h-3 text-primary" />Ingresa tu contraoferta:</>
                : (!isClient && !clientBudgetPrice)
                  ? <><DollarSign className="w-3 h-3 text-primary" />Indica el precio que le cobrarías al cliente:</>
                  : <><DollarSign className="w-3 h-3 text-primary" />Proponer precio:</>}
            </p>
            <div className="flex gap-2 items-center">
              <div
                className="flex-1 flex items-center gap-2 px-3 rounded-2xl"
                style={{
                  background: "hsl(218 15% 13%)",
                  border: "1.5px solid hsl(213 100% 55% / 0.35)",
                  height: 44,
                }}
              >
                <span className="text-xs font-bold flex-shrink-0" style={{ color: "hsl(213 100% 65%)" }}>CLP $</span>
                <input
                  type="number"
                  min={1}
                  placeholder="Ej: 45000"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendPrice(); } }}
                  autoFocus
                  className="flex-1 bg-transparent outline-none text-base font-bold text-white placeholder:text-white/25 w-0"
                />
              </div>
              <button
                onClick={sendPrice}
                disabled={sendingPrice || !priceInput}
                className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-40 flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(213 100% 55%), hsl(213 100% 38%))" }}
              >
                {sendingPrice ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
              </button>
              <button
                onClick={() => { setPriceMode(false); setPriceInput(""); setCounteringMsg(null); }}
                className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition active:scale-90 flex-shrink-0"
                style={{ background: "hsl(218 15% 15%)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (readOnly || liveCompleted || liveCancelled) ? (
          /* Servicio cerrado — solo lectura */
          <div className="px-4 py-3 flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-[12px] text-muted-foreground/60">
              {(serviceStatus === 'cancelled' || liveCancelled)
                ? 'Servicio cancelado'
                : (serviceStatus === 'completed' || liveCompleted) ? 'Trabajo Finalizado' : 'Conversación archivada'}
            </span>
          </div>
        ) : (
          /* Input de mensaje */
          <div className="px-2 py-2 flex flex-col gap-1.5">
            {pendingFiles.length > 0 && (
              <div className="px-1 flex gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[hsl(218_15%_13%)]">
                    <PendingFilePreview file={file} />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1">
                      <p className="max-w-20 truncate text-[9px] text-white/90">{file.name}</p>
                    </div>
                    <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white" aria-label={`Quitar ${file.name}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          <div className="flex items-end gap-2">
            {/* ── Botón izquierdo barra inferior ── */}
            {isClient ? (
              !hasAgreement ? (
                !!onAccept ? (
                  /* Propuesta pendiente → "Aceptar Trabajador" */
                  <button
                    onClick={handleClientAccept}
                    disabled={accepting || sendingAgreement}
                    className="h-10 px-4 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition active:scale-90 gap-1.5"
                    style={{ background: "hsl(142 65% 32%)", color: "white" }}
                    title="Aceptar este trabajador y enviar mi ubicación"
                  >
                    {(accepting || sendingAgreement)
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Check className="w-4 h-4 flex-shrink-0" />}
                    <span className="text-[12px] font-bold">Aceptar Trabajador</span>
                  </button>
                ) : (
                  /* Propuesta ya aceptada pero sin acuerdo → "Enviar Ubicación" */
                  <button
                    onClick={openAddressMode}
                    disabled={sendingAgreement}
                    className="h-10 px-4 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition active:scale-90 gap-1.5"
                    style={{
                      border: "1.5px solid hsl(142 65% 45% / 0.55)",
                      color: "hsl(142 75% 65%)",
                    }}
                    title="Enviar mi dirección al profesional"
                  >
                    {sendingAgreement
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MapPin className="w-4 h-4 flex-shrink-0" />}
                    <span className="text-[11px] font-semibold">Enviar Ubicación</span>
                  </button>
                )
              ) : null
            ) : (
              /* Trabajador → contraoferta o cotización según haya presupuesto del cliente */
              !hasAgreement ? (
                <button
                  onClick={() => { setPriceMode(true); setPriceInput(""); }}
                  className="h-10 px-3 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition active:scale-90 gap-1"
                  style={
                    !clientBudgetPrice && !hasMyPrice
                      ? { background: "linear-gradient(135deg, hsl(213 100% 55%), hsl(213 100% 38%))", color: "white" }
                      : { border: "1.5px solid hsl(213 100% 55% / 0.4)", color: "hsl(213 100% 65%)" }
                  }
                  title="Proponer precio"
                >
                  <DollarSign className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-semibold">
                    {clientBudgetPrice ? "Contraoferta" : hasMyPrice ? "Cambiar mi precio" : "Enviar mi precio"}
                  </span>
                </button>
              ) : null
            )}

            <button
              type="button"
              onClick={() => {
                if (!canSendAttachments) {
                  toast.info(attachmentLockedMessage);
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition ${
                canSendAttachments ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/25"
              }`}
              title={canSendAttachments ? "Adjuntar archivos" : attachmentLockedMessage}
              aria-label={canSendAttachments ? "Adjuntar archivos" : attachmentLockedMessage}
            >
              {canSendAttachments ? <Paperclip className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.7z,.rar,.gz,.tar"
              className="hidden"
              onChange={event => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />

             <div
               className="flex min-h-[48px] flex-1 items-end rounded-3xl px-3 py-2.5"
              style={{ background: "hsl(218 15% 13%)" }}
            >
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => {
                  handleTextChange(e.target.value);
                  e.target.style.height = "auto";
                   e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Escribe un mensaje…"
                rows={1}
                 className="min-h-[24px] w-full resize-none bg-transparent text-[14px] leading-[1.4] text-white outline-none placeholder:text-white/30"
                 style={{ maxHeight: 120 }}
              />
            </div>

            <button
              onClick={send}
              disabled={(!text.trim() && pendingFiles.length === 0) || createMsg.isPending || sendingAttachments}
               className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition active:scale-90 disabled:opacity-35"
              style={{
                background: text.trim()
                  ? "linear-gradient(135deg, hsl(213 100% 55%), hsl(213 100% 38%))"
                  : "hsl(218 15% 17%)",
              }}
            >
              {createMsg.isPending || sendingAttachments
                ? <Loader2 className="w-4 h-4 animate-spin text-white" />
                : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          </div>
        )}
      </div>

      <UserProfileSheet
        userId={otherId ?? null}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenChat={() => setProfileOpen(false)}
      />

      {/* Modal de calificación para el trabajador cuando el cliente finaliza
          el trabajo mientras este chat está abierto */}
      {myId === workerId && otherId ? (
        <PostServiceModal
          open={rateOpen}
          onClose={() => {
            setRateOpen(false);
            // Refrescar "Mis Trabajos" para que reviewedByWorker se actualice
            queryClient.invalidateQueries({ queryKey: ["proposals", "my"] });
          }}
          counterpartId={otherId}
          counterpartName={workerName}
          serviceId={serviceId}
        />
      ) : null}
    </div>,
    document.body
  );
}

export default ProposalChatSheet;
