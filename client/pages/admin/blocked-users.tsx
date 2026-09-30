import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ExternalLink, Lock, Unlock, UserRound, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface BlockedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  blockId: number;
  duration: string;
  durationLabel: string;
  blockedAt: string;
  blockedUntil: string | null;
  blockedByAdminId: number | null;
  blockedByAdminName: string | null;
}

const formatExactDate = (value: string | null) => (
  value ? format(new Date(value), "dd/MM/yyyy HH:mm:ss", { locale: es }) : "Sin fecha de término"
);

const roleLabels: Record<string, string> = {
  client: "Usuario",
  worker: "Fixgo",
};

export default function AdminBlockedUsers() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const loadBlockedUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
      const response = await fetch("/api/admin/blocked-users", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las cuentas bloqueadas");
      setUsers(body.users ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar las cuentas bloqueadas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBlockedUsers();
    const interval = window.setInterval(() => void loadBlockedUsers(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadBlockedUsers]);

  const handleUnblock = async (user: BlockedUser) => {
    setUnblockingId(user.id);
    try {
      const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
      const response = await fetch(`/api/admin/users/${user.id}/unblock`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo desbloquear la cuenta");
      setUsers((current) => current.filter((item) => item.id !== user.id));
      toast.success(`Cuenta de ${user.name} desbloqueada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo desbloquear la cuenta");
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 gap-1.5">
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4" /> Volver al panel
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Cuentas Bloqueadas</h1>
              <p className="text-sm text-muted-foreground">Solo se muestran cuentas con un bloqueo administrativo activo.</p>
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="w-fit gap-1.5 px-3 py-1.5">
          <Lock className="h-3.5 w-3.5" /> {users.length} activas
        </Badge>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-64 rounded-xl" />)}
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <UserRound className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No hay cuentas bloqueadas</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Las cuentas aparecerán aquí cuando un administrador aplique un bloqueo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((user) => (
            <Card key={user.blockId} className="overflow-hidden border-destructive/20">
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback>{user.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{user.name}</CardTitle>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant="destructive">{roleLabels[user.role] || user.role}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Tipo de bloqueo</dt>
                    <dd className="font-medium">{user.durationLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Bloqueado desde</dt>
                    <dd className="font-medium">{formatExactDate(user.blockedAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Término automático</dt>
                    <dd className="font-medium">{formatExactDate(user.blockedUntil)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link href={`/admin/users/${user.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Ver perfil
                    </Link>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void handleUnblock(user)}
                    disabled={unblockingId === user.id}
                  >
                    {unblockingId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                    Desbloquear ahora
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}