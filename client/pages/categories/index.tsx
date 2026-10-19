import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useListCategories } from "@/api";
import { getCategoryStyle } from "@/lib/category-icons";
import {
  getCategoryBrowserCategoryId,
  getCategoryBrowserReturnUrl,
  getCategoryBrowserServiceRequestUrl,
} from "@/lib/category-browser-navigation";
import { AlertCircle, ChevronRight, LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function CategoriesPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [expandedId, setExpandedId] = useState<number | null>(() => getCategoryBrowserCategoryId(search));
  const subsRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExpandedId(getCategoryBrowserCategoryId(search));
  }, [search]);

  useEffect(() => {
    if (expandedId == null) return;
    const timer = setTimeout(() => {
      subsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
    return () => clearTimeout(timer);
  }, [expandedId]);

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useListCategories({ query: { staleTime: 30 * 60_000 } } as any);
  const categoriesList: any[] = Array.isArray(categories) ? categories : [];
  const groupedCategories = (() => {
    const groups = new Map<string, { name: string; sortOrder: number; categories: any[] }>();
    for (const cat of categoriesList) {
      const group = cat.group;
      const name = group?.name || cat.groupName || "Otros Servicios";
      const sortOrder = Number(group?.sortOrder ?? 99);
      const key = group?.id ? String(group.id) : name.toLowerCase();
      if (!groups.has(key)) groups.set(key, { name, sortOrder, categories: [] });
      groups.get(key)!.categories.push(cat);
    }
    return [...groups.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(group => ({ ...group, categories: group.categories.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.id - b.id) }));
  })();

  const hasSubs = (cat: any) => Array.isArray(cat.subcategories) && cat.subcategories.length > 0;
  const expandedCat = categoriesList.find((c: any) => c.id === expandedId) ?? null;

  const handleCategoryClick = (cat: any) => {
    if (expandedId === cat.id) {
      setExpandedId(null);
      setLocation("/categories", { replace: true });
      return;
    }
    if (!hasSubs(cat)) {
      setExpandedId(cat.id);
      setLocation(getCategoryBrowserReturnUrl("categories", cat.id), { replace: true });
      setLocation(getCategoryBrowserServiceRequestUrl(cat.id));
      return;
    }
    setExpandedId(cat.id);
    setLocation(getCategoryBrowserReturnUrl("categories", cat.id), { replace: true });
  };

  const handleSubcategoryClick = (categoryId: number, subcategoryId: number) => {
    setLocation(getCategoryBrowserServiceRequestUrl(categoryId, subcategoryId));
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-background">
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-border/40">
        <h2 className="text-2xl font-black text-foreground tracking-tight">¿Qué necesitas?</h2>
        <p className="text-base text-muted-foreground mt-0.5">Toca una categoría para ver sus especialidades</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categoriesLoading ? (
          <div role="status" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">Cargando categorías…</p>
          </div>
        ) : categoriesError && categoriesList.length === 0 ? (
          <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-bold text-foreground">No pudimos cargar las categorías</p>
              <p className="mt-1 text-sm text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</p>
            </div>
            <button
              type="button"
              onClick={() => { void refetchCategories(); }}
              disabled={categoriesFetching}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${categoriesFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Reintentar
            </button>
          </div>
        ) : categoriesList.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-bold text-foreground">Aún no hay categorías disponibles</p>
              <p className="mt-1 text-sm text-muted-foreground">Vuelve más tarde para explorar los servicios.</p>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              Volver al inicio
            </button>
          </div>
        ) : (
          <>
            {categoriesError && (
              <div role="status" className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm text-foreground">No se pudieron actualizar las categorías. Mostramos las disponibles.</p>
                <button
                  type="button"
                  onClick={() => { void refetchCategories(); }}
                  disabled={categoriesFetching}
                  className="shrink-0 text-sm font-bold text-primary disabled:opacity-60"
                >
                  Reintentar
                </button>
              </div>
            )}
            <div className="px-3 pt-3 pb-1">
              <div className="space-y-6">
                {groupedCategories.map((group) => (
              <section key={`${group.name}-${group.sortOrder}`} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h3 className="text-base font-black text-foreground">{group.name}</h3>
                  <span className="text-xs text-muted-foreground">{group.categories.length} categorías</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {group.categories.map((cat: any) => {
              const style = getCategoryStyle(cat.icon);
              const CatIcon = style.icon;
              const isExpanded = expandedId === cat.id;
              const catHasSubs = hasSubs(cat);

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className={`relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all active:scale-[0.97] ${
                    isExpanded
                      ? "border-primary bg-primary/10 shadow-md"
                      : "border-border/50 bg-card hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${style.bg} border-2 ${style.border} shadow-sm`}>
                    <CatIcon className={`w-8 h-8 ${style.color}`} strokeWidth={1.5} />
                  </div>
                  <span className="text-center font-bold leading-snug" style={{ fontSize: 18 }}>
                    {cat.name}
                  </span>
                  {catHasSubs && (
                    <div className={`absolute bottom-3 right-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
              );
                  })}
                </div>
              </section>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {expandedCat && hasSubs(expandedCat) && (
                <motion.div
                  ref={subsRef}
                  key={`subs-${expandedCat.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden mx-3 mt-2 mb-3"
                >
                  <div className="rounded-2xl border-2 border-primary bg-primary/5">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-primary/20">
                      {(() => {
                        const style = getCategoryStyle(expandedCat.icon);
                        const Icon = style.icon;
                        return (
                          <>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg} border ${style.border}`}>
                              <Icon className={`w-4 h-4 ${style.color}`} strokeWidth={1.6} />
                            </div>
                            <span className="font-black text-foreground" style={{ fontSize: 17 }}>
                              {expandedCat.name}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground font-medium">
                              {expandedCat.subcategories.length} especialidades
                            </span>
                          </>
                        );
                      })()}
                    </div>
                    <div className="p-2 space-y-1.5">
                      {expandedCat.subcategories.map((sub: any) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSubcategoryClick(expandedCat.id, sub.id)}
                          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-background hover:bg-primary/10 border border-border/40 hover:border-primary/40 transition-all active:scale-[0.98] text-left"
                        >
                          <span className="font-semibold text-foreground leading-snug pr-2" style={{ fontSize: 18 }}>
                            {sub.name}
                          </span>
                          <ChevronRight className="w-5 h-5 text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
