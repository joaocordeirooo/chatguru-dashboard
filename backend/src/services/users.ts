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
        await auth!.query("SELECT * FROM dashboard_users WHERE email=$1", [
          email,
        ])
      ).rows[0];
}
export async function byId(id: string): Promise<User | undefined> {
  return env.DEMO_MODE
    ? demo.find((u) => u.id === id)
    : (await auth!.query("SELECT * FROM dashboard_users WHERE id=$1", [id]))
        .rows[0];
}
export async function list() {
  return env.DEMO_MODE
    ? demo.map(publicUser)
    : (
        await auth!.query(
          "SELECT id,name,email,role,active FROM dashboard_users ORDER BY name",
        )
      ).rows;
}
export async function create(name: string, email: string, password: string) {
  const user: User = {
    id: randomUUID(),
    name,
    email,
    role: "employee",
    active: true,
    version: 0,
    password_hash: hash(password),
  };
  if (env.DEMO_MODE) {
    if (demo.some((u) => u.email === email))
      throw Object.assign(new Error("E-mail já cadastrado"), { status: 409 });
    demo.push(user);
  } else
    await auth!.query(
      "INSERT INTO dashboard_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)",
      [user.id, name, email, user.role, user.password_hash],
    );
  return publicUser(user);
}
export async function update(
  id: string,
  values: { active?: boolean; password?: string },
) {
  const user = await byId(id);
  if (!user || user.role === "admin")
    throw Object.assign(new Error("Funcionário não encontrado"), {
      status: 404,
    });
  if (env.DEMO_MODE) {
    if (values.active !== undefined) user.active = values.active;
    if (values.password) user.password_hash = hash(values.password);
    user.version++;
  } else
    await auth!.query(
      "UPDATE dashboard_users SET active=COALESCE($2,active),password_hash=COALESCE($3,password_hash),version=version+1 WHERE id=$1",
      [
        id,
        values.active ?? null,
        values.password ? hash(values.password) : null,
      ],
    );
}
