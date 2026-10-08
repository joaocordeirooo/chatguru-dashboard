import type { Request, Response } from "express";
import { z } from "zod";
import * as users from "../services/users.js";
export async function list(req: Request, res: Response) {
  res.json(await users.list());
}
export async function create(req: Request, res: Response) {
  const v = z
    .object({
      name: z.string().min(2).max(100),
      email: z
        .string()
        .email()
        .transform((s) => s.toLowerCase()),
      password: z.string().min(12).max(128),
      historical_author: z.string().trim().min(1).max(150).optional(),
    })
    .strict()
    .parse(req.body);
  res
    .status(201)
    .json(await users.create(v.name, v.email, v.password, v.historical_author));
}
export async function update(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  const v = z
    .object({
      active: z.boolean().optional(),
      password: z.string().min(12).max(128).optional(),
      historical_author: z
        .string()
        .trim()
        .min(1)
        .max(150)
        .nullable()
        .optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(req.body);
  await users.update(id, v);
  res.status(204).end();
}
