import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Eraser, Download, FileSignature, Pencil, Type, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const TYPED_FONTS = [
  { id: "Caveat",        family: "'Caveat', cursive",         label: "Caveat" },
  { id: "Dancing Script",family: "'Dancing Script', cursive", label: "Dancing" },
  { id: "Sacramento",    family: "'Sacramento', cursive",     label: "Sacramento" },
  { id: "Great Vibes",   family: "'Great Vibes', cursive",    label: "Great Vibes" },
  { id: "Allura",        family: "'Allura', cursive",         label: "Allura" },
  { id: "Pacifico",      family: "'Pacifico', cursive",       label: "Pacifico" },
];

const OWNERS = [
  { key: "matias",   label: "Matías" },
  { key: "jonathan", label: "Jonathan" },
];

const LEGAL_DOCS = [
  { key: "contrato", label: "Contrato P2P" },
  { key: "orden",    label: "Orden de Trabajo" },
  { key: "acta",     label: "Acta de Entrega" },
  { key: "factura",  label: "Factura" },
];

interface Signature {
  id: number;
  ownerKey: string;
  ownerName: string;
  imageDataUrl: string;
  method: "drawn" | "typed";
  styleId: string | null;
  hash: string;
  ipAddress: string | null;
  createdAt: string;
}

function loadGoogleFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("firmas-fonts")) return;
  const link = document.createElement("link");
  link.id = "firmas-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Allura&family=Caveat:wght@500&family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&family=Sacramento&display=swap";
  document.head.appendChild(link);
}

/** Renderiza el texto en una fuente dada y devuelve un dataURL PNG. */
async function typedToDataUrl(text: string, family: string): Promise<string> {
  await (document as any).fonts?.ready;
  const w = 600, h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0b0b0b";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  // Tamaño dinámico: empieza grande y achica si no entra
  let size = 96;
  do {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= w - 20) break;
    size -= 4;
  } while (size > 28);
  ctx.fillText(text, w / 2, h / 2);
  return canvas.toDataURL("image/png");
}

function DrawPad({ onSave, disabled }: { onSave: (dataUrl: string) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const isEmpty = padRef.current?.isEmpty() ?? true;
      const savedData = !isEmpty ? padRef.current?.toDataURL() : null;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")!.scale(ratio, ratio);
      padRef.current?.clear();
      if (savedData) {
        padRef.current?.fromDataURL(savedData, { width: canvas.offsetWidth, height: canvas.offsetHeight });
      }
    };
    const pad = new SignaturePad(canvas, {
      penColor: "#0b0b0b",
      backgroundColor: "rgba(255,255,255,0)",
      minWidth: 0.8,
      maxWidth: 2.6,
    });
    padRef.current = pad;
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-white relative overflow-hidden" style={{ height: 220 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", touchAction: "none" }} />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/60 pointer-events-none">
          Dibuja tu firma aquí
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => padRef.current?.clear()}>
          <Eraser className="w-4 h-4 mr-1" /> Limpiar
        </Button>
        <Button
          type="button"
          size="sm"
          className="ml-auto bg-primary"
          disabled={disabled}
          onClick={() => {
            if (!padRef.current || padRef.current.isEmpty()) {
              toast.error("Dibuja la firma primero");
              return;
            }
            const dataUrl = padRef.current.toDataURL("image/png");
            onSave(dataUrl);
          }}
        >
          <FileSignature className="w-4 h-4 mr-1" /> Guardar firma
        </Button>
      </div>
    </div>
  );
}

function TypedPad({ name, onSave, disabled }: { name: string; onSave: (dataUrl: string, styleId: string) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState(TYPED_FONTS[0].id);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TYPED_FONTS.map((f) => {
          const active = selected === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f.id)}
              className={`rounded-lg border px-3 py-3 text-left transition ${active ? "border-primary bg-primary/10" : "border-border bg-white hover:border-primary/50"}`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
              <div
                className="text-2xl text-black truncate min-h-[36px]"
                style={{ fontFamily: f.family, lineHeight: 1.1 }}
              >
                {name || "Tu nombre"}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex">
        <Button
          type="button"
          size="sm"
          className="ml-auto bg-primary"
          disabled={disabled || !name.trim()}
          onClick={async () => {
            if (!name.trim()) { toast.error("Pon tu nombre arriba primero"); return; }
            const family = TYPED_FONTS.find((f) => f.id === selected)!.family;
            const dataUrl = await typedToDataUrl(name.trim(), family);
            onSave(dataUrl, selected);
          }}
        >
          <FileSignature className="w-4 h-4 mr-1" /> Guardar firma
        </Button>
      </div>
    </div>
  );
}

function SignedDocActions({ sigId }: { sigId: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2">
      {LEGAL_DOCS.map((d) => (
        <Button
          key={d.key}
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(d.key);
            try {
              const url = `${import.meta.env.BASE_URL}api/firmas/${sigId}/sign-doc?doc=${d.key}`;
              const res = await fetch(url);
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || "Error al firmar el documento");
              }
              const blob = await res.blob();
              const a = document.createElement("a");
              const dlUrl = URL.createObjectURL(blob);
              a.href = dlUrl;
              a.download = `${d.key}-firmado.pdf`;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => { URL.revokeObjectURL(dlUrl); a.remove(); }, 1000);
            } catch (e: any) {
              toast.error(e.message || "Error");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === d.key ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
          {d.label}
        </Button>
      ))}
    </div>
  );
}

