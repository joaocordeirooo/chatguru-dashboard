import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET = "crm-test-secret-with-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "false";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";
process.env.AUTH_DATABASE_URL = process.env.DATABASE_URL;
process.env.ARCHIVE_ENCRYPTION_KEY = "cd".repeat(32);
const { auth } = await import("../src/config/db.js");
const { hash } = await import("../src/services/users.js");
const { app } = await import("../src/app.js");
const { validateDocument } = await import("../src/services/crm.js");
const origin = process.env.APP_ORIGIN;
const adminId = "10000000-0000-4000-8000-000000000001",
  aId = "10000000-0000-4000-8000-000000000002",
  bId = "10000000-0000-4000-8000-000000000003";
test("CRM PostgreSQL: customizable stages, shared visibility, owner edits, moves and encrypted documents", async (context) => {
  const db = new PGlite();
  context.after(async () => {
    await db.close();
    await auth!.end();
  });
  await db.exec(
    "CREATE TABLE public.dashboard_users(id uuid PRIMARY KEY,name text,email text UNIQUE,role text,active boolean DEFAULT true,version integer DEFAULT 0,password_hash text,historical_author text)",
  );
  for (const [id, name, role] of [
    [adminId, "Admin", "admin"],
    [aId, "Ana", "employee"],
    [bId, "Bia", "employee"],
  ])
    await db.query(
      "INSERT INTO dashboard_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        name,
        name.toLowerCase() + "@test.local",
        role,
        hash("CrmPassword!2026"),
      ],
    );
  const query = async (sql: string, p?: any[]) => {
    const r = await db.query(sql, p);
    return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
  };
  (auth as any).query = query;
  (auth as any).connect = async () => ({ query, release: () => {} });
  const admin = request.agent(app),
    ana = request.agent(app),
    bia = request.agent(app);
  for (const [agent, email] of [
    [admin, "admin@test.local"],
    [ana, "ana@test.local"],
    [bia, "bia@test.local"],
  ] as const)
    assert.equal(
      (
        await agent
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ email, password: "CrmPassword!2026" })
      ).status,
      200,
    );
  assert.equal((await request(app).get("/api/crm/board")).status, 401);
  const initial = await admin.get("/api/crm/board");
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.stages.length, 0);
  assert.equal(
    (
      await ana
        .post("/api/crm/stages")
        .set("Origin", origin)
        .send({ name: "Leads", color: "#34436f" })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin
        .post("/api/crm/stages")
        .set("Origin", origin)
        .send({ name: "Leads", color: "red" })
    ).status,
    400,
  );
  const lead = (
    await admin
      .post("/api/crm/stages")
      .set("Origin", origin)
      .send({ name: "Leads", color: "#34436f" })
  ).body;
  const sign = (
    await admin
      .post("/api/crm/stages")
      .set("Origin", origin)
      .send({ name: "Assinatura", color: "#18a982" })
  ).body;
  assert.ok(lead.id && sign.id);
  assert.equal(
    (
      await admin
        .put("/api/crm/stages/order")
        .set("Origin", origin)
        .send({ ids: [sign.id, lead.id] })
    ).status,
    204,
  );
  assert.equal((await admin.get("/api/crm/board")).body.stages[0].id, sign.id);
  assert.equal(
    (
      await admin
        .put("/api/crm/stages/order")
        .set("Origin", origin)
        .send({ ids: [lead.id, lead.id] })
    ).status,
    409,
  );
  const fields = {
    stageId: lead.id,
    title: "Pasta de teste",
    clientName: "Cliente fictício",
    description: "Observação privada",
    dueDate: "2026-10-15",
    assigneeId: aId,
  };
  assert.equal(
    (
      await ana
        .post("/api/crm/tasks")
        .set("Origin", origin)
        .send({ ...fields, assigneeId: bId })
    ).status,
    403,
  );
  const created = await ana
    .post("/api/crm/tasks")
    .set("Origin", origin)
    .send(fields);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const shared = (await bia.get("/api/crm/board")).body;
  assert.equal(shared.tasks.length, 1);
  assert.equal(shared.tasks[0].description, undefined);
  assert.equal(shared.users[0].email, undefined);
  assert.equal(
    (await bia.get(`/api/crm/tasks/${id}`)).body.description,
    "Observação privada",
  );
  assert.equal(
    (
      await bia
        .patch(`/api/crm/tasks/${id}`)
        .set("Origin", origin)
        .send({ ...fields, version: 0 })
    ).status,
    403,
  );
  assert.equal(
    (
      await ana
        .patch(`/api/crm/tasks/${id}`)
        .set("Origin", origin)
        .send({ ...fields, assigneeId: bId, version: 0 })
    ).status,
    403,
  );
  assert.equal(
    (await admin.delete(`/api/crm/stages/${lead.id}`).set("Origin", origin))
      .status,
    409,
  );
  assert.equal(
    (
      await ana
        .patch(`/api/crm/tasks/${id}/move`)
        .set("Origin", origin)
        .send({ stageId: sign.id, beforeId: null, version: 0 })
    ).status,
    204,
  );
  assert.equal(
    (
      await ana
        .patch(`/api/crm/tasks/${id}`)
        .set("Origin", origin)
        .send({ ...fields, version: 0 })
    ).status,
    409,
  );
  assert.equal((await ana.get(`/api/crm/tasks/${id}`)).body.stage_id, sign.id);
  const pdf = Buffer.from("%PDF-1.4\nDocumento de teste\n%%EOF");
  const upload = (agent: any, filename = "contrato.pdf") =>
    agent
      .post(`/api/crm/tasks/${id}/attachments`)
      .set("Origin", origin)
      .set("Content-Type", "application/octet-stream")
      .set("X-Filename", encodeURIComponent(filename))
      .set("X-Document-Type", encodeURIComponent("Contrato"))
      .send(pdf);
  assert.equal((await upload(bia)).status, 403);
  assert.equal((await upload(ana, "../contrato.pdf")).status, 400);
  const attachment = await upload(ana);
  assert.equal(attachment.status, 201);
  assert.equal(attachment.body.encrypted, undefined);
  const stored = (
    await db.query<any>("SELECT encrypted FROM crm_attachments WHERE id=$1", [
      attachment.body.id,
    ])
  ).rows[0].encrypted;
  assert.equal(Buffer.from(stored).includes(pdf), false);
  const downloaded = await bia.get(
    `/api/crm/attachments/${attachment.body.id}`,
  );
  assert.equal(downloaded.status, 200);
  assert.deepEqual(downloaded.body, pdf);
  assert.equal(
    (await request(app).get(`/api/crm/attachments/${attachment.body.id}`))
      .status,
    401,
  );
  assert.equal(
    (
      await bia
        .delete(`/api/crm/attachments/${attachment.body.id}`)
        .set("Origin", origin)
    ).status,
    403,
  );
  assert.equal(
    (
      await ana
        .delete(`/api/crm/attachments/${attachment.body.id}`)
        .set("Origin", origin)
    ).status,
    204,
  );
  assert.equal(
    (await ana.get(`/api/crm/attachments/${attachment.body.id}`)).status,
    404,
  );
  assert.equal(
    (await admin.delete(`/api/crm/stages/${lead.id}`).set("Origin", origin))
      .status,
    204,
  );
});
test("documents reject unsupported and mismatched formats", () => {
  assert.throws(
    () =>
      validateDocument(
        Buffer.from("<script>alert(1)</script>"),
        "malware.html",
      ),
    /Formato/,
  );
  assert.throws(
    () => validateDocument(Buffer.from("not a PDF"), "contrato.pdf"),
    /conteúdo/,
  );
  assert.throws(
    () => validateDocument(Buffer.alloc(0), "documento.txt"),
    /10 MB/,
  );
});
