import { useEffect, useRef, useState } from "react";
import { useListUsers, useUpdateUserStatus, ListUsersRole, ListUsersStatus, UpdateUserStatusBodyStatus } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey } from "@/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, Lock, Unlock } from "lucide-react";
import { Link, useLocation } from "wouter";
import { AdminBlockDialog, type AdminBlockTarget } from "@/components/admin-block-dialog";

function exportUsersToCSV(users: any[]) {
  const headers = ["ID", "Nombre", "Email", "RUT", "Rol", "Estado", "KYC", "Rating", "Reseñas", "Registro"];
  const rows = users.map((u) => [
    u.id,
    `"${(u.name ?? "").replace(/"/g, '""')}"`,
    u.email,
    u.rut ?? "",
    u.role,
    u.status,
    u.kycStatus,
    u.rating?.toFixed(2) ?? "0.00",
    u.totalReviews ?? 0,
    new Date(u.createdAt).toISOString().split("T")[0],
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `fixgo_usuarios_${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

const roleLabels: Record<string, string> = {
  client: "Usuario",
  worker: "Fixgo",
  admin: "Administrador",
};

const statusLabels: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [blockedUsersCount, setBlockedUsersCount] = useState<number | null>(null);
  const [blockedNoticeOpen, setBlockedNoticeOpen] = useState(false);
  const blockedNoticeShownRef = useRef(false);

  const queryParams = {
    ...(roleFilter !== "all" ? { role: roleFilter as ListUsersRole } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter as ListUsersStatus } : {}),
    limit: PAGE_SIZE,
    page,
  };

  const { data, isLoading } = useListUsers(queryParams);
  const users = Array.isArray(data) ? data : (data as any)?.users || [];
  const total = (data as any)?.total ?? users.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const updateStatusMutation = useUpdateUserStatus();
  const [blockTarget, setBlockTarget] = useState<AdminBlockTarget | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadBlockedUsersCount = async () => {
      try {
        const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
        const response = await fetch("/api/admin/blocked-users", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;

        const body = await response.json().catch(() => ({}));
        const count = Array.isArray(body.users) ? body.users.length : 0;
        if (cancelled) return;

        setBlockedUsersCount(count);
        if (count > 0 && !blockedNoticeShownRef.current) {
          blockedNoticeShownRef.current = true;
          setBlockedNoticeOpen(true);
        }
      } catch {
        // El aviso es complementario; un fallo no debe impedir gestionar Usuarios.
      }
    };

    void loadBlockedUsersCount();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFilterChange = (setter: (val: string) => void) => (val: string) => {
    setter(val);
    setPage(1);
  };

  const handleStatusChange = async (userId: number, newStatus: UpdateUserStatusBodyStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ 
        id: userId, 
        data: { status: newStatus } 
      });
      toast.success("Estado del usuario actualizado");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (e: any) {
      // Aunque falle, refresca la lista para reflejar el estado real del servidor
      // (otro admin pudo cambiarlo en paralelo).
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      const msg = e?.response?.data?.error || e?.message || "Error al actualizar el estado";
      toast.error(typeof msg === "string" ? msg.replace(/^HTTP \d+[^:]*:\s*/i, "") : "Error al actualizar el estado");
    }
  };

  const handleUnblock = async (userId: number) => {
    try {
      const token = localStorage.getItem("fixgo_token") || localStorage.getItem("fixxer_token");
      const response = await fetch(`/api/admin/users/${userId}/unblock`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo desbloquear la cuenta");
      toast.success("Cuenta desbloqueada");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo desbloquear la cuenta");
    }
  };

  const handleClearSuspension = async (userId: number) => {
    try {
      const token = localStorage.getItem("fixgo_token");
      const res = await fetch(`/api/users/${userId}/clear-suspension`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${res.status}`);
      }
      toast.success("Suspensión levantada");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (e: any) {
      toast.error(e?.message || "Error al quitar la suspensión");
    }
  };

  return (
    <div className="container px-4 py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground mt-1">Gestiona los usuarios de la plataforma y sus accesos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={roleFilter} onValueChange={handleFilterChange(setRoleFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Todos los Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Roles</SelectItem>
              <SelectItem value={ListUsersRole.client}>Usuarios</SelectItem>
              <SelectItem value={ListUsersRole.worker}>Fixgo</SelectItem>
              <SelectItem value={ListUsersRole.admin}>Administradores</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Todos los Estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Estados</SelectItem>
              <SelectItem value={ListUsersStatus.active}>Activos</SelectItem>
              <SelectItem value={ListUsersStatus.pending}>Pendientes</SelectItem>
              <SelectItem value={ListUsersStatus.blocked}>Bloqueados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportUsersToCSV(users)}
            disabled={isLoading || users.length === 0}
            className="gap-1.5 shrink-0"
          >
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No se encontraron usuarios con los criterios seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u: any) => (
                  <TableRow key={u.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link href={`/admin/users/${u.id}`}>
                        <div className="flex items-center gap-3 cursor-pointer">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={u.avatarUrl || undefined} />
                            <AvatarFallback>{u.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium hover:underline">{u.name}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground whitespace-nowrap">
                      {u.rut || "No registrado"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{roleLabels[u.role] || u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={u.status === 'active' ? 'default' : u.status === 'blocked' ? 'destructive' : 'secondary'} className={u.status === 'active' ? 'bg-green-500' : ''}>
                          {statusLabels[u.status] || u.status}
                        </Badge>
                        {u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now() && (
                          <Badge variant="destructive" className="bg-orange-500 text-white">
                            Suspendido hasta {format(new Date(u.suspendedUntil), "d MMM HH:mm", { locale: es })}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.createdAt), "d 'de' MMM, yyyy", { locale: es })}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now() && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs mb-1 ml-auto block"
                          onClick={() => handleClearSuspension(u.id)}
                        >
                          Quitar suspensión
                        </Button>
                      )}
                      {u.role !== 'admin' && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={u.status === "blocked" ? "outline" : "destructive"}
                            className="h-8 text-xs"
                            onClick={() => u.status === "blocked"
                              ? void handleUnblock(u.id)
                              : setBlockTarget({ id: u.id, name: u.name })}
                          >
                            {u.status === "blocked" ? (
                              <><Unlock className="w-3.5 h-3.5 mr-1" /> Desbloquear</>
                            ) : (
                              <><Lock className="w-3.5 h-3.5 mr-1" /> Bloquear</>
                            )}
                          </Button>
                          {u.status !== "blocked" && (
                            <Select
                              value={u.status}
                              onValueChange={(val: UpdateUserStatusBodyStatus) => handleStatusChange(u.id, val)}
                            >
                              <SelectTrigger className="w-[110px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UpdateUserStatusBodyStatus.active}>Activo</SelectItem>
                                <SelectItem value={UpdateUserStatusBodyStatus.pending}>Pendiente</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
            {total > 0 && <span className="ml-1">({total} usuarios)</span>}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="gap-1.5"
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <AdminBlockDialog
        target={blockTarget}
        open={!!blockTarget}
        onOpenChange={(open) => { if (!open) setBlockTarget(null); }}
        onSuccess={() => {
          setBlockTarget(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        }}
      />

      <Dialog open={blockedNoticeOpen} onOpenChange={setBlockedNoticeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" />
              Tienes {blockedUsersCount} usuarios bloqueados
            </DialogTitle>
            <DialogDescription>
              Puedes revisar sus bloqueos y desbloquear las cuentas directamente desde la lista de cuentas bloqueadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBlockedNoticeOpen(false)}>
              Ahora no
            </Button>
            <Button
              onClick={() => {
                setBlockedNoticeOpen(false);
                setLocation("/admin/blocked-users");
              }}
            >
              Ver cuentas bloqueadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
