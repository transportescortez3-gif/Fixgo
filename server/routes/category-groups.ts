import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, categoriesTable, categoryGroupsTable } from "../db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { invalidateCategoriesCache } from "./categories";

const router = Router();

const groupBody = z.object({
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

router.get("/category-groups", async (_req, res): Promise<void> => {
  const groups = await db.select().from(categoryGroupsTable)
    .where(eq(categoryGroupsTable.isActive, true))
    .orderBy(asc(categoryGroupsTable.sortOrder), asc(categoryGroupsTable.id));
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
  res.json(groups);
});

router.get("/admin/category-groups", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const groups = await db.select({
    id: categoryGroupsTable.id,
    name: categoryGroupsTable.name,
    icon: categoryGroupsTable.icon,
    color: categoryGroupsTable.color,
    sortOrder: categoryGroupsTable.sortOrder,
    isActive: categoryGroupsTable.isActive,
    categoryCount: sql<number>`count(${categoriesTable.id})::int`,
  })
    .from(categoryGroupsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.groupId, categoryGroupsTable.id))
    .groupBy(categoryGroupsTable.id)
    .orderBy(asc(categoryGroupsTable.sortOrder), asc(categoryGroupsTable.id));
  res.json(groups);
});

router.post("/admin/category-groups", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = groupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [group] = await db.insert(categoryGroupsTable).values({
      name: parsed.data.name,
      icon: parsed.data.icon ?? "layers",
      color: parsed.data.color ?? "#5b7fff",
      sortOrder: parsed.data.sortOrder ?? 99,
      isActive: parsed.data.isActive ?? true,
    }).returning();
    res.status(201).json(group);
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Ya existe un grupo con ese nombre" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/category-groups/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = groupBody.partial().safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "ID inválido" : parsed.error.message });
    return;
  }
  const [group] = await db.update(categoryGroupsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(categoryGroupsTable.id, id))
    .returning();
  if (!group) {
    res.status(404).json({ error: "Grupo no encontrado" });
    return;
  }
  if (parsed.data.name !== undefined) {
    await db.update(categoriesTable)
      .set({ groupName: parsed.data.name })
      .where(eq(categoriesTable.groupId, id));
  }
  invalidateCategoriesCache();
  res.json(group);
});

router.delete("/admin/category-groups/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const assigned = await db.select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.groupId, id));
  if (assigned.length > 0) {
    res.status(409).json({ error: `Reasigna primero las ${assigned.length} categorías de este grupo` });
    return;
  }
  const [deleted] = await db.delete(categoryGroupsTable)
    .where(eq(categoryGroupsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Grupo no encontrado" });
    return;
  }
  invalidateCategoriesCache();
  res.sendStatus(204);
});

router.put("/admin/category-groups/reorder", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = z.object({ ids: z.array(z.coerce.number().int()).min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.transaction(async (tx) => {
    for (const [index, id] of parsed.data.ids.entries()) {
      await tx.update(categoryGroupsTable)
        .set({ sortOrder: index + 1, updatedAt: new Date() })
        .where(eq(categoryGroupsTable.id, id));
    }
  });
  invalidateCategoriesCache();
  res.sendStatus(204);
});

export default router;