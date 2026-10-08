import "dotenv/config";
import { z } from "zod";
export const env = z
  .object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DEMO_MODE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    APP_ORIGIN: z.string().url().default("http://localhost:5173"),
    JWT_SECRET: z.string().min(32),
    DATABASE_URL: z.string().optional(),
    AUTH_DATABASE_URL: z.string().optional(),
    DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    AUTH_DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    OUTGOING_DIRECTION: z.string().default("saida"),
    SENT_STATUSES: z.string().default("enviada"),
    RECEIVED_DIRECTION: z.string().default("entrada"),
    SOURCE_SCHEMA: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default("atendimento"),
  })
  .parse(process.env);
if (!env.DEMO_MODE && (!env.DATABASE_URL || !env.AUTH_DATABASE_URL))
  throw new Error("Configure both database URLs");
if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
  throw new Error("Production requires HTTPS origin");
