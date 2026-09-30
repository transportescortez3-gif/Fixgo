import { Router } from "express";
import { db, userFavoritesTable, usersTable } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { z } from "zod";

const router = Router();

const AddFavoriteBody = z.object({
  vinculadoId: z.number().int().positive(),
  tipoRelacion: z.enum(["cliente_a_experto", "experto_a_cliente"]),
});

router.get("/favorites", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const myId = req.userId!;
  const role = req.userRole ?? "client";
  const tipoRelacion = role === "worker" ? "experto_a_cliente" : "cliente_a_experto";

  const rows = await db
    .select({
      id: userFavoritesTable.id,
      vinculadoId: userFavoritesTable.vinculadoId,
      tipoRelacion: userFavoritesTable.tipoRelacion,
      createdAt: userFavoritesTable.createdAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        rating: usersTable.rating,
        totalReviews: usersTable.totalReviews,
        bio: usersTable.bio,
      },
    })
    .from(userFavoritesTable)
    .innerJoin(usersTable, eq(userFavoritesTable.vinculadoId, usersTable.id))
    .where(
      and(
        eq(userFavoritesTable.vinculadorId, myId),
        eq(userFavoritesTable.tipoRelacion, tipoRelacion)
      )
    )
    .orderBy(userFavoritesTable.createdAt);

  res.json(rows);
});

router.post("/favorites", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = AddFavoriteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const { vinculadoId, tipoRelacion } = parsed.data;
  const myId = req.userId!;

  if (vinculadoId === myId) { res.status(400).json({ error: "No puedes agregarte a ti mismo" }); return; }

  try {
    await db.execute(sql`
      INSERT INTO user_favorites (vinculador_id, vinculado_id, tipo_relacion)
      VALUES (${myId}, ${vinculadoId}, ${tipoRelacion})
      ON CONFLICT (vinculador_id, vinculado_id, tipo_relacion) DO NOTHING
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/favorites/:vinculadoId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const vinculadoId = Number(req.params.vinculadoId);
  const tipoRelacion = req.query.tipoRelacion as string | undefined;
  if (!vinculadoId) { res.status(400).json({ error: "ID inválido" }); return; }

  const myId = req.userId!;
  const conditions = [
    eq(userFavoritesTable.vinculadorId, myId),
    eq(userFavoritesTable.vinculadoId, vinculadoId),
  ];
  if (tipoRelacion) conditions.push(eq(userFavoritesTable.tipoRelacion, tipoRelacion));

  await db.delete(userFavoritesTable).where(and(...conditions));
  res.json({ ok: true });
});

router.get("/favorites/check/:userId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const targetId = Number(req.params.userId);
  const myId = req.userId!;

  const rows = await db
    .select({ tipoRelacion: userFavoritesTable.tipoRelacion })
    .from(userFavoritesTable)
    .where(
      and(
        eq(userFavoritesTable.vinculadorId, myId),
        eq(userFavoritesTable.vinculadoId, targetId)
      )
    );

  const tipos = rows.map(r => r.tipoRelacion);
  res.json({
    isFavorite: tipos.length > 0,
    tipos,
  });
});

export default router;
