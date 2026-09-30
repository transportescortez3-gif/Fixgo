import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useListServices, useGetSiteSettings } from "@/api";
import { useAllPlans } from "@/hooks/use-subscription";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRight, Star, Clock, CheckCircle2, MapPin, Wrench, Leaf, Truck, Hammer, Sparkles, Heart, Car, ShieldCheck, PawPrint, HardHat, Zap, ChevronRight, Shield, Users, MessageSquare, Phone, TrendingUp, Award } from "lucide-react";
import { getCategoryStyle } from "@/lib/category-icons";
import { Skeleton } from "@/components/ui/skeleton";
import WorkerHome from "@/components/worker-home";
import ClientHome from "@/components/client-home";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState, useMemo } from "react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Conectado",
  in_progress: "Chat abierto",
  completed: "Completado",
  cancelled: "Cancelado",
};

const expertosCategories = [
  { name: "Mantenciones y Reparaciones", icon: Wrench,      desc: "Arreglos generales, gasfitería, electricidad y mantenimiento del hogar" },
  { name: "Limpieza y Aseo",             icon: Sparkles,    desc: "Limpieza profunda residencial, comercial y post-obra" },
  { name: "Jardinería",                  icon: Leaf,        desc: "Diseño, mantención, poda y cuidado de áreas verdes" },
  { name: "Servicios Domésticos y Eventos", icon: HardHat,  desc: "Apoyo en el hogar, cocina, niñera y organización de eventos" },
  { name: "Mano de Obra",                icon: Truck,       desc: "Trabajo físico, jornaleros, armado de muebles y ayudantes generales" },
  { name: "Salud, Bienestar y Cuidados", icon: Heart,       desc: "Cuidado de personas, enfermería en casa y bienestar" },
  { name: "Automotriz",                  icon: Car,         desc: "Mecánica, lavado, diagnóstico y servicios para vehículos" },
  { name: "Cámara de Seguridad y Alarmas", icon: ShieldCheck, desc: "Instalación, configuración y monitoreo de sistemas de seguridad" },
  { name: "Personal para Mandados y Junior", icon: Hammer,  desc: "Diligencias, compras, asistencia y trámites" },
  { name: "Cuidado y Estética Canina",   icon: PawPrint,    desc: "Grooming, paseos, guardería y cuidado de mascotas" },
];

const fletesCategories = [
  { name: "Mudanzas Residenciales y Comerciales", icon: Truck,     desc: "Servicio completo de mudanzas para casas, departamentos y oficinas" },
  { name: "Fletes y Transporte de Carga",         icon: Truck,     desc: "Transporte de mercancías, materiales y objetos de todo tipo" },
  { name: "Transporte Intercomunal y Regional",   icon: Truck,     desc: "Fletes entre comunas y regiones de Chile" },
  { name: "Ayudantes para Carga y Descarga",      icon: HardHat,   desc: "Personal para apoyar carga, descarga y traslado de objetos pesados" },
  { name: "Bodega y Logística",                   icon: HardHat,   desc: "Servicios de almacenamiento, picking, packing y distribución" },
  { name: "Retiro de Escombros y Residuos",       icon: Hammer,    desc: "Retiro y transporte de escombros, muebles viejos y residuos" },
];

const steps = [
  { num: "01", title: "Publica tu necesidad", desc: "Cuéntanos qué servicio necesitas, dónde y cuándo. Puedes agregar fotos y detalles del trabajo.", icon: MessageSquare },
  { num: "02", title: "Recibe propuestas", desc: "Profesionales verificados cerca de ti envían sus propuestas y disponibilidad.", icon: Users },
  { num: "03", title: "Elige y conecta", desc: "Compara perfiles y calificaciones. Elige al mejor profesional y coordina los detalles por chat.", icon: CheckCircle2 },
  { num: "04", title: "Coordina por chat cifrado", desc: "Usa el chat privado y cifrado E2E para acordar todo directamente con el profesional.", icon: Shield },
];

const statIcons = [CheckCircle2, Users, Star, Clock];

function AnimatedCounter({ value, suffix = "", duration = 2, decimals = 0 }: { value: number; suffix?: string; duration?: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!isInView || !ref.current) return;
    const node = ref.current;
    const startTime = performance.now();
    const durationMs = duration * 1000;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / durationMs, 1);
      const v = ease(t) * value;
      node.textContent = (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("es-CL")) + suffix;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isInView, value, suffix, duration, decimals]);

  return <span ref={ref}>{decimals > 0 ? (0).toFixed(decimals) : "0"}{suffix}</span>;
}

