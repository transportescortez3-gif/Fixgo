import { useState, useEffect } from "react";
import { useGetSiteSettings, useUpdateSiteSettings, getGetSiteSettingsQueryKey } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Globe, Type, BarChart3, MessageSquare, Megaphone, Loader2, Eye } from "lucide-react";
import { Link } from "wouter";

export default function AdminSiteSettings() {
  const { data: settings, isLoading } = useGetSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("hero");

  useEffect(() => {
    if (settings) {
      setForm(settings as Record<string, string>);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ data: form });
      queryClient.invalidateQueries({ queryKey: getGetSiteSettingsQueryKey() });
      toast.success("Configuración guardada correctamente");
    } catch {
      toast.error("Error al guardar la configuración");
    }
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-6 md:py-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container px-4 py-6 md:py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Globe className="w-7 h-7 text-primary" />
            Editor del Sitio Web
          </h1>
      <p className="text-sm text-muted-foreground mt-1">Edita el contenido de la página de inicio de Fixgo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10">
            <Link href="/">
              <Eye className="w-4 h-4 mr-2" />
              Ver página
            </Link>
          </Button>
      <Button onClick={handleSave} disabled={updateMutation.isPending} className="fixgo-gradient font-bold text-white">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full bg-secondary/50">
          <TabsTrigger value="hero" className="text-xs md:text-sm">
            <Type className="w-3.5 h-3.5 mr-1.5" />
            Hero
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs md:text-sm">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Estadísticas
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="text-xs md:text-sm">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Testimonios
          </TabsTrigger>
          <TabsTrigger value="cta" className="text-xs md:text-sm">
            <Megaphone className="w-3.5 h-3.5 mr-1.5" />
            CTA
          </TabsTrigger>
          <TabsTrigger value="professionals" className="text-xs md:text-sm">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Profesionales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hero" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="w-5 h-5 text-primary" />
                Sección Hero Principal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título principal</Label>
                  <Input
                    value={form.hero_title || ""}
                    onChange={e => handleChange("hero_title", e.target.value)}
                    placeholder="Servicios del hogar"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Texto destacado (segunda línea)</Label>
                  <Input
                    value={form.hero_highlight || ""}
                    onChange={e => handleChange("hero_highlight", e.target.value)}
                    placeholder="a un toque de distancia."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={form.hero_description || ""}
                  onChange={e => handleChange("hero_description", e.target.value)}
                  rows={3}
                  placeholder="Conectamos a los mejores profesionales..."
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Botón principal (CTA)</Label>
                  <Input
                    value={form.hero_cta_primary || ""}
                    onChange={e => handleChange("hero_cta_primary", e.target.value)}
                    placeholder="Necesito un Profesional"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Botón secundario</Label>
                  <Input
                    value={form.hero_cta_secondary || ""}
                    onChange={e => handleChange("hero_cta_secondary", e.target.value)}
                    placeholder="Quiero ser Profesional"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Estadísticas de la Plataforma
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { key: "stats_services", labelKey: "stats_services_label", title: "Servicios" },
                { key: "stats_professionals", labelKey: "stats_professionals_label", title: "Profesionales" },
                { key: "stats_rating", labelKey: "stats_rating_label", title: "Calificación" },
                { key: "stats_response", labelKey: "stats_response_label", title: "Tiempo de respuesta" },
              ].map(({ key, labelKey, title }) => (
                <div key={key} className="grid md:grid-cols-2 gap-4 pb-4 border-b border-border/30 last:border-0">
                  <div className="space-y-2">
                    <Label>{title} — Valor</Label>
                    <Input
                      value={form[key] || ""}
                      onChange={e => handleChange(key, e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{title} — Etiqueta</Label>
                    <Input
                      value={form[labelKey] || ""}
                      onChange={e => handleChange(labelKey, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testimonials" className="space-y-4 mt-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Testimonio {i}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input
                      value={form[`testimonial_${i}_name`] || ""}
                      onChange={e => handleChange(`testimonial_${i}_name`, e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rol</Label>
                    <Input
                      value={form[`testimonial_${i}_role`] || ""}
                      onChange={e => handleChange(`testimonial_${i}_role`, e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Calificación (1-5)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={form[`testimonial_${i}_rating`] || "5"}
                      onChange={e => handleChange(`testimonial_${i}_rating`, e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Testimonio</Label>
                  <Textarea
                    value={form[`testimonial_${i}_text`] || ""}
                    onChange={e => handleChange(`testimonial_${i}_text`, e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cta" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                Llamada a la Acción (CTA Final)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título del CTA</Label>
                <Input
                  value={form.cta_title || ""}
                  onChange={e => handleChange("cta_title", e.target.value)}
                  placeholder="¿Listo para resolver tu problema?"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción del CTA</Label>
                <Textarea
                  value={form.cta_description || ""}
                  onChange={e => handleChange("cta_description", e.target.value)}
                  rows={2}
                  placeholder="Únete a miles de personas..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="professionals" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Sección para Profesionales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Textarea
                  value={form.pro_title || ""}
                  onChange={e => handleChange("pro_title", e.target.value)}
                  rows={2}
                  placeholder="¿Eres profesional? Únete a Fixgo"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={form.pro_description || ""}
                  onChange={e => handleChange("pro_description", e.target.value)}
                  rows={3}
                  placeholder="Accede a cientos de clientes nuevos..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-4 border-t border-border/30">
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="fixgo-gradient font-bold text-white px-8">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Todos los Cambios
        </Button>
      </div>
    </div>
  );
}
