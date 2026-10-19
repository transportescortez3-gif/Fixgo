import assert from "node:assert/strict";
import { memoryLocation } from "wouter/memory-location";
import {
  getCategoryBrowserCategoryId,
  getCategoryBrowserReturnUrl,
  getCategoryBrowserServiceRequestUrl,
  isHomeCategoryBrowserLocation,
} from "./category-browser-navigation";

const categoryOnlyUrl = getCategoryBrowserServiceRequestUrl(24);
assert.equal(categoryOnlyUrl, "/services/new?categoryId=24");
assert.deepEqual(
  Object.fromEntries(new URL(categoryOnlyUrl, "https://fixgo.example").searchParams),
  { categoryId: "24" },
);

const categoryAndSubcategoryUrl = getCategoryBrowserServiceRequestUrl(12, 121);
assert.equal(
  categoryAndSubcategoryUrl,
  "/services/new?categoryId=12&subcategoryId=121",
);
assert.deepEqual(
  Object.fromEntries(new URL(categoryAndSubcategoryUrl, "https://fixgo.example").searchParams),
  { categoryId: "12", subcategoryId: "121" },
);

const categoriesReturnUrl = getCategoryBrowserReturnUrl("categories", 12);
assert.equal(categoriesReturnUrl, "/categories?categoryId=12");
assert.equal(getCategoryBrowserCategoryId("?categoryId=12"), 12);
assert.equal(getCategoryBrowserCategoryId("?categoryId=0"), null);

const homeReturnUrl = getCategoryBrowserReturnUrl("home", 35);
assert.equal(homeReturnUrl, "/?categoryId=35&categoryBrowser=1");
assert.equal(isHomeCategoryBrowserLocation("?categoryId=35&categoryBrowser=1"), true);
assert.equal(isHomeCategoryBrowserLocation("?categoryId=35"), false);

const nextCategoryRequestUrl = getCategoryBrowserServiceRequestUrl(35);
assert.equal(nextCategoryRequestUrl, "/services/new?categoryId=35");
assert.equal(new URL(nextCategoryRequestUrl, "https://fixgo.example").searchParams.has("subcategoryId"), false);

for (const [source, categoryId, serviceUrl] of [
  ["categories", 12, categoryAndSubcategoryUrl],
  ["home", 35, nextCategoryRequestUrl],
] as const) {
  const returnUrl = getCategoryBrowserReturnUrl(source, categoryId);
  const browserHistory = memoryLocation({ path: source === "categories" ? "/categories" : "/", record: true });
  browserHistory.navigate(returnUrl, { replace: true });
  browserHistory.navigate(serviceUrl);
  assert.equal(browserHistory.history.at(-2), returnUrl);

  // Returning to the previous browser entry restores the category context.
  browserHistory.history.pop();
  browserHistory.navigate(returnUrl, { replace: true });
  assert.equal(
    getCategoryBrowserCategoryId(browserHistory.history.at(-1)!.split("?")[1] ?? ""),
    categoryId,
  );
  if (source === "home") {
    assert.equal(isHomeCategoryBrowserLocation(browserHistory.history.at(-1)!.split("?")[1] ?? ""), true);
  }
}

console.log("category browser navigation regression checks passed");
