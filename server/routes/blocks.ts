import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { z } from "zod";

const router = Router();

const CreateBlockBody = z.object({ blockedId: z.number().int().positive() });

router.post("/blocks", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateBlockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "blockedId inválido" }); return; }

  const { blockedId } = parsed.data;
  const blockerId = req.userId!;

  if (blockedId === blockerId) { res.status(400).json({ error: "No puedes bloquearte a ti mismo" }); return; }

  try {
    await db.execute(sql`
      INSERT INTO user_blocks (blocker_id, blocked_id)
      VALUES (${blockerId}, ${blockedId})
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO user_blocks (blocker_id, blocked_id)
      VALUES (${blockedId}, ${blockerId})
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/blocks/:blockedId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const blockedId = Number(req.params.blockedId);
  if (!blockedId) { res.status(400).json({ error: "ID inválido" }); return; }
  const blockerId = req.userId!;

  await db.execute(sql`
    DELETE FROM user_blocks
    WHERE (blocker_id = ${blockerId} AND blocked_id = ${blockedId})
       OR (blocker_id = ${blockedId} AND blocked_id = ${blockerId})
  `);

  res.json({ ok: true });
});

router.get("/blocks/check/:userId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const targetId = Number(req.params.userId);
  const myId = req.userId!;

  const result = await db.execute(sql`
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = ${myId} AND blocked_id = ${targetId})
       OR (blocker_id = ${targetId} AND blocked_id = ${myId})
    LIMIT 1
  `);

  res.json({ blocked: (result.rows?.length ?? 0) > 0 });
});

export default router;