export default function FirmasPage() {
  const [activeOwner, setActiveOwner] = useState(OWNERS[0].key);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Signature[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => { loadGoogleFonts(); }, []);

  const refresh = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/firmas`);
      if (res.ok) setList(await res.json());
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const save = async (imageDataUrl: string, method: "drawn" | "typed", styleId?: string) => {
    if (!name.trim()) { toast.error("Pon tu nombre primero"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/firmas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerKey: activeOwner,
          ownerName: name.trim(),
          imageDataUrl,
          method,
          styleId: styleId ?? null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error al guardar");
      }
      toast.success("Firma guardada con sello legal");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const myList = list.filter((s) => s.ownerKey === activeOwner);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Firma electrónica</h1>
          <p className="text-xs text-muted-foreground">
            Firma electrónica simple según Ley 19.799 (Chile). Cada firma queda con sello de fecha,
            IP y huella digital (SHA-256) como evidencia de autoría.
          </p>
        </header>

        {/* Selector de quién firma */}
        <div className="flex gap-2">
          {OWNERS.map((o) => {
            const active = activeOwner === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setActiveOwner(o.key)}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-foreground"}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* Input de nombre */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase">Nombre completo con que firma</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Ej: ${activeOwner === "matias" ? "Matías Rodríguez" : "Jonathan ..."}`}
            maxLength={120}
          />
        </div>

        {/* Tabs Dibujar / Tipográfica */}
        <Card className="p-4">
          <Tabs defaultValue="drawn">
            <TabsList className="grid grid-cols-2 mb-3">
              <TabsTrigger value="drawn"><Pencil className="w-4 h-4 mr-1" /> Dibujar</TabsTrigger>
              <TabsTrigger value="typed"><Type className="w-4 h-4 mr-1" /> Estilo</TabsTrigger>
            </TabsList>
            <TabsContent value="drawn">
              <DrawPad disabled={busy} onSave={(d) => save(d, "drawn")} />
            </TabsContent>
            <TabsContent value="typed">
              <TypedPad name={name} disabled={busy} onSave={(d, sid) => save(d, "typed", sid)} />
            </TabsContent>
          </Tabs>
        </Card>

        {/* Listado de firmas guardadas */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">Firmas guardadas de {OWNERS.find((o) => o.key === activeOwner)?.label}</h2>
          {myList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aún no hay firmas guardadas.</p>
          ) : (
            <div className="space-y-2">
              {myList.map((s) => {
                const open = expanded === s.id;
                return (
                  <Card key={s.id} className="p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-14 bg-white rounded border border-border flex items-center justify-center overflow-hidden shrink-0">
                        <img src={s.imageDataUrl} alt="firma" className="max-w-full max-h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{s.ownerName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}
                          {" · "}
                          <span className="uppercase">{s.method === "drawn" ? "Dibujada" : `Estilo ${s.styleId || ""}`}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 truncate">Hash: {s.hash.slice(0, 24)}…</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setExpanded(open ? null : s.id)}>
                        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                    {open && (
                      <div className="border-t border-border pt-2 space-y-2.5">
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <div><strong>Hash completo:</strong> <code className="text-[10px]">{s.hash}</code></div>
                          {s.ipAddress && <div><strong>IP:</strong> {s.ipAddress}</div>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={`${import.meta.env.BASE_URL}api/firmas/${s.id}/png`}>
                              <Download className="w-3.5 h-3.5 mr-1" /> Descargar PNG
                            </a>
                          </Button>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Firmar documento</div>
                          <SignedDocActions sigId={s.id} />
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
