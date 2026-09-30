import { Router } from "express";
import { db, categoriesTable, categoryGroupsTable, subcategoriesTable } from "../db";
import { asc, eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";
import {
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
  CreateSubcategoryBody,
  CreateSubcategoryParams,
  UpdateSubcategoryParams,
  UpdateSubcategoryBody,
  DeleteSubcategoryParams,
} from "../zod";

const router = Router();

let categoriesCache: { data: unknown; updatedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateCategoriesCache() {
  categoriesCache = null;
}

export async function fetchCategories() {
  const now = Date.now();
  if (categoriesCache && now - categoriesCache.updatedAt < CACHE_TTL_MS) {
    return categoriesCache.data;
  }

  const [categoryRows, subcategories] = await Promise.all([
    db.select({ category: categoriesTable, group: categoryGroupsTable })
      .from(categoriesTable)
      .leftJoin(categoryGroupsTable, eq(categoriesTable.groupId, categoryGroupsTable.id))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id)),
    db.select().from(subcategoriesTable).orderBy(subcategoriesTable.categoryId, subcategoriesTable.sortOrder),
  ]);

  const result = categoryRows.map(({ category: cat, group }) => ({
    ...cat,
    groupName: group?.name ?? cat.groupName,
    group: group ?? null,
    subcategories: subcategories.filter((s) => s.categoryId === cat.id),
  }));

  categoriesCache = { data: result, updatedAt: now };
  return result;
}

router.get("/categories", async (_req, res): Promise<void> => {
  const data = await fetchCategories();
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
  res.json(data);
});

router.get("/categories/:id/subcategories", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid category id" });
    return;
  }
  const subs = await db.select().from(subcategoriesTable)
    .where(eq(subcategoriesTable.categoryId, id))
    .orderBy(subcategoriesTable.sortOrder);
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
  res.json(subs);
});

router.post("/categories", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let groupName: string | undefined;
  if (parsed.data.groupId) {
    const [group] = await db.select().from(categoryGroupsTable).where(eq(categoryGroupsTable.id, parsed.data.groupId)).limit(1);
    if (!group) {
      res.status(400).json({ error: "El grupo seleccionado no existe" });
      return;
    }
    groupName = group.name;
  }

  const [category] = await db.insert(categoriesTable).values({
    name: parsed.data.name,
    description: parsed.data.description ?? undefined,
    icon: parsed.data.icon ?? undefined,
    groupId: parsed.data.groupId ?? undefined,
    groupName,
    sortOrder: parsed.data.sortOrder ?? 99,
    isActive: parsed.data.isActive ?? true,
    platform: parsed.data.platform ?? "expertos",
  }).returning();

  invalidateCategoriesCache();
  res.status(201).json(category);
});

router.patch("/categories/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.icon !== undefined) updateData.icon = parsed.data.icon;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.platform !== undefined) updateData.platform = parsed.data.platform;
  if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;
  if (parsed.data.groupId !== undefined) {
    if (parsed.data.groupId === null) {
      updateData.groupId = null;
      updateData.groupName = null;
    } else {
      const [group] = await db.select().from(categoryGroupsTable).where(eq(categoryGroupsTable.id, parsed.data.groupId)).limit(1);
      if (!group) {
        res.status(400).json({ error: "El grupo seleccionado no existe" });
        return;
      }
      updateData.groupId = group.id;
      updateData.groupName = group.name;
    }
  }

  const [category] = await db.update(categoriesTable).set(updateData).where(eq(categoriesTable.id, params.data.id)).returning();

  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  invalidateCategoriesCache();
  res.json(category);
});

router.delete("/categories/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  invalidateCategoriesCache();
  res.sendStatus(204);
});

// ── Subcategories CRUD ──────────────────────────────────────────────────────

router.post("/categories/:categoryId/subcategories", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = CreateSubcategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateSubcategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const category = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.categoryId)).limit(1);
  if (!category.length) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const [sub] = await db.insert(subcategoriesTable).values({
    categoryId: params.data.categoryId,
    name: parsed.data.name,
    isActive: parsed.data.isActive ?? true,
    sortOrder: parsed.data.sortOrder ?? 99,
  }).returning();

  invalidateCategoriesCache();
  res.status(201).json(sub);
});

router.patch("/subcategories/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateSubcategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSubcategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;

  const [sub] = await db.update(subcategoriesTable).set(updateData).where(eq(subcategoriesTable.id, params.data.id)).returning();

  if (!sub) {
    res.status(404).json({ error: "Subcategory not found" });
    return;
  }

  invalidateCategoriesCache();
  res.json(sub);
});

router.delete("/subcategories/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteSubcategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(subcategoriesTable).where(eq(subcategoriesTable.id, params.data.id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Subcategory not found" });
    return;
  }

  invalidateCategoriesCache();
  res.sendStatus(204);
});

export default router;
