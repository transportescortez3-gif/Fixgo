import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/custom-fetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Check, CheckCheck, Loader2, Send, Lock } from "lucide-react";
import { UserProfileSheet } from "@/components/user-profile-sheet";
import { getSocket } from "@/hooks/use-socket";
import { toast } from "sonner";
import {
  encryptMessage,
  decryptMessage,
  fetchPublicKey,
  uploadPublicKey,
  isEncryptedBlob,
} from "@/lib/e2e-crypto";

export interface DirectChatSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  otherUserId: number;
  otherUserName: string;
  otherUserAvatar?: string | null;
}

interface DirectMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  encrypted: boolean;
  isRead: boolean;
  createdAt: string;
  sender: { id: number; name: string; avatarUrl: string | null };
}

export function DirectChatSheet({
  open, onOpenChange, otherUserId, otherUserName, otherUserAvatar,
}: DirectChatSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const [localMsgs, setLocalMsgs] = useState<DirectMessage[]>([]);
  const [decryptedCache, setDecryptedCache] = useState<Record<number, string>>({});
  const [otherPublicKey, setOtherPublicKey] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingEmitted = useRef(false);

  /* ── Animación entrada / salida ── */
  useEffect(() => {
    if (open) { setTimeout(() => setVisible(true), 10); }
    else { setVisible(false); }
  }, [open]);

  /* ── Obtener o crear conversación ── */
  const { data: conversation } = useQuery<any>({
    queryKey: ["direct-conversation", otherUserId],
    queryFn: async () => {
      return customFetch<{ id: number }>(`/api/direct/conversation/${otherUserId}`);
    },
    enabled: open && !!otherUserId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (conversation?.id) setConversationId(conversation.id);
  }, [conversation?.id]);

  /* ── Cargar mensajes ── */
  const { data: msgsData, isLoading: msgsLoading } = useQuery<{ messages: DirectMessage[] }>({
    queryKey: ["direct-messages", conversationId],
    queryFn: async () => {
      return customFetch<{ messages: DirectMessage[] }>(`/api/direct/conversation/${conversationId}/messages`);
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  });

  /* ── Descifrado E2E batch ── */
  useEffect(() => {
    if (!msgsData?.messages?.length) return;
    const decrypt = async () => {
      const updates: Record<number, string> = {};
      for (const msg of msgsData.messages) {
        if (msg.encrypted && isEncryptedBlob(msg.content) && !(msg.id in decryptedCache)) {
          try {
            if (!otherPublicKey) continue;
            const plain = await decryptMessage(msg.content, otherPublicKey);
            if (plain) updates[msg.id] = plain;
          } catch { /* ignorar */ }
        }
      }
      if (Object.keys(updates).length) setDecryptedCache(prev => ({ ...prev, ...updates }));
    };
    decrypt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgsData?.messages, otherPublicKey]);

  /* ── Clave pública del otro usuario ── */
  useEffect(() => {
    if (!open || !otherUserId) return;
    uploadPublicKey().catch(() => {});
    fetchPublicKey(otherUserId).then(k => setOtherPublicKey(k)).catch(() => {});
  }, [open, otherUserId]);

  /* ── Socket: unirse a la sala + reconectar automáticamente ── */
  useEffect(() => {
    if (!conversationId || !open) return;
    const socket = getSocket();

    const joinRoom = () => socket.emit("join_direct", conversationId);
    joinRoom();

    // Al reconectar: re-unirse a la sala Y recuperar mensajes perdidos (como WhatsApp)
    const handleReconnect = () => {
      joinRoom();
      queryClient.invalidateQueries({ queryKey: ["direct-messages", conversationId] });
    };
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("connect", handleReconnect);
      socket.emit("leave_direct", conversationId);
    };
  }, [conversationId, open, queryClient]);

  /* ── Socket: recibir mensajes en tiempo real + descifrar al vuelo ── */
  useEffect(() => {
    const socket = getSocket();

    const handleDirectMsg = async (msg: DirectMessage) => {
      if (msg.conversationId !== conversationId) return;

      // Descifrar si viene cifrado
      if (msg.encrypted && isEncryptedBlob(msg.content)) {
        try {
          const peerId = msg.senderId === user?.id ? otherUserId : msg.senderId;
          if (!otherPublicKey) return;
          const plain = await decryptMessage(msg.content, otherPublicKey);
          if (plain) setDecryptedCache(prev => ({ ...prev, [msg.id]: plain }));
        } catch { /* ignorar */ }
      }

      setLocalMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      queryClient.invalidateQueries({ queryKey: ["direct-messages", conversationId] });

      // Marcar como leído automáticamente si el chat está abierto
      if (msg.senderId !== user?.id) {
        customFetch(`/api/direct/conversation/${conversationId}/messages/read`, { method: "PATCH" }).catch(() => {});
      }
    };

    socket.on("direct_message", handleDirectMsg);
    return () => { socket.off("direct_message", handleDirectMsg); };
  }, [conversationId, user?.id, otherUserId, otherPublicKey, queryClient]);

  /* ── Socket: indicador "escribiendo..." ── */
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    const handleTyping = ({ userId }: { userId: number }) => {
      if (userId === otherUserId) setOtherIsTyping(true);
    };
    const handleStopTyping = ({ userId }: { userId: number }) => {
      if (userId === otherUserId) setOtherIsTyping(false);
    };

    socket.on("direct_user_typing", handleTyping);
    socket.on("direct_user_stop_typing", handleStopTyping);
    return () => {
      socket.off("direct_user_typing", handleTyping);
      socket.off("direct_user_stop_typing", handleStopTyping);
    };
  }, [conversationId, otherUserId]);

  /* ── Marcar como leídos al abrir ── */
  useEffect(() => {
    if (!conversationId || !open) return;
    customFetch(`/api/direct/conversation/${conversationId}/messages/read`, { method: "PATCH" }).catch(() => {});
  }, [conversationId, open]);

  /* ── Scroll al final ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsData?.messages, localMsgs, otherIsTyping]);

  /* ── Emitir eventos de escritura ── */
  const emitTyping = useCallback(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!typingEmitted.current) {
      socket.emit("direct_typing", { conversationId, name: user?.name ?? "" });
      typingEmitted.current = true;
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      socket.emit("direct_stop_typing", { conversationId });
      typingEmitted.current = false;
    }, 2000);
  }, [conversationId, user?.name]);

  const stopTyping = useCallback(() => {
    if (!conversationId) return;
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    getSocket().emit("direct_stop_typing", { conversationId });
    typingEmitted.current = false;
  }, [conversationId]);

  /* ── Enviar mensaje ── */
  const sendMutation = useMutation({
    mutationFn: async ({ content, encrypted }: { content: string; encrypted: boolean }) => {
      return customFetch<DirectMessage>(`/api/direct/conversation/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, encrypted }),
      });
    },
    onSuccess: (msg) => {
      setLocalMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      queryClient.invalidateQueries({ queryKey: ["direct-messages", conversationId] });
    },
    onError: () => toast.error("No se pudo enviar el mensaje"),
  });

  const send = useCallback(async () => {
    const content = text.trim();
    if (!content || !conversationId || sendMutation.isPending) return;
    setText("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    stopTyping();

    try {
      let finalContent = content;
      let encrypted = false;
      if (otherPublicKey) {
          const blob = await encryptMessage(content, otherPublicKey);
        if (blob) { finalContent = blob; encrypted = true; }
      }
      sendMutation.mutate({ content: finalContent, encrypted });
    } catch {
      sendMutation.mutate({ content, encrypted: false });
    }
  }, [text, conversationId, sendMutation, otherPublicKey, otherUserId, stopTyping]);

  /* ── Combinar mensajes server + locales sin duplicados ── */
  const allMessages = [...(msgsData?.messages ?? [])];
  for (const lm of localMsgs) {
    if (!allMessages.some(m => m.id === lm.id)) allMessages.push(lm);
  }
  allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const getDisplayContent = (msg: DirectMessage) => {
    if (msg.encrypted && isEncryptedBlob(msg.content)) {
      return decryptedCache[msg.id] ?? "🔒 Mensaje cifrado";
    }
    return msg.content;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  if (!open && !visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        background: "hsl(220 15% 5%)",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.28s cubic-bezier(0.32,0.72,0,1)",
      }}
    >
      {/* ─── Header ─── */}
      <div
        className="flex items-center gap-3 px-3 py-3 flex-shrink-0 border-b border-border/30"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)", background: "hsl(218 12% 8%)" }}
      >
        <button
          onClick={() => { stopTyping(); onOpenChange(false); }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
        >
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarImage src={otherUserAvatar ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
              {otherUserName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{otherUserName}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {otherIsTyping ? (
                <span className="text-primary animate-pulse">escribiendo…</span>
              ) : (
                <><Lock className="w-2.5 h-2.5" /> Chat cifrado de extremo a extremo</>
              )}
            </p>
          </div>
        </button>
      </div>

      <UserProfileSheet
        userId={otherUserId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenChat={() => setProfileOpen(false)}
      />

      {/* ─── Mensajes ─── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {msgsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-foreground">Chat de confianza</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Los mensajes con {otherUserName} están cifrados de extremo a extremo. Solo ustedes pueden leerlos.
            </p>
          </div>
        ) : (
          allMessages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const displayText = getDisplayContent(msg);
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-[1.45] ${
                    isMe ? "text-white rounded-br-sm" : "text-foreground rounded-bl-sm"
                  }`}
                  style={
                    isMe
                      ? { background: "linear-gradient(135deg, hsl(213 100% 55%), hsl(213 100% 40%))" }
                      : { background: "hsl(218 15% 13%)" }
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{displayText}</p>
                  <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : "justify-start"}`}>
                    <span className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground/70"}`}>
                      {formatTime(msg.createdAt)}
                    </span>
                    {isMe && (
                      msg.isRead
                        ? <CheckCheck className="w-3 h-3 text-white/80" />
                        : <Check className="w-3 h-3 text-white/50" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Indicador "escribiendo..." */}
        {otherIsTyping && (
          <div className="flex justify-start">
            <div
              className="px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1"
              style={{ background: "hsl(218 15% 13%)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input de mensaje ─── */}
      <div
        className="flex items-end gap-2 px-2 py-2 flex-shrink-0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <div
          className="flex-1 flex items-end px-3 py-2 rounded-3xl"
          style={{ background: "hsl(218 15% 13%)" }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
              if (e.target.value.trim()) emitTyping();
              else stopTyping();
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            onBlur={stopTyping}
            placeholder={`Mensaje a ${otherUserName}…`}
            rows={1}
            className="w-full bg-transparent outline-none resize-none text-[14px] leading-[1.4] text-white placeholder:text-white/30"
            style={{ maxHeight: 100 }}
          />
        </div>

        <button
          onClick={send}
          disabled={!text.trim() || sendMutation.isPending || !conversationId}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition active:scale-90 disabled:opacity-35"
          style={{
            background: text.trim()
              ? "linear-gradient(135deg, hsl(213 100% 55%), hsl(213 100% 38%))"
              : "hsl(218 15% 17%)",
          }}
        >
          {sendMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin text-white" />
            : <Send className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>,
    document.body
  );
}

export default DirectChatSheet;
