import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { routes } from "./routes/index.js";
import { origin } from "./middlewares/security.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(
  "/api",
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  origin,
  routes,
);
app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada" }));
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({
          error: "Dados inválidos",
          fields: error.issues.map((i) => i.path.join(".")),
        });
    if (error.code === "23505")
      return res.status(409).json({ error: "E-mail já cadastrado" });
    const status = error.status || 500;
    res
      .status(status)
      .json({ error: status < 500 ? error.message : "Erro interno" });
  },
);
