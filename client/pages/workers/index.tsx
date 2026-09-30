import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetNearbyWorkers, useListCategories } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Search, ChevronRight, Filter, Map, List, Navigation, X } from "lucide-react";
import { ProBadge } from "@/components/pro-badge";
import { Link } from "wouter";
import { getCurrentPosition } from "@/lib/geolocation";

const WorkersMap = lazy(() => import("@/components/workers-map"));

export default function Workers() {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: user?.lat || -33.4489,
    lng: user?.lng || -70.6693,
  });

  useEffect(() => {
    getCurrentPosition()
      .then((pos) => setUserLocation({ lat: pos.lat, lng: pos.lng }))
      .catch(() => {});
  }, []);

  const { data: categories } = useListCategories();
  const { data: workersData, isLoading: workersLoading } = useGetNearbyWorkers({
    lat: userLocation.lat,
    lng: userLocation.lng,
    categoryId,
    radius: 50,
  }, { query: { staleTime: 2 * 60_000, gcTime: 10 * 60_000 } } as any);

  const allWorkers = Array.isArray(workersData) ? workersData : (workersData as any)?.users || [];

  const workers = searchQuery.trim()
    ? allWorkers.filter((w: any) => {
        const q = searchQuery.toLowerCase();
        return (
          w.name.toLowerCase().includes(q) ||
          (w.skills && w.skills.toLowerCase().includes(q))
        );
      })
    : allWorkers;

  return (
    <div className="container px-4 py-6 md:py-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold tracking-tight">Encontrar un Profesional</h1>
          <p className="text-muted-foreground mt-1">Busca trabajadores calificados cerca de tu ubicación.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:hidden">
          <div className="flex-1 flex items-center gap-2 bg-card border border-border/50 rounded-xl px-3 h-10">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Buscar profesionales..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={viewMode === "map" ? "default" : "outline"}
            size="icon"
            className="h-10 w-10 rounded-xl border-border/50"
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
          >
            {viewMode === "list" ? <Map className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-border/50" onClick={() => setShowMobileFilters(!showMobileFilters)}>
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {showMobileFilters && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide w-full md:hidden -mx-1 px-1 pb-0.5">
            <button
              onClick={() => setCategoryId(undefined)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!categoryId ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50 text-muted-foreground'}`}
            >
              Todas
            </button>
            {categories?.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50 text-muted-foreground'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div className="hidden md:flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o habilidad..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex bg-card border border-border/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="w-4 h-4" /> Lista
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Map className="w-4 h-4" /> Mapa
            </button>
          </div>
          <div className="w-52">
            <Select onValueChange={(val) => setCategoryId(val === "all" ? undefined : parseInt(val))}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Categorías</SelectItem>
                {categories?.map(cat => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {viewMode === "map" && (
        <div className="space-y-4">
          <Card className="border-border/50 overflow-hidden">
            <CardContent className="p-0">
              <Suspense fallback={<Skeleton className="h-[400px] md:h-[500px] w-full" />}>
                <WorkersMap
                  workers={workers}
                  userLat={userLocation.lat}
                  userLng={userLocation.lng}
                  onWorkerClick={(id) => window.location.href = `/workers/${id}`}
                  className="h-[400px] md:h-[500px] rounded-xl"
                />
              </Suspense>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary border-2 border-white" />
              <span>Tu ubicación</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#1a1a1a] border-2 border-primary" />
              <span>Disponible</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#1a1a1a] border-2 border-gray-500 opacity-70" />
              <span>Ocupado</span>
            </div>
          </div>

          {workers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {workers.length} profesional{workers.length !== 1 ? "es" : ""} en tu zona
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {workers.map((worker: any) => (
                  <Link key={worker.id} href={`/workers/${worker.id}`}>
                    <Card className="border-border/50 hover:border-primary/30 transition-all cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="w-10 h-10 border-2 border-primary/20 flex-shrink-0">
                          <AvatarImage src={worker.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">{worker.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm truncate">{worker.name}</h4>
                            <ProBadge planCode={worker.subscriptionPlan} />
                            {worker.isAvailable && <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 fill-primary text-primary" />
                              {worker.rating?.toFixed(1) || "Nuevo"}
                            </span>
                            {worker.distanceKm != null && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-0.5">
                                  <Navigation className="w-3 h-3" />
                                  {worker.distanceKm.toFixed(1)} km
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === "list" && (
        <>
          {workersLoading ? (
            <>
              <div className="hidden md:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="h-24 w-full rounded-none" />
                    <CardContent className="pt-0">
                      <div className="flex justify-center -mt-10 mb-4">
                        <Skeleton className="h-20 w-20 rounded-full border-4 border-background" />
                      </div>
                      <div className="space-y-2 flex flex-col items-center">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="md:hidden space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
              </div>
            </>
          ) : workers.length > 0 ? (
            <>
              <div className="hidden md:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {workers.map((worker: any) => (
                  <Card key={worker.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                    <div className="h-24 bg-gradient-to-br from-muted/60 to-muted/20 relative">
                      <Badge className="absolute top-3 right-3" variant={worker.isAvailable ? "default" : "secondary"}>
                        {worker.isAvailable ? "Disponible" : "Ocupado"}
                      </Badge>
                    </div>
                    <CardContent className="pt-0 flex-1 flex flex-col items-center text-center">
                      <Avatar className="w-20 h-20 border-4 border-background -mt-10 mb-3 bg-muted">
                        <AvatarImage src={worker.avatarUrl || undefined} />
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">{worker.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>

                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg leading-tight">{worker.name}</h3>
                        <ProBadge planCode={worker.subscriptionPlan} size="md" />
                      </div>

                      <div className="flex items-center gap-1 text-sm mt-1 mb-3">
                        <Star className="w-4 h-4 fill-blue-500 text-blue-500" />
                        <span className="font-medium">{worker.rating?.toFixed(1) || "Nuevo"}</span>
                        <span className="text-muted-foreground">({worker.totalReviews})</span>
                      </div>

                      {worker.distanceKm != null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                          <MapPin className="w-3 h-3" />
                          <span>A {worker.distanceKm.toFixed(1)} km</span>
                        </div>
                      )}

                      <div className="mt-auto pt-4 w-full">
                        <div className="flex flex-wrap justify-center gap-1 mb-4">
                          {worker.skills?.split(",").slice(0, 3).map((skill: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs font-normal px-2 py-0 h-5">
                              {skill.trim()}
                            </Badge>
                          ))}
                          {worker.skills && worker.skills.split(",").length > 3 && (
                            <Badge variant="outline" className="text-xs font-normal px-2 py-0 h-5">
                              +{worker.skills.split(",").length - 3}
                            </Badge>
                          )}
                        </div>

                        <Button asChild className="w-full" variant="outline">
                          <Link href={`/workers/${worker.id}`}>Ver Perfil</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="md:hidden space-y-0">
                {workers.map((worker: any) => (
                  <Link key={worker.id} href={`/workers/${worker.id}`} className="block">
                    <div className="indriver-card flex items-center gap-3 py-3.5 border-b border-border/30 cursor-pointer active:bg-card/80 transition-colors">
                      <Avatar className="w-12 h-12 border-2 border-primary/20 flex-shrink-0">
                        <AvatarImage src={worker.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{worker.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm text-foreground truncate">{worker.name}</h3>
                          <ProBadge planCode={worker.subscriptionPlan} />
                          {worker.isAvailable && (
                            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-0.5 text-xs">
                            <Star className="w-3 h-3 fill-primary text-primary" />
                            <span className="font-semibold text-foreground">{worker.rating?.toFixed(1) || "Nuevo"}</span>
                            <span className="text-muted-foreground">({worker.totalReviews})</span>
                          </span>
                          {worker.distanceKm != null && (
                            <>
                              <span className="text-muted-foreground text-xs">•</span>
                              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                {worker.distanceKm.toFixed(1)} km
                              </span>
                            </>
                          )}
                        </div>
                        {worker.skills && (
                          <div className="flex gap-1 mt-1.5">
                            {worker.skills.split(",").slice(0, 3).map((skill: string, i: number) => (
                              <span key={i} className="bg-secondary/80 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">
                                {skill.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-center bg-muted/30 rounded-xl border border-dashed">
              <div className="p-4 bg-background rounded-full shadow-sm mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No se encontraron profesionales</h3>
              <p className="text-muted-foreground max-w-md">
                {searchQuery
                  ? `No hay resultados para "${searchQuery}". Intenta con otro nombre o habilidad.`
                  : "No pudimos encontrar trabajadores disponibles que coincidan con tus criterios en esta zona."}
              </p>
              {searchQuery && (
                <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
                  Limpiar búsqueda
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
