import type { Request, Response } from "express";
import { z } from "zod";
import {
  previewImport,
  commitImport,
  importHistory,
} from "../services/imports.js";
import { env } from "../config/env.js";
import { analyze, metrics } from "../services/intelligence.js";
import { fail } from "../services/errors.js";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
const period = z
  .object({ from: day, to: day, channel: z.enum(["2998", "0061"]).optional() })
  .strict()
  .refine(
    (f) =>
      f.from <= f.to && Date.parse(f.to) - Date.parse(f.from) <= 365 * 86400000,
    "Período máximo: 366 dias",
  );
function file(req: Request) {
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    fail(400, "Envie o arquivo como text/csv.");
  return req.body as Buffer;
}
export function config(_req: Request, res: Response) {
  res.json({
    channels: ["2998", "0061"],
    aiConfigured: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL,
    importConfigured: !env.DEMO_MODE && Boolean(env.ARCHIVE_ENCRYPTION_KEY),
    demo: env.DEMO_MODE,
  });
}
export async function preview(req: Request, res: Response) {
  const { channel } = z
    .object({ channel: z.enum(["2998", "0061"]) })
    .strict()
    .parse(req.query);
  res.json(await previewImport(file(req), channel, req.user.id));
}
export async function commit(req: Request, res: Response) {
  const q = z
    .object({
      channel: z.enum(["2998", "0061"]),
      filename: z
        .string()
        .min(1)
        .max(180)
        .regex(/^[^\\/\r\n\0]+\.csv$/i),
      token: z.string().max(1000),
    })
    .strict()
    .parse(req.query);
  res.json(
    await commitImport(file(req), q.channel, q.filename, q.token, req.user.id),
  );
}
export async function history(_req: Request, res: Response) {
  res.json(await importHistory());
}
export async function overview(req: Request, res: Response) {
  res.json(await metrics(period.parse(req.query)));
}
export async function analysis(req: Request, res: Response) {
  const { objective, ...filters } = z
    .object({
      from: day,
      to: day,
      channel: z.enum(["2998", "0061"]).optional(),
      objective: z.enum(["summary", "costs", "errors", "volume", "comparison"]),
    })
    .strict()
    .parse(req.body);
  res.json(await analyze(period.parse(filters), objective));
}
