import type { Request, Response } from "express";
import { z } from "zod";
import { report } from "../services/report.js";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
export async function dashboard(req: Request, res: Response) {
  const f = z
    .object({
      from: date,
      to: date,
      group: z.enum(["employee", "conversation", "client"]).default("employee"),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .strict()
    .refine(
      (v) =>
        v.from <= v.to &&
        Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
      "Período máximo: 366 dias",
    )
    .parse(req.query);
  res.json(await report(req.user, f));
}
