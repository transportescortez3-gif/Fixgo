import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Image as ImageIcon, Clock3, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/brand-storage";

type SecuritySelfie = {
  id: number;
  role: "client" | "worker";
  purpose: string;
  serviceId: number | null;
  proposalId: number | null;
  takenAt: string;
  expiresAt: string;
  deletedAt: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  userName: string;
  userEmail: string;
  serviceTitle: string | null;
  status: "available" | "purged";
};

const roleLabels = { client: "Cliente", worker: "Experto" };
const purposeLabels: Record<string, string> = {
  service: "Publicación de servicio",
  proposal: "Propuesta",
  manual: "Selfie de seguridad",
  return_from_inactivity: "Selfie de seguridad anterior",
  service_publish: "Publicación de servicio",
  proposal_accept: "Aceptación de propuesta",
};

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SecureSelfieImage({ item }: { item: SecuritySelfie }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!item.imageUrl) return;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    fetch(item.imageUrl, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.blob() : Promise.reject(new Error("image unavailable")))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.imageUrl]);

  if (!src) return <ImageIcon className="w-6 h-6 text-muted-foreground" />;
  return <img src={src} alt={`Selfie de seguridad de ${item.userName}`} className="w-full h-full object-cover" />;
}

export default function AdminSecuritySelfies() {
  const [items, setItems] = useState<SecuritySelfie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch("/api/admin/security-selfies", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("No se pudo cargar la bandeja de selfies");
      setItems(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Selfies de seguridad</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Registro de capturas de clientes y expertos. Las imágenes se eliminan automáticamente 5 días hábiles después de la captura.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bandeja administrativa</CardTitle>
          <CardDescription>
            Se conserva la trazabilidad después de purgar el archivo, pero no la imagen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando selfies…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Aún no hay selfies de seguridad registradas.</div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="border rounded-xl p-4 flex flex-col lg:flex-row gap-4 lg:items-center">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {item.imageUrl ? (
                      <SecureSelfieImage item={item} />
                    ) : (
                      <Trash2 className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{item.userName}</span>
                      <Badge variant="secondary">{roleLabels[item.role] ?? item.role}</Badge>
                      <Badge variant={item.status === "available" ? "default" : "outline"}>
                        {item.status === "available" ? "Disponible" : "Purgada"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{item.userEmail}</p>
                    <p className="text-sm">
                      {purposeLabels[item.purpose] ?? item.purpose}
                      {item.serviceTitle ? ` · ${item.serviceTitle}` : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1 text-xs text-muted-foreground min-w-[220px]">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-3.5 h-3.5" /> Captura: {date(item.takenAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {item.deletedAt ? <Trash2 className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      {item.deletedAt ? `Purgada: ${date(item.deletedAt)}` : `Purga: ${date(item.expiresAt)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}