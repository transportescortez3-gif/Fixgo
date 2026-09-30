import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/client-errors", (req: Request, res: Response) => {
  const { message, stack, url, userAgent } = req.body ?? {};
  logger.error({
    source: "frontend",
    message,
    stack,
    url,
    userAgent,
  }, `[FRONTEND ERROR] ${message}`);
  res.status(204).end();
});

export default router;
