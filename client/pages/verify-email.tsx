import { useEffect, useState } from "react";
import { useSearch, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";

export default function VerifyEmail() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const token = new URLSearchParams(search).get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "resend">(token ? "loading" : "resend");
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/auth/verify-email?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        login(data);
        setStatus("success");
        setTimeout(() => setLocation("/"), 2500);
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) { toast.error("Ingresa tu email"); return; }
    setResendLoading(true);
    try {
      const res = await fetch(`/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setResendSent(true);
    } catch (e: any) {
      toast.error(e.message || "Error al reenviar");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-4xl font-black tracking-tighter text-primary mb-2">FIXGO</div>
        </div>

        <Card>
          <CardHeader className="text-center">
            {status === "loading" && (
              <>
                <div className="flex justify-center mb-2">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                </div>
                <CardTitle>Verificando tu correo...</CardTitle>
                <CardDescription>Por favor espera un momento.</CardDescription>
              </>
            )}
            {status === "success" && (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-green-500" />
                  </div>
                </div>
                <CardTitle>¡Correo verificado!</CardTitle>
                <CardDescription>Tu cuenta está activa. Serás redirigido automáticamente...</CardDescription>
              </>
            )}
            {status === "error" && (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-9 h-9 text-destructive" />
                  </div>
                </div>
                <CardTitle>Enlace inválido</CardTitle>
                <CardDescription>Este enlace ya fue usado o expiró. Solicita uno nuevo abajo.</CardDescription>
              </>
            )}
            {status === "resend" && (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-9 h-9 text-primary" />
                  </div>
                </div>
                <CardTitle>Verifica tu correo</CardTitle>
                <CardDescription>
                  Te enviamos un enlace de verificación al registrarte. ¿No lo recibiste?
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {status === "success" && (
              <Button className="w-full" onClick={() => setLocation("/")}>
                Ir al inicio
              </Button>
            )}

            {(status === "error" || status === "resend") && (
              resendSent ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Si el correo está registrado y sin verificar, te llegará un nuevo enlace en breve.
                  </p>
                  <p className="text-xs text-muted-foreground">Revisa también tu carpeta de spam.</p>
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" className="w-full" disabled={resendLoading}>
                    {resendLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reenviar enlace de verificación
                  </Button>
                </form>
              )
            )}

            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Volver al inicio de sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
