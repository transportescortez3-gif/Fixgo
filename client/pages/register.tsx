import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useRegister, RegisterBodyRole, useListCategories } from "@/api";
import { restoreOrCreateKeyPair } from "@/lib/e2e-crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { PhoneInputCL } from "@/components/phone-input-cl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { getCategoryStyle } from "@/lib/category-icons";

const passwordSchema = z
  .string()
  .min(7, "Debe tener más de 6 caracteres")
  .regex(/[A-Z]/, "Debe incluir al menos 1 mayúscula")
  .regex(/[a-z]/, "Debe incluir al menos 1 minúscula")
  .regex(/[0-9]/, "Debe incluir al menos 1 número");

const registerSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    email: z.string().email("Ingresa un correo electrónico válido"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
    phone: z
      .string()
      .min(1, "El teléfono es obligatorio")
      .regex(/^\+56\d{9}$/, "Ingresa un número chileno válido (9 dígitos)"),
    role: z.enum([RegisterBodyRole.client, RegisterBodyRole.worker]),
    categoryIds: z.array(z.number()).optional(),
    skills: z.string().optional(),
    bio: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const registerMutation = useRegister();
  const [verificationSent, setVerificationSent] = useState<string | null>(null);
  const { data: categories } = useListCategories();
  const [selectedPlatform, setSelectedPlatform] = useState<"expertos" | "fletes">("expertos");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  // Categorías expandidas (para mostrar sus subcategorías)
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  // Subcategorías seleccionadas por el worker { categoryId -> subcategoryId[] }
  const [selectedSubcats, setSelectedSubcats] = useState<Record<number, number[]>>({});

  const filteredCategories = ((categories || []) as any[]).filter(
    (cat: any) => (cat.platform ?? "expertos") === selectedPlatform
  );

  const { register: formRegister, handleSubmit, formState: { errors }, setValue, watch, control } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: RegisterBodyRole.client,
      phone: "",
    }
  });

  const currentRole = watch("role");
  const selectedCategoryIds = watch("categoryIds") || [];

  const toggleCategory = (cat: any) => {
    const id = cat.id;
    const isSelected = selectedCategoryIds.includes(id);
    const updated = isSelected
      ? selectedCategoryIds.filter((x) => x !== id)
      : [...selectedCategoryIds, id];
    setValue("categoryIds", updated);

    if (isSelected) {
      // Deseleccionar categoría → colapsar y limpiar sus subcats
      if (expandedCategoryId === id) setExpandedCategoryId(null);
      setSelectedSubcats((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      // Seleccionar → expandir para mostrar subcategorías
      const hasSubs = cat.subcategories && cat.subcategories.length > 0;
      if (hasSubs) setExpandedCategoryId(id);
    }
  };

  const toggleSubcat = (categoryId: number, subcatId: number) => {
    setSelectedSubcats((prev) => {
      const current = prev[categoryId] || [];
      const updated = current.includes(subcatId)
        ? current.filter((x) => x !== subcatId)
        : [...current, subcatId];
      return { ...prev, [categoryId]: updated };
    });
  };

  const onSubmit = async (data: RegisterForm) => {
    if (data.role === RegisterBodyRole.worker && (!data.categoryIds || data.categoryIds.length === 0)) {
      toast.error("Selecciona al menos una profesión");
      return;
    }

    try {
      const allCategories: any[] = filteredCategories;
      const selectedCats = allCategories.filter((c) => (data.categoryIds || []).includes(c.id));

      // Construir skills: nombres de subcategorías seleccionadas (o nombre de categoría si no eligieron subcats)
      const skillParts: string[] = [];
      for (const cat of selectedCats) {
        const subcatIds = selectedSubcats[cat.id] || [];
        if (subcatIds.length > 0 && cat.subcategories) {
          const subcatNames = cat.subcategories
            .filter((s: any) => subcatIds.includes(s.id))
            .map((s: any) => s.name);
          skillParts.push(...subcatNames);
        } else {
          skillParts.push(cat.name);
        }
      }

      const { confirmPassword, ...rest } = data;
      const result: any = await registerMutation.mutateAsync({
        data: {
          ...rest,
          categoryId: data.categoryIds?.[0] || undefined,
          categoryIds: data.categoryIds,
          skills: skillParts.length > 0 ? skillParts.join(", ") : data.skills,
          platformType: selectedPlatform,
        }
      });
      if (result?.needsVerification) {
        setVerificationSent(data.email);
      } else {
        login(result);
        // Crear el par de llaves E2E y subir su respaldo cifrado con la contraseña
        // de registro (única oportunidad de tenerla en texto plano). No bloqueante.
        const keySync = await restoreOrCreateKeyPair(data.password).catch(() => "unknown" as const);
        toast.success("¡Cuenta creada exitosamente!");
        if (keySync === "needs_original_device") {
          toast.warning(
            "Para leer tus chats en este dispositivo, inicia sesión primero en el dispositivo donde ya usabas Fixgo. Allí se creará un respaldo seguro de tu cifrado.",
            { duration: 12000 },
          );
        }
        setLocation("/");
      }
    } catch (error: any) {
      toast.error(error?.message || "Error al crear la cuenta");
    }
  };

  if (verificationSent) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md border-primary/20">
          <CardHeader className="space-y-3 text-center">
            <img src="/fixgo-logo.png?v=6" alt="Fixgo" className="h-10 w-auto mx-auto mb-2" />
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">¡Revisa tu correo!</CardTitle>
            <CardDescription>
              Te enviamos un enlace de verificación a <strong className="text-foreground">{verificationSent}</strong>.
              Haz clic en el enlace para activar tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span>Revisa tu bandeja de entrada</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Si no lo ves, revisa la carpeta de spam</span>
              </div>
            </div>
            <Link href="/verify-email">
              <Button variant="outline" className="w-full">¿No recibiste el correo? Reenviar</Button>
            </Link>
            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Volver al inicio de sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-lg border-primary/20">
        <CardHeader className="space-y-3 text-center">
          <div className="fixgo-logo text-4xl text-primary mb-2">FIXGO</div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Crear una cuenta</CardTitle>
          <CardDescription>
            Únete a Fixgo para encontrar u ofrecer servicios del hogar
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Quiero...</Label>
              <RadioGroup
                defaultValue={RegisterBodyRole.client}
                onValueChange={(val) => setValue("role", val as RegisterBodyRole)}
                className="flex flex-col space-y-1 sm:flex-row sm:space-x-4 sm:space-y-0"
              >
                <div className="flex items-center space-x-2 border border-border rounded-xl p-4 flex-1 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all" onClick={() => setValue("role", RegisterBodyRole.client)}>
                  <RadioGroupItem value={RegisterBodyRole.client} id="role-client" />
                  <Label htmlFor="role-client" className="cursor-pointer text-foreground">Conectar con un profesional</Label>
                </div>
                <div className="flex items-center space-x-2 border border-border rounded-xl p-4 flex-1 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all" onClick={() => setValue("role", RegisterBodyRole.worker)}>
                  <RadioGroupItem value={RegisterBodyRole.worker} id="role-worker" />
                  <Label htmlFor="role-worker" className="cursor-pointer text-foreground">Trabajar como profesional</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input id="name" placeholder="Juan Pérez" {...formRegister("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" placeholder="correo@ejemplo.com" {...formRegister("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput id="password" autoComplete="new-password" {...formRegister("password")} />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Más de 6 caracteres, con al menos 1 mayúscula, 1 minúscula y 1 número.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <PasswordInput id="confirmPassword" autoComplete="new-password" {...formRegister("confirmPassword")} />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Controller
                control={control}
                name="phone"
                render={({ field }) => (
                  <PhoneInputCL
                    id="phone"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>

            {currentRole === RegisterBodyRole.worker && (
              <>
                {/* Selector de plataforma */}
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label>Tipo de plataforma</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedPlatform("expertos"); setValue("categoryIds", []); setSelectedSubcats({}); setExpandedCategoryId(null); }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        selectedPlatform === "expertos"
                          ? "border-primary bg-primary/10"
                          : "border-border/50 hover:border-primary/30"
                      }`}
                    >
                      <Wrench className={`w-6 h-6 ${selectedPlatform === "expertos" ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-center">
                        <p className={`text-xs font-bold ${selectedPlatform === "expertos" ? "text-foreground" : "text-muted-foreground"}`}>FIXGO Expertos</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Servicios del hogar y profesionales</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Selector de profesiones con subcategorías */}
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label>
                    Profesiones{" "}
                    <span className="text-muted-foreground font-normal">(selecciona las que ofreces)</span>
                  </Label>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {filteredCategories.map((cat: any) => {
                      const style = getCategoryStyle(cat.icon);
                      const Icon = style.icon;
                      const isSelected = selectedCategoryIds.includes(cat.id);
                      const isExpanded = expandedCategoryId === cat.id;
                      const hasSubs = cat.subcategories && cat.subcategories.length > 0;
                      const selectedSubcatCount = (selectedSubcats[cat.id] || []).length;

                      return (
                        <div key={cat.id} className="rounded-xl border border-border/50 overflow-hidden">
                          {/* Fila de categoría */}
                          <button
                            type="button"
                            onClick={() => toggleCategory(cat)}
                            className={`w-full flex items-center gap-3 p-3 transition-all text-left ${
                              isSelected
                                ? `${style.bg} border-b ${isExpanded ? style.border : "border-transparent"}`
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <div className={`w-9 h-9 ${style.bg} rounded-lg flex items-center justify-center border ${style.border} flex-shrink-0`}>
                              <Icon className={`w-4.5 h-4.5 ${style.color}`} strokeWidth={1.8} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                                {cat.name}
                              </p>
                              {isSelected && selectedSubcatCount > 0 && (
                                <p className="text-xs text-primary">
                                  {selectedSubcatCount} especialización{selectedSubcatCount > 1 ? "es" : ""} seleccionada{selectedSubcatCount > 1 ? "s" : ""}
                                </p>
                              )}
                              {isSelected && selectedSubcatCount === 0 && hasSubs && (
                                <p className="text-xs text-muted-foreground">Toca para elegir especializaciones</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                              )}
                              {isSelected && hasSubs && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpandedCategoryId(isExpanded ? null : cat.id); }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                          </button>

                          {/* Subcategorías expandibles */}
                          {isSelected && isExpanded && hasSubs && (
                            <div className="p-3 bg-muted/20 border-t border-border/30">
                              <p className="text-xs text-muted-foreground mb-2 font-medium">Elige tus especializaciones en {cat.name}:</p>
                              <div className="flex flex-wrap gap-2">
                                {cat.subcategories.map((sub: any) => {
                                  const isSubSelected = (selectedSubcats[cat.id] || []).includes(sub.id);
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() => toggleSubcat(cat.id, sub.id)}
                                      className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                                        isSubSelected
                                          ? "bg-primary text-black border-primary"
                                          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                      }`}
                                    >
                                      {sub.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {selectedCategoryIds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Selecciona todas las profesiones que ofreces</p>
                  ) : (
                    <p className="text-xs text-primary font-medium">
                      {selectedCategoryIds.length} profesión{selectedCategoryIds.length > 1 ? "es" : ""} seleccionada{selectedCategoryIds.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label htmlFor="bio">Biografía</Label>
                  <Textarea id="bio" placeholder="Cuéntale a los clientes sobre tu experiencia..." {...formRegister("bio")} />
                </div>
              </>
            )}

          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="w-full space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary flex-shrink-0"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  He leído y acepto los{" "}
                  <Link href="/terms" className="text-primary underline hover:text-primary/80">
                    Términos y Condiciones
                  </Link>{" "}
                   de Fixgo.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={e => setAcceptedPrivacy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary flex-shrink-0"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  He leído y acepto la{" "}
                  <Link href="/privacy" className="text-primary underline hover:text-primary/80">
                    Política de Privacidad
                  </Link>{" "}
                   de Fixgo.
                </span>
              </label>
            </div>
            <Button type="submit" className="w-full fixgo-gradient font-bold text-white h-12 text-base" disabled={registerMutation.isPending || !acceptedTerms || !acceptedPrivacy}>
              {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Cuenta
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login" className="text-primary underline hover:text-primary/80">
                Iniciar sesión
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
