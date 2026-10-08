import {
  randomUUID,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { auth } from "../config/db.js";
import { env } from "../config/env.js";
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "employee";
  active: boolean;
  version: number;
  password_hash: string;
  historical_author?: string | null;
};
export function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verify(password: string, value: string) {
  const [salt, digest] = value.split(":");
  if (!salt || !digest) return false;
  const bytes = Buffer.from(digest, "hex");
  return (
    bytes.length === 64 &&
    timingSafeEqual(bytes, scryptSync(password, salt, 64))
  );
}
const demo: User[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Administrador",
    email: "admin@example.test",
    role: "admin",
    active: true,
    version: 0,
    password_hash: hash("DemoAdmin!2026"),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Ana Souza",
    email: "ana@example.test",
    role: "employee",
    active: true,
    version: 0,
    password_hash: hash("DemoEquipe!2026"),
  },
];
export const publicUser = ({ password_hash, version, ...user }: User) => user;
export async function byEmail(email: string): Promise<User | undefined> {
  return env.DEMO_MODE
    ? demo.find((u) => u.email === email)
    : (
        await auth!.query(
          "SELECT * FROM public.dashboard_users WHERE email=$1",
          [email],
        )
      ).rows[0];
}
export async function byId(id: string): Promise<User | undefined> {
  return env.DEMO_MODE
    ? demo.find((u) => u.id === id)
    : (
        await auth!.query("SELECT * FROM public.dashboard_users WHERE id=$1", [
          id,
        ])
      ).rows[0];
}
export async function list() {
  return env.DEMO_MODE
    ? demo.map(publicUser)
    : (
        await auth!.query(
          "SELECT id,name,email,role,active,historical_author FROM public.dashboard_users ORDER BY name",
        )
      ).rows;
}
export async function create(
  name: string,
  email: string,
  password: string,
  historical_author?: string,
) {
  const user: User = {
    id: randomUUID(),
    name,
    email,
    role: "employee",
    active: true,
    version: 0,
    password_hash: hash(password),
    historical_author: historical_author ?? null,
  };
  if (env.DEMO_MODE) {
    if (demo.some((u) => u.email === email))
      throw Object.assign(new Error("E-mail já cadastrado"), { status: 409 });
    if (
      historical_author &&
      demo.some(
        (u) =>
          u.role === "employee" && u.historical_author === historical_author,
      )
    )
      throw Object.assign(new Error("Autor já vinculado"), { status: 409 });
    demo.push(user);
  } else
    await auth!.query(
      "INSERT INTO public.dashboard_users(id,name,email,role,password_hash,historical_author) VALUES($1,$2,$3,$4,$5,$6)",
      [
        user.id,
        name,
        email,
        user.role,
        user.password_hash,
        user.historical_author,
      ],
    );
  return publicUser(user);
}
export async function update(
  id: string,
  values: {
    active?: boolean;
    password?: string;
    historical_author?: string | null;
  },
) {
  const user = await byId(id);
  if (!user || user.role === "admin")
    throw Object.assign(new Error("Funcionário não encontrado"), {
      status: 404,
    });
  if (env.DEMO_MODE) {
    if (
      values.historical_author &&
      demo.some(
        (u) =>
          u.id !== id &&
          u.role === "employee" &&
          u.historical_author === values.historical_author,
      )
    )
      throw Object.assign(new Error("Autor já vinculado"), { status: 409 });
    if (values.active !== undefined) user.active = values.active;
    if (values.password) user.password_hash = hash(values.password);
    if (values.historical_author !== undefined)
      user.historical_author = values.historical_author;
    user.version++;
  } else
    await auth!.query(
      "UPDATE public.dashboard_users SET active=COALESCE($2,active),password_hash=COALESCE($3,password_hash),historical_author=CASE WHEN $4 THEN $5 ELSE historical_author END,version=version+1 WHERE id=$1",
      [
        id,
        values.active ?? null,
        values.password ? hash(values.password) : null,
        values.historical_author !== undefined,
        values.historical_author ?? null,
      ],
    );
}
