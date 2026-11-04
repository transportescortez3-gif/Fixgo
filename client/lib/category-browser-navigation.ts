export function getCategoryBrowserServiceRequestUrl(
  categoryId: number,
  subcategoryId?: number,
): string {
  const params = new URLSearchParams();
  params.set("categoryId", String(categoryId));
  if (subcategoryId) params.set("subcategoryId", String(subcategoryId));
  return `/services/new?${params.toString()}`;
}

export function getCategoryBrowserReturnUrl(
  source: "categories" | "home",
  categoryId: number,
): string {
  const params = new URLSearchParams();
  params.set("categoryId", String(categoryId));
  if (source === "home") params.set("categoryBrowser", "1");
  const pathname = source === "categories" ? "/categories" : "/";
  return `${pathname}?${params.toString()}`;
}

export function getCategoryBrowserCategoryId(search: string): number | null {
  const categoryId = Number(new URLSearchParams(search).get("categoryId"));
  return Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null;
}

export function getCategoryBrowserSubcategoryId(search: string): number | null {
  const subcategoryId = Number(new URLSearchParams(search).get("subcategoryId"));
  return Number.isInteger(subcategoryId) && subcategoryId > 0 ? subcategoryId : null;
}

export function isCategoryBrowserConfirmation(search: string): boolean {
  return new URLSearchParams(search).get("step") === "confirm";
}

export function getCategoriesStepUrl(
  categoryId?: number | null,
  subcategoryId?: number | null,
  confirmation = false,
): string {
  const params = new URLSearchParams();
  if (categoryId) params.set("categoryId", String(categoryId));
  if (subcategoryId) params.set("subcategoryId", String(subcategoryId));
  if (confirmation) params.set("step", "confirm");
  const query = params.toString();
  return `/categories${query ? `?${query}` : ""}`;
}

export function isHomeCategoryBrowserLocation(search: string): boolean {
  return new URLSearchParams(search).get("categoryBrowser") === "1";
}
