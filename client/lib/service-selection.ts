export type ServiceSelectionStep = 1 | 2 | 3;

export interface ServiceSelection {
  categoryId: number | null;
  subcategoryId: number | null;
  step: ServiceSelectionStep;
}

export interface ServiceCategoryOption {
  id: number;
  subcategories?: unknown[] | null;
}

export interface ServiceRequestPrefill {
  categoryId: number | undefined;
  subcategoryId: number | undefined;
}

export interface ServiceRequestCategory extends ServiceCategoryOption {
  subcategories?: { id: number; name?: string }[] | null;
}

export const INITIAL_SERVICE_SELECTION: ServiceSelection = {
  categoryId: null,
  subcategoryId: null,
  step: 1,
};

export function getServiceRequestPrefill(search: string): ServiceRequestPrefill {
  const params = new URLSearchParams(search);
  const categoryParam = params.get("categoryId");
  const subcategoryParam = params.get("subcategoryId");

  return {
    categoryId: categoryParam ? Number.parseInt(categoryParam, 10) : undefined,
    subcategoryId: subcategoryParam ? Number.parseInt(subcategoryParam, 10) : undefined,
  };
}

export function findServiceRequestSubcategory(
  categories: ServiceRequestCategory[] | undefined,
  categoryId: number | undefined,
  subcategoryId: number | undefined,
): { id: number; name?: string } | null {
  if (!categories || categoryId === undefined || subcategoryId === undefined) return null;
  return categories
    .find((category) => category.id === categoryId)
    ?.subcategories
    ?.find((subcategory) => subcategory.id === subcategoryId) ?? null;
}

export function selectServiceCategory(category: ServiceCategoryOption): ServiceSelection {
  return {
    categoryId: category.id,
    subcategoryId: null,
    step: category.subcategories?.length ? 2 : 3,
  };
}

export function selectServiceSubcategory(
  selection: ServiceSelection,
  subcategoryId: number,
): ServiceSelection {
  return { ...selection, subcategoryId, step: 3 };
}

export function goBackFromServiceSelection(
  selection: ServiceSelection,
  categoryHasSubcategories: boolean,
): ServiceSelection {
  if (selection.step === 3 && categoryHasSubcategories) {
    return { ...selection, step: 2 };
  }
  return INITIAL_SERVICE_SELECTION;
}

export function getServiceRequestUrl(selection: ServiceSelection): string {
  const params = new URLSearchParams();
  if (selection.categoryId) params.set("categoryId", String(selection.categoryId));
  if (selection.subcategoryId) params.set("subcategoryId", String(selection.subcategoryId));
  const query = params.toString();
  return `/services/new${query ? `?${query}` : ""}`;
}
