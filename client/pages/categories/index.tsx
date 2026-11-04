import { useLocation, useSearch } from "wouter";
import { useListCategories } from "@/api";
import { getCategoryStyle } from "@/lib/category-icons";
import {
  getCategoryBrowserCategoryId,
  getCategoryBrowserServiceRequestUrl,
  getCategoryBrowserSubcategoryId,
  getCategoriesStepUrl,
  isCategoryBrowserConfirmation,
} from "@/lib/category-browser-navigation";
import { getServiceRequestActionLabel } from "@/lib/service-selection";
import { AlertCircle, ChevronLeft, ChevronRight, LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function CategoriesPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const prefersReducedMotion = useReducedMotion();

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
  const selectedCategoryId = getCategoryBrowserCategoryId(search);
  const selectedSubcategoryId = getCategoryBrowserSubcategoryId(search);
  const selectedCategory = categoriesList.find((category: any) => category.id === selectedCategoryId) ?? null;
  const selectedSubcategory = selectedCategory?.subcategories?.find(
    (subcategory: any) => subcategory.id === selectedSubcategoryId,
  ) ?? null;
  const categoryHasSubs = !!selectedCategory && hasSubs(selectedCategory);
  const confirmationStep = !!selectedCategory && (
    !categoryHasSubs || (isCategoryBrowserConfirmation(search) && !!selectedSubcategory)
  );
  const specialtyStep = !!selectedCategory && categoryHasSubs && !confirmationStep;
  const currentStep = confirmationStep ? 3 : specialtyStep ? 2 : 1;
  const totalSteps = selectedCategory && !categoryHasSubs ? 2 : 3;

  const handleCategoryClick = (category: any) => {
    setLocation(getCategoriesStepUrl(category.id, null, !hasSubs(category)));
  };

  const handleSubcategoryClick = (subcategoryId: number) => {
    if (!selectedCategory) return;
    setLocation(getCategoriesStepUrl(selectedCategory.id, subcategoryId, true));
  };

  const handleBack = () => {
    if (confirmationStep && categoryHasSubs && selectedCategory) {
      setLocation(getCategoriesStepUrl(selectedCategory.id, selectedSubcategoryId), { replace: true });
      return;
    }
    setLocation(getCategoriesStepUrl(), { replace: true });
  };

  const handleRequest = () => {
    if (!selectedCategory || !confirmationStep) return;
    setLocation(getCategoryBrowserServiceRequestUrl(selectedCategory.id, selectedSubcategory?.id));
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-background">
      <div className="shrink-0 border-b border-border/40 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black tracking-tight text-foreground">
              {currentStep === 1 ? "¿Qué servicio necesitas?" : currentStep === 2 ? "Selecciona un servicio" : "Confirma tu servicio"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {currentStep === 1
                ? "Elige una categoría para continuar"
                : currentStep === 2
                  ? selectedCategory?.name
                  : "Revisa tu selección antes de pedir"}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Paso {currentStep} de {totalSteps}
          </span>
        </div>
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`categories-step-${currentStep}-${selectedCategory?.id ?? "all"}`}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -14 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
                aria-live="polite"
                className="px-3 pt-3 pb-5"
              >
                {currentStep === 1 ? (
                  <div className="space-y-6">
                    {groupedCategories.map((group) => (
                      <section key={`${group.name}-${group.sortOrder}`} className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2 px-1">
                          <h3 className="text-base font-black text-foreground">{group.name}</h3>
                          <span className="text-xs text-muted-foreground">{group.categories.length} categorías</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {group.categories.map((category: any) => {
                            const style = getCategoryStyle(category.icon);
                            const Icon = style.icon;
                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => handleCategoryClick(category)}
                                className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card p-4 text-center transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${style.bg} ${style.border}`}>
                                  <Icon className={`h-7 w-7 ${style.color}`} strokeWidth={1.6} aria-hidden="true" />
                                </span>
                                <span className="font-bold leading-snug text-foreground">{category.name}</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : currentStep === 2 && selectedCategory ? (
                  <div className="space-y-2">
                    {selectedCategory.subcategories.map((subcategory: any) => {
                      const isSelected = selectedSubcategoryId === subcategory.id;
                      return (
                        <button
                          key={subcategory.id}
                          type="button"
                          onClick={() => handleSubcategoryClick(subcategory.id)}
                          className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border/50 bg-card hover:border-primary/50 hover:bg-primary/5"
                          }`}
                        >
                          <span className="font-semibold leading-snug text-foreground">{subcategory.name}</span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : confirmationStep && selectedCategory ? (
                  <div className="mx-auto flex max-w-lg flex-col gap-5 pt-6">
                    <div className="rounded-3xl border border-primary/40 bg-card p-5 shadow-lg">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {selectedCategory.name}
                      </p>
                      <p className="mt-2 text-xl font-black text-foreground">
                        {selectedSubcategory?.name ?? selectedCategory.name}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Listo para continuar con tu solicitud.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRequest}
                      className="service-selection-cta min-h-14 w-full rounded-2xl fixgo-gradient px-5 text-base font-black text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {getServiceRequestActionLabel(selectedCategory.name, selectedSubcategory?.name)}
                    </button>
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
