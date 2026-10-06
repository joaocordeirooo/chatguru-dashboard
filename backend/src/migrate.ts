import { auth } from "./config/db.js";
import { hash } from "./services/users.js";
import { z } from "zod";
if (!auth) throw new Error("AUTH_DATABASE_URL obrigatório");
await auth.query(
  "CREATE TABLE IF NOT EXISTS dashboard_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text UNIQUE NOT NULL,role text NOT NULL CHECK(role IN ('admin','employee')),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 0,password_hash text NOT NULL)",
);
const email = z
  .string()
  .email()
  .parse(process.env.BOOTSTRAP_ADMIN_EMAIL)
  .toLowerCase();
const password = z
  .string()
  .min(12)
  .max(128)
  .parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
await auth.query(
  "INSERT INTO dashboard_users(name,email,role,password_hash) VALUES('Administrador',$1,'admin',$2) ON CONFLICT(email) DO NOTHING",
  [email, hash(password)],
);
await auth.end();
console.log("Contas do dashboard inicializadas");
