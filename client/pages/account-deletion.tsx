import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, ShieldAlert, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const partialDataOptions = [
  { value: "profile", label: "Perfil y datos personales" },
  { value: "profile_media", label: "Fotos y portafolio" },
  { value: "kyc", label: "Documentos KYC y selfies de seguridad" },
  { value: "location", label: "Ubicación e historial de ubicación" },
  { value: "chat_attachments", label: "Adjuntos y contenido del chat" },
  { value: "notifications", label: "Notificaciones y preferencias" },
] as const;

export default function AccountDeletionPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    website: "",
    requestType: "full" as "full" | "partial",
    dataCategories: [] as string[],
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: current.email || user.email || "",
      phone: current.phone || user.phone || "",
    }));
  }, [user]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleCategory = (category: string) => {
    setForm((current) => ({
      ...current,
      dataCategories: current.dataCategories.includes(category)
        ? current.dataCategories.filter((item) => item !== category)
        : [...current.dataCategories, category],
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/account-deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo registrar la solicitud.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="flex items-start gap-3 mb-2">
          <div className="rounded-xl bg-destructive/10 p-2.5 text-destructive">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Eliminar cuenta y datos</h1>
            <p className="text-sm text-muted-foreground mt-1">FIXGO — appfixgo.com</p>
          </div>
        </div>

        <div className="space-y-5 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Solicita la eliminación de tus datos</CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                    <div>
                      <h2 className="font-semibold text-green-400">Solicitud recibida</h2>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        El equipo de FIXGO revisará la solicitud y te contactará para verificar que eres la persona titular de la cuenta antes de procesarla.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Puedes solicitar el borrado de toda tu cuenta o solo de algunas categorías de datos. La solicitud no se ejecuta inmediatamente: primero verificaremos tu identidad para protegerla.
                  </p>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">¿Qué deseas eliminar?</legend>
                    <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${form.requestType === "full" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/30"}`}>
                      <input
                        type="radio"
                        name="requestType"
                        value="full"
                        checked={form.requestType === "full"}
                        onChange={() => setForm((current) => ({ ...current, requestType: "full", dataCategories: [] }))}
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block font-medium">Eliminar mi cuenta completa</span>
                        <span className="block text-sm text-muted-foreground mt-1">Solicitar la eliminación de la cuenta y de todos los datos que puedan eliminarse.</span>
                      </span>
                    </label>
                    <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${form.requestType === "partial" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/30"}`}>
                      <input
                        type="radio"
                        name="requestType"
                        value="partial"
                        checked={form.requestType === "partial"}
                        onChange={() => setForm((current) => ({ ...current, requestType: "partial" }))}
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block font-medium">Eliminar solo algunos datos</span>
                        <span className="block text-sm text-muted-foreground mt-1">Mantener mi cuenta activa y solicitar el borrado de categorías específicas.</span>
                      </span>
                    </label>
                  </fieldset>

                  {form.requestType === "partial" && (
                    <fieldset className="space-y-3 rounded-xl border border-border/70 p-4">
                      <legend className="px-1 text-sm font-semibold">Selecciona las categorías *</legend>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {partialDataOptions.map((option) => (
                          <label key={option.value} className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted/40 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.dataCategories.includes(option.value)}
                              onChange={() => toggleCategory(option.value)}
                              className="mt-1 accent-primary"
                            />
                            <span className="text-sm">{option.label}</span>
                          </label>
                        ))}
                      </div>
                      {form.dataCategories.length === 0 && (
                        <p className="text-xs text-muted-foreground">Selecciona al menos una categoría para continuar.</p>
                      )}
                    </fieldset>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deletion-name">Nombre</Label>
                      <Input id="deletion-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Tu nombre" maxLength={120} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deletion-email">Correo de la cuenta *</Label>
                      <Input id="deletion-email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="tu@correo.com" maxLength={255} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deletion-phone">Teléfono de la cuenta (opcional)</Label>
                    <Input id="deletion-phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+56 9 1234 5678" maxLength={40} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deletion-message">Información adicional (opcional)</Label>
                    <Textarea id="deletion-message" value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Indica si necesitas aclarar algo sobre tu solicitud." maxLength={1000} rows={4} />
                  </div>

                  <input
                    aria-hidden="true"
                    autoComplete="off"
                    tabIndex={-1}
                    className="absolute -left-[9999px] h-px w-px opacity-0"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                  />

                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" variant="destructive" disabled={submitting || (form.requestType === "partial" && form.dataCategories.length === 0)}>
                    {submitting ? "Enviando solicitud…" : "Solicitar eliminación"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="w-5 h-5 text-primary" />
                Qué se elimina y qué puede conservarse
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-foreground mb-1">Según el alcance solicitado, se eliminará o dejará de estar disponible para uso operativo:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>En una solicitud completa: la cuenta, el perfil, preferencias, datos de contacto, ubicación, tokens de sesión y notificaciones asociados.</li>
                  <li>En una solicitud parcial: solo las categorías seleccionadas en el formulario, cuando no exista una obligación de conservación.</li>
                  <li>Los documentos KYC y selfies de seguridad cuando no exista una obligación de conservación.</li>
                  <li>Las copias de archivos que ya no sean necesarias para la atención de servicios o reclamos.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Puede conservarse de forma restringida:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Registros de facturación, suscripciones y obligaciones tributarias.</li>
                  <li>Registros de seguridad, auditoría, fraude, reclamos o disputas legales.</li>
                  <li>Información anonimizada o agregada que ya no identifique a la persona.</li>
                  <li>Metadatos o contenido cifrado necesario para proteger los derechos de otros participantes, durante el plazo aplicable.</li>
                </ul>
              </div>
              <p>
                La solicitud se gestiona después de verificar la identidad del titular. El plazo de respuesta se determinará conforme a la normativa aplicable y a la complejidad de la solicitud.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}