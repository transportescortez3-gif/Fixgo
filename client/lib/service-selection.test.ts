import assert from "node:assert/strict";
import {
  getServiceRequestUrl,
  getServiceRequestPrefill,
  findServiceRequestSubcategory,
  goBackFromServiceSelection,
  INITIAL_SERVICE_SELECTION,
  selectServiceCategory,
  selectServiceSubcategory,
} from "./service-selection";

const plumbing = {
  id: 12,
  subcategories: [
    { id: 121, name: "Reparación de tuberías" },
    { id: 122, name: "Destape" },
  ],
};

// Category -> specialty -> confirmation keeps the selected IDs for the CTA.
const categoryStep = selectServiceCategory(plumbing);
assert.deepEqual(categoryStep, {
  categoryId: 12,
  subcategoryId: null,
  step: 2,
});

const confirmationStep = selectServiceSubcategory(categoryStep, 121);
assert.deepEqual(confirmationStep, {
  categoryId: 12,
  subcategoryId: 121,
  step: 3,
});
assert.equal(
  getServiceRequestUrl(confirmationStep),
  "/services/new?categoryId=12&subcategoryId=121",
);

// ClientHome's category -> specialty route initializes both form IDs. The
// selected specialty remains identifiable before and after categories load.
const clientHomeParams = new URLSearchParams();
clientHomeParams.set("categoryId", String(confirmationStep.categoryId));
if (confirmationStep.subcategoryId) {
  clientHomeParams.set("subcategoryId", String(confirmationStep.subcategoryId));
}
const clientHomeRoute = `/services/new?${clientHomeParams.toString()}`;
const formPrefill = getServiceRequestPrefill(new URL(clientHomeRoute, "https://fixgo.example").search);
assert.deepEqual(formPrefill, { categoryId: 12, subcategoryId: 121 });
assert.equal(findServiceRequestSubcategory(undefined, formPrefill.categoryId, formPrefill.subcategoryId), null);
const loadedCategories = [{ ...plumbing, name: "Gasfitería" }];
assert.deepEqual(
  findServiceRequestSubcategory(loadedCategories, formPrefill.categoryId, formPrefill.subcategoryId),
  { id: 121, name: "Reparación de tuberías" },
);

// Going back from confirmation returns to specialties without losing selection.
const backToSpecialties = goBackFromServiceSelection(confirmationStep, true);
assert.deepEqual(backToSpecialties, {
  categoryId: 12,
  subcategoryId: 121,
  step: 2,
});

// Going back again returns to categories and clears the previous choice.
const backToCategories = goBackFromServiceSelection(backToSpecialties, true);
assert.deepEqual(backToCategories, INITIAL_SERVICE_SELECTION);

// A category without specialties goes directly to confirmation and only sends
// its category ID. Back from that confirmation returns to categories.
const painting = selectServiceCategory({ id: 24, subcategories: [] });
assert.deepEqual(painting, {
  categoryId: 24,
  subcategoryId: null,
  step: 3,
});
assert.equal(getServiceRequestUrl(painting), "/services/new?categoryId=24");
assert.deepEqual(goBackFromServiceSelection(painting, false), INITIAL_SERVICE_SELECTION);

// Selecting another category after backing out must not reuse the old specialty.
const newSelection = selectServiceCategory({ id: 35, subcategories: [{ id: 351 }] });
assert.deepEqual(newSelection, {
  categoryId: 35,
  subcategoryId: null,
  step: 2,
});
assert.equal(
  getServiceRequestUrl(selectServiceSubcategory(newSelection, 351)),
  "/services/new?categoryId=35&subcategoryId=351",
);

console.log("client service selection regression checks passed");
