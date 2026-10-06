import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { byId, type User } from "../services/users.js";
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = jwt.verify(req.cookies.session || "", env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "chatguru-dashboard",
      audience: "dashboard",
    }) as jwt.JwtPayload;
    const user = await byId(String(payload.sub));
    if (!user?.active || user.version !== payload.version)
      return res.status(401).json({ error: "Sessão inválida" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Faça login" });
  }
}
export function admin(req: Request, res: Response, next: NextFunction) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Acesso restrito ao administrador" });
  next();
}
export function origin(req: Request, res: Response, next: NextFunction) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== env.APP_ORIGIN
  )
    return res.status(403).json({ error: "Origem inválida" });
  next();
}
