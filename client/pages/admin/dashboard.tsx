import { useState } from "react";
import { useGetAdminStats, getGetAdminStatsQueryKey } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Users, Briefcase, TrendingUp, ShieldCheck, ArrowRight, Globe, BarChart3, Activity, ArrowLeftRight, Loader2, User, Hammer, Crown, Package } from "lucide-react";
import AdminTicketWidget from "@/components/admin-ticket-widget";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { isAdmin, switchRole } = useAuth();
  const { data: stats, isLoading } = useGetAdminStats({ query: { enabled: isAdmin, queryKey: getGetAdminStatsQueryKey() } });
  const [switching, setSwitching] = useState<string | null>(null);

  const handleSwitch = async (role: string) => {
    setSwitching(role);
    try {
      await switchRole(role);
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar rol");
    } finally {
      setSwitching(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-6 md:py-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[1,2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const completionRate = stats?.totalServices
    ? Math.round((stats.completedServices / stats.totalServices) * 100)
    : 0;

  return (
    <div className="container px-4 py-6 md:py-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Panel de Administración</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen general de la plataforma Fixgo</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10">
            <Activity className="w-3 h-3 mr-1" />
            Sistema activo
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-border/50 hover:border-primary/20 transition-all">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              {stats?.newUsersThisMonth ? (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">
                  +{stats.newUsersThisMonth}
                </Badge>
              ) : null}
            </div>
            <p className="text-2xl md:text-3xl font-bold text-foreground">{stats?.totalUsers.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de usuarios</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:border-primary/20 transition-all">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">{stats?.totalWorkers} total</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-foreground">{stats?.activeWorkers.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Profesionales activos</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:border-primary/20 transition-all">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-500/10 rounded-xl">
                <Briefcase className="w-5 h-5 text-purple-400" />
              </div>
              {stats?.newServicesThisMonth ? (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">
                  +{stats.newServicesThisMonth}
                </Badge>
              ) : null}
            </div>
            <p className="text-2xl md:text-3xl font-bold text-foreground">{stats?.totalServices.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de servicios</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:border-primary/20 transition-all">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Crown className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-primary">
              {stats?.totalWorkers.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Profesionales registrados</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Estado de Servicios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="text-sm">Pendientes</span>
                </div>
                <span className="text-sm font-bold text-blue-400">{stats?.pendingServices}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-sm">Completados</span>
                </div>
                <span className="text-sm font-bold text-green-400">{stats?.completedServices}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span className="text-sm">Total</span>
                </div>
                <span className="text-sm font-bold">{stats?.totalServices}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tasa de finalización</span>
                <span className="font-bold text-primary">{completionRate}%</span>
              </div>
              <div className="mt-2 w-full bg-secondary rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${completionRate}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Distribución de Usuarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Usuarios clientes</span>
                <span className="text-sm font-bold">{stats?.totalClients ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Profesionales registrados</span>
                <span className="text-sm font-bold text-primary">{stats?.totalWorkers ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Profesionales activos</span>
                <span className="text-sm font-bold text-green-400">{stats?.activeWorkers ?? 0}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-border/50">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Nuevos este mes</p>
                  <p className="text-lg font-bold text-green-400">+{stats?.newUsersThisMonth ?? 0}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Ver métricas SaaS</p>
                  <Link href="/admin/subscription-stats" className="text-xs font-bold text-primary hover:underline">
                    Ir →
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-primary/30 hover:bg-primary/5">
          <Link href="/admin/users">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-semibold text-sm">Usuarios</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Gestionar usuarios y roles</p>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-primary/30 hover:bg-primary/5">
          <Link href="/admin/categories">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Briefcase className="w-4 h-4 text-purple-400" />
              </div>
              <span className="font-semibold text-sm">Categorías</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Administrar categorías de servicios</p>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-primary/30 hover:bg-primary/5">
          <Link href="/admin/site-settings">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Globe className="w-4 h-4 text-primary" />
              </div>
              <span className="font-semibold text-sm">Sitio Web</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Editar contenido de la página</p>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-amber-500/30 hover:bg-amber-500/5">
          <Link href="/admin/kyc">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
              </div>
              <span className="font-semibold text-sm">Verificación KYC</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Revisar documentos de identidad</p>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-green-500/30 hover:bg-green-500/5">
          <Link href="/admin/security-selfies">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-green-400" />
              </div>
              <span className="font-semibold text-sm">Selfies de seguridad</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Revisar capturas y retenciones</p>
          </Link>
        </Button>

        <Button asChild variant="outline" className="h-auto p-4 flex-col items-start gap-2 border-border/50 hover:border-blue-500/30 hover:bg-blue-600/5">
          <Link href="/admin/plans">
            <div className="flex items-center gap-2 w-full">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-semibold text-sm">Planes</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-left">Editar planes y funcionalidades</p>
          </Link>
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Ver la app como otro rol
          </CardTitle>
          <p className="text-xs text-muted-foreground">Cambia temporalmente a usuario o Fixgo para probar la experiencia. Puedes volver a admin en cualquier momento.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-400"
              onClick={() => handleSwitch("client")}
              disabled={!!switching}
            >
              {switching === "client" ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              Ver como Usuario
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 border-primary/30 hover:bg-primary/10 hover:text-primary"
              onClick={() => handleSwitch("worker")}
              disabled={!!switching}
            >
              {switching === "worker" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hammer className="w-4 h-4" />}
              Ver como Fixgo
            </Button>
          </div>
        </CardContent>
      </Card>

      <AdminTicketWidget />
    </div>
  );
}