function FloatingParticles() {
  const isMobile = useIsMobile();
  const particles = useMemo(() => Array.from({ length: isMobile ? 0 : 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 8 + 14,
    delay: Math.random() * 5,
  })), [isMobile]);

  if (isMobile) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, willChange: "transform, opacity" }}
          animate={{ y: [0, -30, 0, 20, 0], x: [0, 15, -10, 5, 0], opacity: [0.2, 0.6, 0.3, 0.5, 0.2] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function AnimatedOrb({ className, delay = 0 }: { className: string; delay?: number }) {
  const isMobile = useIsMobile();
  if (isMobile) return <div className={className} aria-hidden />;
  return (
    <motion.div
      className={className}
      style={{ willChange: "transform" }}
      animate={{ scale: [1, 1.15, 0.97, 1.08, 1], x: [0, 20, -12, 10, 0], y: [0, -18, 10, -8, 0] }}
      transition={{ duration: 22, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

const cubicEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: cubicEase },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const wordReveal = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: 0.2 + i * 0.07, ease: cubicEase },
  }),
};

function AnimatedText({ text, className }: { text: string; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });
  const words = text.split(" ");

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={wordReveal}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

function SectionReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function AnimatedAppMockup() {
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setStep((s) => (s + 1) % 4), 3000);
    return () => clearInterval(interval);
  }, []);

  const pros = [
    { name: "Carlos E.", rating: "4.9", time: "25 min", active: step >= 1 },
    { name: "Ana P.", rating: "4.8", time: "40 min", active: step >= 2 },
  ];

  return (
    <motion.div
      initial={isMobile ? false : { opacity: 0, scale: 0.95, y: 10 }}
      animate={isMobile ? false : { opacity: 1, scale: 1, y: 0 }}
      transition={isMobile ? undefined : { duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      <div className="absolute -inset-4 bg-primary/10 rounded-[2rem] blur-2xl opacity-40" />
      <div className="relative bg-card border border-border/50 rounded-3xl p-6 space-y-4 shadow-2xl shadow-primary/10">
        <motion.div
          className="flex items-center gap-3 pb-4 border-b border-border/50"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <motion.div
            className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Zap className="w-5 h-5 text-primary-foreground" />
          </motion.div>
          <div>
            <p className="font-bold text-foreground">Reparación eléctrica</p>
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Av. Providencia 1234, Santiago
              </p>
            </div>
          </div>
        </motion.div>

        <div className="space-y-3">
          {pros.map((pro, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 30, scale: 0.95 }}
              animate={pro.active ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0.3, x: 30, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/30"
            >
              <motion.div whileHover={{ scale: 1.1 }}>
                <Avatar className="w-10 h-10 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {pro.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{pro.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="w-3 h-3 fill-primary text-primary" />
                  <span>{pro.rating}</span>
                  <span>•</span>
                  <MapPin className="w-3 h-3" />
                  <span>{pro.time}</span>
                </div>
              </div>
              {pro.active && (
                <motion.span
                  className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  Disponible
                </motion.span>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          animate={step === 3 ? { scale: [1, 1.03, 1] } : {}}
          transition={{ duration: 0.5 }}
        >
          <Button
            className={`w-full font-bold text-black rounded-xl h-11 transition-all duration-500 ${
              step === 3 ? "fixgo-gradient shadow-lg shadow-primary/30" : "bg-primary/30"
            }`}
          >
            {step < 3 ? "Esperando propuestas..." : "Abrir chat seguro"}
          </Button>
        </motion.div>

        <div className="flex justify-center gap-1.5 pt-1">
          {[0, 1, 2, 3].map((s) => (
            <motion.div
              key={s}
              className={`h-1.5 rounded-full transition-colors duration-300 ${s === step ? "bg-primary" : "bg-border"}`}
              animate={{ width: s === step ? 24 : 8 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>

      <motion.div
        className="absolute -bottom-4 -right-4 bg-primary/10 border border-primary/25 rounded-2xl p-3 flex items-center gap-2"
        initial={{ opacity: 0, scale: 0, rotate: -10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 2, duration: 0.6, type: "spring" }}
      >
        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          <Shield className="w-5 h-5 text-primary" />
        </motion.div>
        <div>
          <p className="text-xs font-bold text-primary">Chat cifrado E2E</p>
          <p className="text-[10px] text-primary/70">Profesionales verificados</p>
        </div>
      </motion.div>

      <motion.div
        className="absolute -top-3 -left-3 bg-primary/10 border border-primary/25 rounded-2xl p-2.5 flex items-center gap-2"
        initial={{ opacity: 0, scale: 0, rotate: 10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 2.3, duration: 0.6, type: "spring" }}
      >
        <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
          <Clock className="w-4 h-4 text-primary" />
        </motion.div>
        <div>
          <p className="text-xs font-bold text-primary">Respuesta rápida</p>
          <p className="text-[10px] text-primary/60">~15 min promedio</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GlowLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      initial={{ scaleX: 0, opacity: 0 }}
      whileInView={{ scaleX: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

function LoggedInHero() {
  const { user, isClient, isWorker } = useAuth();
  const [, setLocation] = useLocation();
  const { data: servicesData } = useListServices({
    ...(isClient ? { clientId: user?.id } : {}),
    ...(isWorker ? { workerId: user?.id } : {}),
    limit: 10, noCount: "true",
  } as any, { query: { staleTime: 30_000 } } as any);

  const ACTIVE_SERVICE_STATUSES = ["pending", "accepted", "in_progress"];
  const activeServices = (servicesData?.services ?? []).filter((s: any) => ACTIVE_SERVICE_STATUSES.includes(s.status)).slice(0, 3);

  if (!user) return null;

  return (
    <section className="w-full bg-card/50 border-b border-border/50">
      <div className="container px-4 py-6 md:py-8 max-w-7xl mx-auto">
        <motion.div
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary/30">
              <AvatarFallback className="bg-primary/10 text-primary font-bold">{user.name.substring(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-foreground">Hola, <span className="text-primary">{user.name.split(" ")[0]}</span></h2>
              <p className="text-sm text-muted-foreground">
                {isWorker ? 'Encuentra nuevos trabajos' : '¿En qué necesitas ayuda hoy?'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isClient && (
              <Button asChild className="fixgo-gradient font-bold text-white rounded-xl">
                <Link href="/services/new">Solicitar Servicio</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10 rounded-xl">
              <Link href="/services">
                {isWorker ? 'Ver Trabajos' : 'Mis Servicios'} <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </motion.div>

        {activeServices.length > 0 && (
          <motion.div
            className="grid gap-2 md:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {activeServices.map((service: any, i: number) => (
              <motion.div key={service.id} variants={fadeUp} custom={i}>
                <Card className="hover:border-primary/30 transition-all cursor-pointer border-border/50" onClick={() => setLocation(`/services/${service.id}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {(() => {
                      const s = getCategoryStyle(service.category?.icon ?? undefined);
                      const CIcon = s.icon;
                      return (
                        <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center flex-shrink-0 border ${s.border}`}>
                          <CIcon className={`w-4 h-4 ${s.color}`} strokeWidth={1.8} />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{service.title}</p>
                      <p className="text-xs text-muted-foreground">{service.category.name}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5 flex-shrink-0">{statusLabels[service.status] || service.status}</Badge>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}

const CLP_FMT = (n: number) =>
  n === 0 ? "Gratis" : "$" + n.toLocaleString("es-CL");

const PLAN_FEATURE_LABELS: Record<string, (v: any) => string | null> = {
  posts_per_month:    v => v === -1 ? "Publicaciones ilimitadas" : `${v} publicaciones/mes`,
  messages_per_post:  v => v === -1 ? "Mensajes ilimitados" : `${v} mensajes por publicación`,
  map_radius_km:      v => v === -1 ? "Mapa sin límite de radio" : `Mapa radio ${v} km`,
  presale_chat:       v => v ? "Chat antes de conectar" : null,
  full_reviews:       v => v ? "Reseñas completas" : null,
  ads:                v => !v ? "Sin publicidad" : null,
  human_support:      v => v ? "Soporte humano" : null,
  radius_km:          v => v === -1 ? "Radio de trabajo ilimitado" : `Radio de trabajo ${v} km`,
  leads_per_month:    v => v === -1 ? "Solicitudes ilimitadas" : `${v} solicitudes/mes`,
  messages_per_month: v => v === -1 ? "Mensajes ilimitados" : `${v} mensajes/mes`,
  categories:         v => v === -1 ? "Categorías ilimitadas" : `${v} categoría${v > 1 ? "s" : ""}`,
  verified_badge:     v => v ? "Insignia Verificado" : null,
  priority_position:  v => v ? "Posición prioritaria en búsquedas" : null,
  top_position:       v => v ? "Posición TOP en búsquedas" : null,
  map_featured:       v => v ? "Destacado en el mapa" : null,
  stats:              v => v === "advanced" ? "Estadísticas avanzadas" : v === "basic" ? "Estadísticas básicas" : null,
  public_page:        v => v ? "Página web pública" : null,
  top_pro_badge:      v => v ? "Insignia Top Pro" : null,
  whatsapp_support:   v => v ? "Soporte WhatsApp" : null,
  preferred_support:  v => v ? "Soporte preferente" : null,
};

function planFeatureList(features: Record<string, any> | null | undefined): string[] {
  if (!features || typeof features !== "object") return [];
  return Object.entries(features)
    .map(([k, v]) => {
      try { return PLAN_FEATURE_LABELS[k]?.(v) ?? null; } catch { return null; }
    })
    .filter(Boolean) as string[];
}

function PlansTeaserSection() {
  const { data: plans = [], isLoading, isError } = useAllPlans();
  const [audience, setAudience] = useState<"client" | "worker">("client");

  if (isError) return null;

  const featuredCodes = audience === "client"
    ? ["client_free", "client_premium_monthly"]
    : ["pro_free", "pro_monthly", "pro_plus_monthly"];

  const featured = featuredCodes
    .map(code => plans.find(p => p.code === code))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <section className="w-full py-12 md:py-20 bg-background relative" id="planes">
      <GlowLine />
      <div className="container px-4 md:px-6 max-w-7xl mx-auto">
        <SectionReveal className="text-center mb-8 md:mb-12 space-y-3">
          <Badge variant="outline" className="border-primary/30 text-primary font-semibold">Planes de suscripción</Badge>
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">
            <AnimatedText text="Elige el plan que se ajusta a ti" />
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Fixgo es una licencia de software: tú pagas por acceder a la plataforma y los pagos por servicios los acuerdas directamente con la otra persona.
          </p>
        </SectionReveal>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-xl bg-card border border-border/50 p-1">
            {(["client", "worker"] as const).map(a => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  audience === a
                    ? "bg-primary text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`button-audience-${a}`}
              >
                {a === "client" ? "Soy Cliente" : "Soy Profesional"}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Los planes estarán disponibles muy pronto.</p>
            <Button asChild variant="outline" className="mt-4 border-primary/30 hover:bg-primary/10 rounded-xl">
              <Link href="/register">Crear cuenta gratis</Link>
            </Button>
          </div>
        ) : (
          <div className={`grid gap-4 sm:grid-cols-2 ${featured.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2 max-w-3xl mx-auto"}`}>
            {featured.map((plan, i) => {
              const items = planFeatureList(plan.features as Record<string, any>);
              const isPaid = plan.priceClp > 0;
              const isHighlight = plan.code === "client_premium_monthly" || plan.code === "pro_monthly";
              return (
                <SectionReveal key={plan.code} delay={i * 0.1}>
                  <motion.div
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className={`relative flex flex-col h-full rounded-2xl border p-6 transition-all ${
                      isHighlight
                        ? "border-primary/40 bg-card shadow-lg shadow-primary/10"
                        : "border-border/50 bg-card/60"
                    }`}
                  >
                    {isHighlight && (
                      <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-white">
                        Más popular
                      </span>
                    )}
                    <div className="mb-4 flex items-center gap-2">
                      {isPaid ? <Star className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
                      <span className="font-bold text-foreground">{plan.name}</span>
                    </div>
                    <div className="mb-5">
                      <span className="text-3xl font-bold text-foreground">{CLP_FMT(plan.priceClp)}</span>
                      {isPaid && (
                        <span className="ml-1 text-sm text-muted-foreground">
                          /{plan.interval === "annual" ? "año" : "mes"}
                        </span>
                      )}
                    </div>
                    <ul className="mb-6 flex-1 space-y-2">
                      {items.slice(0, 6).map(item => (
                        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className={`w-full rounded-xl font-bold ${
                        isHighlight
                          ? "fixgo-gradient text-white"
                          : "bg-secondary text-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <Link href={isPaid ? "/register" : "/register"}>
                        {isPaid ? "Empezar ahora" : "Crear cuenta gratis"}
                      </Link>
                    </Button>
                  </motion.div>
                </SectionReveal>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10 rounded-xl">
            <Link href="/planes">
              Ver comparativa completa de planes
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Precios incluyen IVA. Pago procesado por Transbank Webpay. Sin renovación automática inesperada — te avisamos antes de vencer.
          </p>
        </div>
      </div>
    </section>
  );
}

// Detectado UNA sola vez al cargar el módulo (no en cada render).
const IS_NATIVE = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

export default function Home() {
  const { user, isAdmin, isWorker, isFletes } = useAuth();
  const allCategories = isFletes ? fletesCategories : expertosCategories;

  const DEFAULT_SETTINGS: Record<string, string> = {
    hero_title: "Servicios del hogar",
    hero_highlight: "a un toque de distancia.",
    hero_description: "Fixgo es la plataforma chilena que conecta personas con profesionales verificados. Suscríbete y accede a chat cifrado, llamadas y perfiles validados — los pagos los acuerdas directamente con el profesional.",
    hero_cta_primary: "Buscar Profesional",
    hero_cta_secondary: "Quiero ser Profesional",
    stats_services: "10K+",
    stats_services_label: "Conexiones realizadas",
    stats_professionals: "2.5K+",
    stats_professionals_label: "Profesionales activos",
    stats_rating: "4.8",
    stats_rating_label: "Calificación promedio",
    stats_response: "15 min",
    stats_response_label: "Tiempo de respuesta",
    testimonial_1_name: "Carolina M.", testimonial_1_role: "Cliente", testimonial_1_text: "Publiqué que necesitaba un electricista y en 20 minutos ya estaba conversando con Carlos por el chat. Llegó el mismo día.", testimonial_1_rating: "5",
    testimonial_2_name: "Roberto S.", testimonial_2_role: "Profesional", testimonial_2_text: "Con mi plan Pro recibo solicitudes cada día. Coordino todo por el chat cifrado y acuerdo el precio directo con cada cliente.", testimonial_2_rating: "5",
    testimonial_3_name: "Patricia L.", testimonial_3_role: "Cliente", testimonial_3_text: "Lo que más valoro es la verificación de identidad y poder leer reseñas reales antes de elegir. Mi plomero habitual ahora lo encuentro aquí.", testimonial_3_rating: "5",
    cta_title: "¿Listo para resolver tu problema?",
    cta_description: "Únete a miles de personas que ya confían en Fixgo para conectar con profesionales verificados de forma segura.",
    pro_title: "¿Eres profesional?\nÚnete a Fixgo",
    pro_description: "Recibe solicitudes de clientes nuevos cada día, gestiona tus conversaciones desde un solo lugar y haz crecer tu reputación con calificaciones verificadas. Tú acuerdas el precio y los pagos con cada cliente.",
  };

  const SETTINGS_KEY = "fixgo_site_settings_v1";
  const cachedSettings = useMemo(() => {
    try { const r = localStorage.getItem(SETTINGS_KEY); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
  }, []);

  const { data: siteSettings } = useGetSiteSettings({ query: { staleTime: 5 * 60 * 1000, initialData: cachedSettings ?? DEFAULT_SETTINGS } as any });

  useEffect(() => {
    if (siteSettings) {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(siteSettings)); } catch {}
    }
  }, [siteSettings]);

  // En nativo, App.tsx mantiene WorkerHome/ClientHome siempre montados
  // fuera del Switch para preservar el MapView nativo. Esta ruta devuelve
  // null para no crear una segunda instancia paralela.
  if (isWorker && user) {
    return IS_NATIVE ? null : <WorkerHome />;
  }

  if (user && !isAdmin) {
    return IS_NATIVE ? null : <ClientHome />;
  }

  const s = (siteSettings || {}) as Record<string, string>;

  const heroTitle = s.hero_title || DEFAULT_SETTINGS.hero_title;
  const heroHighlight = s.hero_highlight || DEFAULT_SETTINGS.hero_highlight;
  const heroDescription = s.hero_description || DEFAULT_SETTINGS.hero_description;
  const heroCtaPrimary = s.hero_cta_primary || DEFAULT_SETTINGS.hero_cta_primary;
  const heroCtaSecondary = s.hero_cta_secondary || DEFAULT_SETTINGS.hero_cta_secondary;

  const parseStatNum = (raw: string, fallback: number): number => {
    const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    if (isNaN(n)) return fallback;
    if (/k/i.test(raw)) return n * 1000;
    return n;
  };

  const dynamicStats = [
    { label: s.stats_services_label || DEFAULT_SETTINGS.stats_services_label, icon: statIcons[0], num: parseStatNum(s.stats_services || DEFAULT_SETTINGS.stats_services, 10000), suffix: "+", decimals: 0 },
    { label: s.stats_professionals_label || DEFAULT_SETTINGS.stats_professionals_label, icon: statIcons[1], num: parseStatNum(s.stats_professionals || DEFAULT_SETTINGS.stats_professionals, 2500), suffix: "+", decimals: 0 },
    { label: s.stats_rating_label || DEFAULT_SETTINGS.stats_rating_label, icon: statIcons[2], num: parseStatNum(s.stats_rating || DEFAULT_SETTINGS.stats_rating, 4.8), suffix: "", decimals: 1 },
    { label: s.stats_response_label || DEFAULT_SETTINGS.stats_response_label, icon: statIcons[3], num: parseStatNum(s.stats_response || DEFAULT_SETTINGS.stats_response, 15), suffix: " min", decimals: 0 },
  ];

  const dynamicTestimonials = [1, 2, 3].map(i => ({
    name: s[`testimonial_${i}_name`] || `Usuario ${i}`,
    role: s[`testimonial_${i}_role`] || "Cliente",
    text: s[`testimonial_${i}_text`] || "",
    rating: parseInt(s[`testimonial_${i}_rating`] || "5"),
  }));

  const ctaTitle = s.cta_title || DEFAULT_SETTINGS.cta_title;
  const ctaDescription = s.cta_description || DEFAULT_SETTINGS.cta_description;
  const proTitle = s.pro_title || DEFAULT_SETTINGS.pro_title;
  const proDescription = s.pro_description || DEFAULT_SETTINGS.pro_description;

  return (
    <div className="w-full">
      {user && !isAdmin && <LoggedInHero />}

      {!user && (
        <section className="w-full py-16 md:py-28 lg:py-36 relative overflow-hidden">
          {/* Grid sutil de fondo */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(26,140,248,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,140,248,0.025)_1px,transparent_1px)] bg-[size:72px_72px] pointer-events-none" />
          {/* Resplandor superior muy suave */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(26,140,248,0.06)_0%,transparent_65%)] pointer-events-none" />
          <FloatingParticles />
          <AnimatedOrb className="absolute top-10 left-0 w-80 h-80 bg-primary/7 rounded-full blur-[90px]" delay={0} />
          <AnimatedOrb className="absolute bottom-0 right-0 w-[420px] h-[420px] bg-primary/5 rounded-full blur-[110px]" delay={5} />

          <div className="container px-4 md:px-6 relative z-10 max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <div className="flex-1 space-y-8 text-center lg:text-left">

                {/* Badge premium */}
                <motion.div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-sm font-semibold mx-auto lg:mx-0"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {isFletes ? "Plataforma de fletes #1 en Chile" : "Plataforma de servicios #1 en Chile"}
                </motion.div>

                <div className="space-y-5">
                  <motion.h1
                    className="fixgo-logo text-6xl sm:text-7xl md:text-8xl lg:text-8xl tracking-tight leading-none"
                    initial={{ opacity: 0, scale: 0.88, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="inline-block fixgo-brand-text fixgo-glow drop-shadow-[0_0_40px_rgba(26,140,248,0.3)]">
                      {isFletes ? "FIXGO\nFletes" : "FIXGO\nExpertos"}
                    </span>
                  </motion.h1>

                  <div className="space-y-1">
                    <p className="text-xl md:text-2xl lg:text-3xl font-semibold text-foreground/90 leading-snug">
                      <AnimatedText text={heroTitle} />
                    </p>
                    <p className="text-xl md:text-2xl lg:text-3xl font-bold leading-snug">
                      <span className="text-primary drop-shadow-[0_0_20px_rgba(26,140,248,0.4)]">
                        <AnimatedText text={heroHighlight} />
                      </span>
                    </p>
                  </div>

                  <p className="max-w-md text-muted-foreground md:text-base lg:text-lg leading-relaxed mx-auto lg:mx-0">
                    {heroDescription}
                  </p>
                </div>

                <motion.div
                  className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center lg:justify-start"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    <Button asChild size="lg" className="h-14 px-10 text-lg rounded-xl fixgo-gradient font-bold text-white relative overflow-hidden shadow-[0_0_30px_rgba(26,140,248,0.35)] hover:shadow-[0_0_45px_rgba(26,140,248,0.55)] transition-shadow duration-300">
                      <Link href="/register">
                        <motion.span
                          className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0"
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
                        />
                        {heroCtaPrimary}
                        <ChevronRight className="w-5 h-5 ml-1" />
                      </Link>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    <Button asChild variant="outline" size="lg" className="h-14 px-10 text-lg rounded-xl border-primary/25 bg-primary/5 hover:bg-primary/12 hover:border-primary/50 font-semibold transition-all duration-200">
                      <Link href="/register">{heroCtaSecondary}</Link>
                    </Button>
                  </motion.div>
                </motion.div>

                <motion.div
                  className="flex items-center gap-5 justify-center lg:justify-start"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45, duration: 0.5 }}
                >
                  <div className="flex -space-x-2.5">
                    {['CA', 'AN', 'MA', 'RO'].map((initials, i) => (
                      <Avatar key={i} className="w-9 h-9 border-2 border-background ring-1 ring-primary/20">
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">{initials}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <div className="text-sm">
                    <div className="flex items-center gap-0.5 mb-0.5">
                      {[1,2,3,4,5].map(i => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0, rotate: -180 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          transition={{ delay: 2.0 + i * 0.08, duration: 0.4, type: "spring" }}
                        >
                          <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                        </motion.div>
                      ))}
                      <span className="ml-1.5 font-bold text-foreground">4.9</span>
                    </div>
                    <span className="text-muted-foreground text-xs">+{Math.round(dynamicStats[1].num).toLocaleString("es-CL")} profesionales activos</span>
                  </div>
                </motion.div>
              </div>

              <div className="flex-1 max-w-md w-full hidden lg:block">
                <AnimatedAppMockup />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="w-full py-12 md:py-16 bg-card/30 relative" id="stats">
        <GlowLine />
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {dynamicStats.map(({ label, icon: Icon, num, suffix, decimals }, i) => (
              <SectionReveal key={label} delay={i * 0.1}>
                <div className="text-center space-y-2">
                  <motion.div
                    whileInView={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.15 }}
                  >
                    <Icon className="w-6 h-6 text-primary mx-auto" />
                  </motion.div>
                  <p className="text-2xl md:text-3xl font-bold text-foreground">
                    <AnimatedCounter value={num} suffix={suffix} decimals={decimals} duration={num > 100 ? 2 : 1.5} />
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">{label}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-20 bg-background relative" id="servicios">
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <SectionReveal className="text-center mb-10 md:mb-14 space-y-3">
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">Servicios</Badge>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">
              <AnimatedText text="Todo lo que tu hogar necesita" />
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Profesionales expertos en cada área, listos para resolver cualquier problema de tu hogar.</p>
          </SectionReveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {allCategories.map(({ name, icon: Icon, desc }, i) => (
              <SectionReveal key={name} delay={i * 0.07}>
                <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: "spring", stiffness: 300 }}>
                  <Card className="group cursor-pointer border-primary/10 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 bg-card h-full">
                    <CardContent className="p-5 md:p-6 flex flex-col items-center md:items-start text-center md:text-left space-y-3">
                      <motion.div
                        className="p-3 bg-primary rounded-xl text-primary-foreground"
                        whileHover={{ rotate: [0, -10, 10, 0], scale: 1.15 }}
                        transition={{ duration: 0.4 }}
                      >
                        <Icon className="w-6 h-6" />
                      </motion.div>
                      <div>
                        <h3 className="font-bold text-sm md:text-base text-foreground">{name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 hidden md:block">{desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-20 bg-card/50 relative" id="como-funciona">
        <GlowLine />
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <SectionReveal className="text-center mb-10 md:mb-14 space-y-3">
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">Proceso</Badge>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">
              <AnimatedText text="¿Cómo funciona Fixgo?" />
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">En 4 simples pasos, tu problema queda resuelto.</p>
          </SectionReveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 relative">
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px">
              <motion.div
                className="h-full bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            {steps.map(({ num, title, desc, icon: Icon }, i) => (
              <SectionReveal key={num} delay={i * 0.15}>
                <motion.div
                  className="relative group h-full"
                  whileHover={{ y: -5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 h-full hover:border-primary/30 transition-all relative z-10">
                    <div className="flex items-center gap-3">
                      <motion.span
                        className="text-3xl font-bold text-primary/30"
                        whileInView={{ opacity: [0, 1], scale: [2, 1] }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
                      >
                        {num}
                      </motion.span>
                      <motion.div
                        className="p-2 bg-primary/10 rounded-lg"
                        whileInView={{ rotate: [0, 360] }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.5 + i * 0.15 }}
                      >
                        <Icon className="w-5 h-5 text-primary" />
                      </motion.div>
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </motion.div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-20 bg-background relative" id="testimonios">
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <SectionReveal className="text-center mb-10 md:mb-14 space-y-3">
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">Testimonios</Badge>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">
              <AnimatedText text="Lo que dicen nuestros usuarios" />
            </h2>
          </SectionReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {dynamicTestimonials.map((t, i) => (
              <SectionReveal key={i} delay={i * 0.12}>
                <motion.div
                  whileHover={{ y: -6, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="border-border/50 hover:border-primary/20 transition-all h-full">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(st => (
                          <motion.div
                            key={st}
                            initial={{ opacity: 0, scale: 0 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3 + st * 0.05, type: "spring" }}
                          >
                            <Star className={`w-4 h-4 ${st <= t.rating ? 'fill-primary text-primary' : 'text-muted'}`} />
                          </motion.div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.text}"</p>
                      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{t.name.substring(0,2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.role}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-20 bg-card/50 relative" id="profesionales">
        <GlowLine />
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <SectionReveal>
              <div className="space-y-6">
                <Badge variant="outline" className="border-primary/30 text-primary font-semibold">Para Profesionales</Badge>
                <h2 className="text-2xl md:text-4xl font-bold text-foreground whitespace-pre-line">
                  <AnimatedText text={proTitle.replace("\n", " ")} />
                </h2>
                <p className="text-muted-foreground leading-relaxed">{proDescription}</p>
                <div className="space-y-3">
                  {[
                    { icon: TrendingUp, text: "Recibe solicitudes de clientes nuevos cada día" },
                    { icon: Shield, text: "Chat cifrado E2E y llamadas directas con clientes" },
                    { icon: Award, text: "Construye tu reputación con calificaciones verificadas" },
                    { icon: Phone, text: "Tú acuerdas el precio y los pagos con cada cliente" },
                  ].map(({ icon: Icon, text }, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <motion.div
                        className="p-1.5 bg-primary/10 rounded-lg"
                        whileHover={{ scale: 1.2, rotate: 10 }}
                      >
                        <Icon className="w-4 h-4 text-primary" />
                      </motion.div>
                      <span className="text-sm text-foreground">{text}</span>
                    </motion.div>
                  ))}
                </div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button asChild size="lg" className="fixgo-gradient font-bold text-white rounded-xl h-12 px-8 relative overflow-hidden">
                    <Link href="/register">
                      <motion.span
                        className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0"
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
                      />
                      Registrarme como Profesional
                    </Link>
                  </Button>
                </motion.div>
              </div>
            </SectionReveal>

            <SectionReveal delay={0.2} className="hidden md:block">
              <motion.div
                className="bg-card border border-border/50 rounded-3xl p-6 space-y-4"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="w-14 h-14 border-2 border-primary/30">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">CE</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-lg">Carlos Electricista</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Star className="w-4 h-4 fill-primary text-primary" />
                      <span className="font-semibold text-foreground">4.9</span>
                      <span>• 187 reseñas</span>
                    </div>
                  </div>
                  <motion.div
                    className="ml-auto"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">En línea</Badge>
                  </motion.div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: "Pro+", label: "Plan activo" },
                    { val: "23", label: "Conexiones" },
                    { val: "<15m", label: "Respuesta" },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      className="bg-secondary/50 rounded-xl p-3 text-center"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                    >
                      <p className="text-lg font-bold text-foreground">{stat.val}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
                <motion.div
                  className="space-y-2 pt-2"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 }}
                >
                  <motion.div
                    className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl"
                    animate={{ borderColor: ["hsl(221 83% 53% / 0.2)", "hsl(221 83% 53% / 0.5)", "hsl(221 83% 53% / 0.2)"] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Nueva solicitud disponible</p>
                      <p className="text-xs text-muted-foreground">Instalación eléctrica • Las Condes</p>
                    </div>
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </motion.div>
                  </motion.div>
                </motion.div>
              </motion.div>
            </SectionReveal>
          </div>
        </div>
      </section>

      {!user && <PlansTeaserSection />}

      {!user && (
        <section className="w-full py-16 md:py-24 bg-background relative overflow-hidden">
          <AnimatedOrb className="absolute top-0 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-[80px]" delay={2} />
          <AnimatedOrb className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary/8 rounded-full blur-[60px]" delay={7} />
          <div className="container px-4 md:px-6 relative z-10 max-w-3xl mx-auto text-center space-y-8">
            <SectionReveal>
              <h2 className="text-2xl md:text-4xl font-bold text-foreground">
                <AnimatedText text={ctaTitle} />
              </h2>
            </SectionReveal>
            <SectionReveal delay={0.15}>
              <p className="text-muted-foreground md:text-lg max-w-xl mx-auto">{ctaDescription}</p>
            </SectionReveal>
            <SectionReveal delay={0.3}>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button asChild size="lg" className="h-14 px-10 text-lg rounded-xl fixgo-gradient font-bold text-white relative overflow-hidden">
                    <Link href="/register">
                      <motion.span
                        className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0"
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
                      />
                      Crear Cuenta Gratis
                    </Link>
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button asChild variant="outline" size="lg" className="h-14 px-10 text-lg rounded-xl border-primary/30 hover:bg-primary/10 hover:border-primary">
                    <Link href="/login">Ya tengo cuenta</Link>
                  </Button>
                </motion.div>
              </div>
            </SectionReveal>
          </div>
        </section>
      )}

      <footer className="w-full py-8 border-t border-border/50 bg-card/30">
        <div className="container px-4 md:px-6 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <img src="/fixgo-logo.png?v=6" alt="Fixgo" className="h-7 w-auto" />
              <span className="text-sm text-muted-foreground">— El que arregla.</span>
            </motion.div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>© 2026 Fixgo</span>
              <span>•</span>
              <Link href="/planes" className="hover:text-foreground transition-colors cursor-pointer">Planes</Link>
              <span>•</span>
              <Link href="/terms" className="hover:text-foreground transition-colors cursor-pointer">Términos</Link>
              <span>•</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors cursor-pointer">Privacidad</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
