import type { Request, Response } from "express";
import { z } from "zod";
import * as crm from "../services/crm.js";
import { fail } from "../services/errors.js";
const id = z.string().uuid();
const stage = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
const task = z
  .object({
    stageId: id,
    title: z.string().trim().min(1).max(150),
    clientName: z.string().trim().max(150),
    description: z.string().max(5000),
    dueDate: date.nullable(),
    assigneeId: id.nullable(),
  })
  .strict();
const taskId = (req: Request) => id.parse(req.params.id);
export async function board(_req: Request, res: Response) {
  res.json(await crm.board());
}
export async function detail(req: Request, res: Response) {
  res.json(await crm.taskDetail(taskId(req)));
}
export async function createStage(req: Request, res: Response) {
  const f = stage.parse(req.body);
  res.status(201).json(await crm.createStage(f.name, f.color));
}
export async function updateStage(req: Request, res: Response) {
  const f = stage.parse(req.body);
  res.json(await crm.updateStage(taskId(req), f.name, f.color));
}
export async function reorder(req: Request, res: Response) {
  const f = z
    .object({ ids: z.array(id).max(100) })
    .strict()
    .parse(req.body);
  await crm.reorderStages(f.ids);
  res.status(204).end();
}
export async function removeStage(req: Request, res: Response) {
  await crm.removeStage(taskId(req));
  res.status(204).end();
}
export async function createTask(req: Request, res: Response) {
  res.status(201).json(await crm.createTask(task.parse(req.body), req.user));
}
export async function updateTask(req: Request, res: Response) {
  const f = task.extend({ version: z.number().int().min(0) }).parse(req.body);
  const { version, ...fields } = f;
  await crm.updateTask(taskId(req), fields, version, req.user);
  res.status(204).end();
}
export async function move(req: Request, res: Response) {
  const f = z
    .object({
      stageId: id,
      beforeId: id.nullable(),
      version: z.number().int().min(0),
    })
    .strict()
    .parse(req.body);
  await crm.moveTask(taskId(req), f.stageId, f.beforeId, f.version, req.user);
  res.status(204).end();
}
export async function upload(req: Request, res: Response) {
  let filename = "",
    type = "";
  try {
    filename = decodeURIComponent(String(req.headers["x-filename"] || ""));
    type = decodeURIComponent(String(req.headers["x-document-type"] || ""));
  } catch {
    fail(400, "Nome ou tipo do documento inválido.");
  }
  filename = z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[^\\/\x00-\x1f\x7f]+$/)
    .parse(filename);
  type = z.string().trim().min(1).max(80).parse(type);
  res
    .status(201)
    .json(
      await crm.addAttachment(taskId(req), filename, type, req.body, req.user),
    );
}
export async function download(req: Request, res: Response) {
  const a = await crm.downloadAttachment(taskId(req));
  res.set("Content-Type", a.mime);
  res.set(
    "Content-Disposition",
    `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(a.filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`,
  );
  res.set("X-Content-Type-Options", "nosniff");
  res.send(a.buffer);
}
export async function removeAttachment(req: Request, res: Response) {
  await crm.removeAttachment(taskId(req), req.user);
  res.status(204).end();
}
