import type { Request, Response } from "express";
import { z } from "zod";
import { categories, pricing } from "../services/pricing.js";
import { period } from "./intelligence.js";
import { report } from "../services/report.js";
import {
  dialogueReport,
  previewDialogues,
  importDialogues,
  saveRule,
  listRules,
} from "../services/dialogues.js";
import { fail } from "../services/errors.js";
function file(req: Request) {
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    fail(400, "Envie text/csv.");
  return req.body as Buffer;
}
export async function overview(req: Request, res: Response) {
  const f = period.parse(req.query);
  const messages = await report(req.user, {
    ...f,
    group: "employee",
    page: 1,
    dataSource: "history",
  });
  const dialogues = await dialogueReport(f);
  res.json({
    pricing,
    messages: { totals: messages.totals, categories: messages.categories },
    dialogues,
  });
}
export async function preview(req: Request, res: Response) {
  z.object({}).strict().parse(req.query);
  res.json(await previewDialogues(file(req), req.user.id));
}
export async function commit(req: Request, res: Response) {
  const { token } = z
    .object({ token: z.string().max(1000) })
    .strict()
    .parse(req.query);
  res.json(await importDialogues(file(req), token, req.user.id));
}
export async function rules(_req: Request, res: Response) {
  res.json(await listRules());
}
export async function rule(req: Request, res: Response) {
  const f = z
    .object({
      dialogue: z.string().trim().min(1).max(150),
      category: z.enum(categories),
      quantity: z.number().int().min(0).max(20),
      channel: z.enum(["2998", "0061"]).nullable(),
    })
    .strict()
    .parse(req.body);
  await saveRule(f.dialogue, f.category, f.quantity, f.channel, req.user.id);
  res.status(204).end();
}
