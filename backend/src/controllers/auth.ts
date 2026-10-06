import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { byEmail, verify, publicUser } from "../services/users.js";
import { env } from "../config/env.js";
export async function login(req: Request, res: Response) {
  const input = z
    .object({
      email: z
        .string()
        .email()
        .transform((s) => s.toLowerCase()),
      password: z.string().min(1).max(128),
    })
    .strict()
    .parse(req.body);
  const user = await byEmail(input.email);
  if (!user?.active || !verify(input.password, user.password_hash))
    return res.status(401).json({ error: "E-mail ou senha inválidos" });
  const token = jwt.sign({ version: user.version }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "1h",
    algorithm: "HS256",
    issuer: "chatguru-dashboard",
    audience: "dashboard",
  });
  res
    .cookie("session", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600000,
      path: "/api",
    })
    .json(publicUser(user));
}
export function logout(req: Request, res: Response) {
  res
    .clearCookie("session", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api",
    })
    .status(204)
    .end();
}
