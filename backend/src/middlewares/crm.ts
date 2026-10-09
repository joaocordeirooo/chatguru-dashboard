import type { Request, Response, NextFunction } from "express";
import type { User } from "../services/users.js";
import { fail } from "../services/errors.js";
export function assertTaskEditor(user: User, assignee: string | null) {
  if (user.role !== "admin" && user.id !== assignee)
    fail(403, "Você pode editar somente suas tarefas.");
}
export function attachmentBody(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    return next(
      Object.assign(
        new Error("Envie o arquivo como application/octet-stream."),
        { status: 400 },
      ),
    );
  next();
}
