import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@/api";
import { restoreOrCreateKeyPair } from "@/lib/e2e-crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, MailWarning } from "lucide-react";

const REMEMBER_KEY = "fixgo_remember";

function getSavedCredentials(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const loginSchema = z.object({
  email: z.string().email("Ingresa un correo electrónico válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const loginMutation = useLogin();
  const [notVerifiedEmail, setNotVerifiedEmail] = useState<string | null>(null);

  const saved = getSavedCredentials();
  const [rememberMe, setRememberMe] = useState(!!saved);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: saved?.email ?? "",
      password: saved?.password ?? "",
    },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const result = await loginMutation.mutateAsync({ data });
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: data.email, password: data.password }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      login(result);
      // Sincronizar la llave E2E: restaurar el respaldo cifrado del servidor con
      // la contraseña recién ingresada (o crearlo si aún no existe). Solo aquí está
      // disponible la contraseña en texto plano. No bloquea el flujo si falla.
      const keySync = await restoreOrCreateKeyPair(data.password).catch(() => "unknown" as const);
      toast.success("¡Bienvenido de vuelta!");
      if (keySync === "needs_original_device") {
        toast.warning(
          "Para leer tus chats en este dispositivo, inicia sesión primero en el dispositivo donde ya usabas Fixgo. Allí se creará un respaldo seguro de tu cifrado y luego podrás leer tus chats en todos tus dispositivos.",
          { duration: 12000 },
        );
      } else if (keySync === "restore_failed") {
        toast.warning(
          "No pudimos restaurar tu cifrado con esta contraseña. Si cambiaste tu contraseña, tus chats anteriores podrían seguir apareciendo cifrados.",
          { duration: 12000 },
        );
      }
      setLocation("/");
    } catch (error: any) {
      if (error?.data?.error === "EMAIL_NOT_VERIFIED" || error?.status === 403) {
        setNotVerifiedEmail(data.email);
        return;
      }

      const status: number | undefined = error?.status;
      const serverMsg: string | undefined = error?.data?.error ?? error?.message;

      let friendly = "No pudimos iniciar sesión. Intenta de nuevo.";
      if (status === 401) {
        if (serverMsg === "Account is blocked") {
          friendly = "Tu cuenta está bloqueada. Contacta a soporte.";
        } else {
          friendly = "Correo o contraseña incorrectos.";
        }
      } else if (status === 429) {
        friendly = "Demasiados intentos. Espera 15 minutos antes de volver a intentar.";
      } else if (status === 400) {
        friendly = "Revisa los datos ingresados.";
      } else if (status && status >= 500) {
        friendly = "El servidor no responde. Intenta más tarde.";
      } else if (!status) {
        friendly = "Sin conexión. Revisa tu internet.";
      }

      toast.error(friendly);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-[calc(100vh-72px)]">
      <Card className="w-full max-w-md border-primary/20">
        {notVerifiedEmail && (
          <div className="mx-6 mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <MailWarning className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Correo no verificado</p>
              <p className="text-xs text-muted-foreground">
                Debes verificar <strong>{notVerifiedEmail}</strong> antes de iniciar sesión. Revisa tu bandeja de entrada.
              </p>
              <Link href="/verify-email" className="text-xs text-primary hover:underline font-medium">
                ¿No lo recibiste? Reenviar enlace →
              </Link>
            </div>
          </div>
        )}
        <CardHeader className="space-y-3 text-center">
          <img src="/fixgo-logo.png?v=6" alt="Fixgo" className="h-10 w-auto mx-auto mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Iniciar sesión</CardTitle>
          <CardDescription>
            Ingresa tu correo y contraseña para acceder a tu cuenta
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                className="bg-secondary/50 border-border focus:border-primary"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Contraseña</Label>
              <PasswordInput
                id="password"
                className="bg-secondary/50 border-border focus:border-primary"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(!!checked)}
                className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <label
                htmlFor="remember-me"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Recuérdame
              </label>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full fixgo-gradient font-bold text-white h-12 text-base" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Iniciar sesión
            </Button>
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
            <div className="text-sm text-center text-muted-foreground">
              ¿No tienes una cuenta?{" "}
              <Link href="/register" className="text-primary font-semibold hover:text-primary/80">
                Regístrate
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
