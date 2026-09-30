import { useEffect, useState } from "react";
import { useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, getListCategoriesQueryKey } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Edit, Trash2, ChevronDown, ChevronUp, Tag, Layers, ArrowUp, ArrowDown } from "lucide-react";

const categorySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  description: z.string().optional(),
  icon: z.string().optional(),
  groupName: z.string().optional(),
  groupId: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().default(99),
  isActive: z.boolean().default(true),
  platform: z.enum(["expertos", "fletes"]).default("expertos"),
});
type CategoryForm = z.infer<typeof categorySchema>;

const subcategorySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().default(99),
});
type SubcategoryForm = z.infer<typeof subcategorySchema>;

function getToken() {
  return localStorage.getItem("fixgo_token") || "";
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function SubcategoryRow({ sub, onUpdated }: { sub: any; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<SubcategoryForm>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: { name: sub.name, isActive: sub.isActive, sortOrder: sub.sortOrder },
  });

  const updateMutation = useMutation({
    mutationFn: (data: SubcategoryForm) =>
      apiFetch(`/api/subcategories/${sub.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Especialidad actualizada"); setEditing(false); onUpdated(); },
    onError: (e: any) => toast.error(e.message || "Error al actualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/subcategories/${sub.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Especialidad eliminada"); onUpdated(); },
    onError: (e: any) => toast.error(e.message || "Error al eliminar"),
  });

  if (editing) {
    return (
      <form
        onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
        className="flex items-center gap-2 py-1.5 px-2 bg-muted/20 rounded-lg"
      >
        <Input
          {...register("name")}
          className="h-7 text-xs flex-1"
          autoFocus
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
          <Switch
            checked={watch("isActive")}
            onCheckedChange={(v) => setValue("isActive", v)}
            className="scale-75"
          />
          <span>Activa</span>
        </div>
        <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/20 group">
      <div className="flex items-center gap-2">
        <Tag className="w-3 h-3 text-muted-foreground/60" />
        <span className={`text-sm ${!sub.isActive ? "line-through text-muted-foreground" : ""}`}>{sub.name}</span>
        {!sub.isActive && <Badge variant="secondary" className="text-xs py-0 h-4">Inactiva</Badge>}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
          <Edit className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => { if (confirm(`¿Eliminar "${sub.name}"?`)) deleteMutation.mutate(); }}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function SubcategoriesPanel({ cat, onUpdated }: { cat: any; onUpdated: () => void }) {
  const [addingNew, setAddingNew] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<SubcategoryForm>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: { name: "", isActive: true, sortOrder: 99 },
  });

  const createMutation = useMutation({
    mutationFn: (data: SubcategoryForm) =>
      apiFetch(`/api/categories/${cat.id}/subcategories`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success("Especialidad creada");
      reset({ name: "", isActive: true, sortOrder: 99 });
      setAddingNew(false);
      onUpdated();
    },
    onError: (e: any) => toast.error(e.message || "Error al crear"),
  });

  const subs: any[] = cat.subcategories || [];

  return (
    <div className="mt-3 border-t border-border/30 pt-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Especialidades ({subs.length})
      </p>

      {subs.length === 0 && !addingNew && (
        <p className="text-xs text-muted-foreground/60 py-1 px-2">Sin especialidades aún</p>
      )}

      {subs.map((s) => (
        <SubcategoryRow key={s.id} sub={s} onUpdated={onUpdated} />
      ))}

      {addingNew ? (
        <form
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="flex items-center gap-2 py-1.5 px-2 bg-primary/5 rounded-lg border border-primary/20 mt-2"
        >
          <Input
            {...register("name")}
            placeholder="Nombre de la especialidad..."
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Switch
              checked={watch("isActive")}
              onCheckedChange={(v) => setValue("isActive", v)}
              className="scale-75"
            />
            <span>Activa</span>
          </div>
          <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Agregar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAddingNew(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1 px-2 mt-1"
        >
          <Plus className="w-3 h-3" />
          Agregar especialidad
        </button>
      )}
    </div>
  );
}

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useListCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState({ name: "", icon: "layers", color: "#5b7fff", sortOrder: 99, isActive: true });
  const [groupBusy, setGroupBusy] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { isActive: true, platform: "expertos", groupName: "", groupId: null, sortOrder: 99 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  const loadGroups = async () => {
    const res = await fetch("/api/admin/category-groups", { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error("No se pudieron cargar los grupos");
    setGroups(await res.json());
  };

  useEffect(() => {
    loadGroups().catch((e) => toast.error(e.message));
  }, []);

  const openGroupCreate = () => {
    setEditingGroupId(null);
    setGroupDraft({ name: "", icon: "layers", color: "#5b7fff", sortOrder: groups.length + 1, isActive: true });
    setGroupDialogOpen(true);
  };

  const openGroupEdit = (group: any) => {
    setEditingGroupId(group.id);
    setGroupDraft({ name: group.name, icon: group.icon, color: group.color, sortOrder: group.sortOrder, isActive: group.isActive });
    setGroupDialogOpen(true);
  };

  const saveGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    setGroupBusy(true);
    try {
      const res = await fetch(editingGroupId ? `/api/admin/category-groups/${editingGroupId}` : "/api/admin/category-groups", {
        method: editingGroupId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(groupDraft),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al guardar el grupo");
      toast.success(editingGroupId ? "Grupo actualizado" : "Grupo creado");
      setGroupDialogOpen(false);
      await loadGroups();
      invalidate();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar el grupo");
    } finally {
      setGroupBusy(false);
    }
  };

  const deleteGroup = async (group: any) => {
    if (!confirm(`¿Eliminar el grupo "${group.name}"? Las categorías deben reasignarse primero.`)) return;
    try {
      const res = await fetch(`/api/admin/category-groups/${group.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al eliminar el grupo");
      toast.success("Grupo eliminado");
      await loadGroups();
      invalidate();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar el grupo");
    }
  };

  const moveGroup = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    const next = [...groups];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setGroups(next);
    try {
      const res = await fetch("/api/admin/category-groups/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ids: next.map((group) => group.id) }),
      });
      if (!res.ok) throw new Error();
      await loadGroups();
      invalidate();
    } catch {
      toast.error("No se pudo reordenar los grupos");
      await loadGroups();
    }
  };

  const onAddSubmit = async (data: CategoryForm) => {
    try {
      await createMutation.mutateAsync({ data: data as any });
      toast.success("Categoría creada");
      invalidate();
      setIsAddOpen(false);
       reset({ isActive: true, platform: "expertos", groupId: null, sortOrder: 99 });
    } catch (e: any) {
      toast.error(e?.message || "Error al crear la categoría");
    }
  };

  const onEditSubmit = async (data: CategoryForm) => {
    if (!editingId) return;
    try {
      await updateMutation.mutateAsync({ id: editingId, data: data as any });
      toast.success("Categoría actualizada");
      invalidate();
      setEditingId(null);
       reset({ isActive: true, platform: "expertos", groupId: null, sortOrder: 99 });
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar la categoría");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta categoría y todas sus especialidades?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Categoría eliminada");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar la categoría");
    }
  };

  const openEdit = (cat: any) => {
    setEditingId(cat.id);
    reset({
      name: cat.name,
      description: cat.description || "",
      icon: cat.icon || "",
      groupName: cat.groupName || "",
      groupId: cat.groupId ?? cat.group?.id ?? null,
      sortOrder: cat.sortOrder ?? 99,
      isActive: cat.isActive,
      platform: (cat.platform as "expertos" | "fletes") || "expertos",
    });
  };

  const platformBadge = (platform: string) =>
    platform === "fletes"
      ? <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-400 bg-blue-500/10">Fletes</Badge>
      : <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Expertos</Badge>;

  const CategoryFormFields = ({ prefix = "" }: { prefix?: string }) => (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}name`}>Nombre</Label>
        <Input id={`${prefix}name`} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}description`}>Descripción</Label>
        <Textarea id={`${prefix}description`} {...register("description")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}icon`}>Identificador de Icono (opcional)</Label>
        <Input id={`${prefix}icon`} {...register("icon")} placeholder="ej: wrench, home, truck..." />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}groupId`}>Grupo / Rubro</Label>
        <Select
          value={watch("groupId") ? String(watch("groupId")) : "none"}
          onValueChange={(value) => setValue("groupId", value === "none" ? null : Number(value))}
        >
          <SelectTrigger id={`${prefix}groupId`}><SelectValue placeholder="Seleccionar grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin grupo</SelectItem>
            {groups.filter((group) => group.isActive).map((group) => (
              <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">El grupo se administra desde la sección Rubros.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}sortOrder`}>Orden de la categoría</Label>
        <Input id={`${prefix}sortOrder`} type="number" min="0" {...register("sortOrder")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}platform`}>Plataforma</Label>
        <Select
          value={watch("platform")}
          onValueChange={(v) => setValue("platform", v as "expertos" | "fletes")}
        >
          <SelectTrigger id={`${prefix}platform`}>
            <SelectValue placeholder="Seleccionar plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expertos">FIXGO Expertos</SelectItem>
            <SelectItem value="fletes">FIXGO Fletes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${prefix}isActive`}>Activa</Label>
        <Switch
          id={`${prefix}isActive`}
          checked={watch("isActive")}
          onCheckedChange={(val) => setValue("isActive", val)}
        />
      </div>
    </>
  );

  return (
    <div className="container px-4 py-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categorías</h1>
          <p className="text-muted-foreground mt-1">Gestiona categorías y sus especialidades.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) reset({ isActive: true, platform: "expertos", groupId: null, sortOrder: 99 }); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Agregar Categoría</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
            <DialogHeader>
              <DialogTitle>Agregar Categoría</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
              <CategoryFormFields prefix="add-" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary" /> Rubros / Grupos</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Ordena y administra los grupos que se muestran en Cliente y Mis Profesiones.</p>
          </div>
          <Button onClick={openGroupCreate}><Plus className="w-4 h-4 mr-2" /> Nuevo grupo</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.map((group, index) => (
            <div key={group.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/10 px-3 py-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${group.color}22`, color: group.color }}>
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.categoryCount ?? 0} categorías · orden {index + 1}</p>
              </div>
              {!group.isActive && <Badge variant="secondary">Inactivo</Badge>}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveGroup(index, -1)} disabled={index === 0} aria-label="Subir grupo"><ArrowUp className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveGroup(index, 1)} disabled={index === groups.length - 1} aria-label="Bajar grupo"><ArrowDown className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openGroupEdit(group)} aria-label="Editar grupo"><Edit className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteGroup(group)} aria-label="Eliminar grupo"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader><DialogTitle>{editingGroupId ? "Editar grupo" : "Crear grupo"}</DialogTitle></DialogHeader>
          <form onSubmit={saveGroup} className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Ícono</Label><Input value={groupDraft.icon} onChange={(e) => setGroupDraft({ ...groupDraft, icon: e.target.value })} placeholder="layers, wrench..." /></div>
              <div className="space-y-2"><Label>Color</Label><Input type="color" value={groupDraft.color} onChange={(e) => setGroupDraft({ ...groupDraft, color: e.target.value })} className="h-10 p-1" /></div>
            </div>
            <div className="space-y-2"><Label>Orden</Label><Input type="number" min="0" value={groupDraft.sortOrder} onChange={(e) => setGroupDraft({ ...groupDraft, sortOrder: Number(e.target.value) })} /></div>
            <div className="flex items-center justify-between"><Label>Activo</Label><Switch checked={groupDraft.isActive} onCheckedChange={(isActive) => setGroupDraft({ ...groupDraft, isActive })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={groupBusy}>{groupBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(open) => { if (!open) { setEditingId(null); reset({ isActive: true, platform: "expertos", groupId: null, sortOrder: 99 }); } }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
            <CategoryFormFields prefix="edit-" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Actualizar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid sm:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="h-32 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></CardContent></Card>
            ))
          : (categories as any[])?.map((cat) => (
              <Card key={cat.id} className={`transition-all ${!cat.isActive ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base leading-tight">{cat.name}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      {platformBadge(cat.platform)}
                      {!cat.isActive && <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1 -mt-1 -mr-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(cat.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {cat.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{cat.description}</p>
                  )}

                  <button
                    onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedId === cat.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>
                      {(cat.subcategories?.length || 0)} especialidad{(cat.subcategories?.length || 0) !== 1 ? "es" : ""}
                    </span>
                  </button>

                  {expandedId === cat.id && (
                    <SubcategoriesPanel
                      cat={cat}
                      onUpdated={invalidate}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
