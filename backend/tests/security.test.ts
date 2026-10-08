import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.DEMO_MODE = "true";
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:5173";
const { app } = await import("../src/app.js");
const origin = "http://localhost:5173";
test("authentication, ownership and admin boundaries", async () => {
  assert.equal((await request(app).get("/api/dashboard")).status, 401);
  const agent = request.agent(app);
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: "ana@example.test", password: "DemoEquipe!2026" });
  assert.equal(login.status, 200);
  assert.equal(login.body.password_hash, undefined);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  assert.equal((await agent.get("/api/users")).status, 403);
  assert.equal((await agent.get("/api/intelligence/metrics")).status, 403);
  assert.equal(
    (
      await agent
        .post("/api/intelligence/imports/commit")
        .set("Origin", origin)
        .set("Content-Type", "text/csv")
        .send("invalid csv")
    ).status,
    403,
  );
  assert.equal(
    (
      await agent
        .post("/api/intelligence/analyze")
        .set("Origin", origin)
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await agent.post("/api/users").set("Origin", origin).send({
        name: "Teste",
        email: "test@example.test",
        password: "password123456",
      })
    ).status,
    403,
  );
  const result = await agent.get(
    "/api/dashboard?from=2020-01-01&to=2020-12-31",
  );
  assert.equal(result.status, 200);
  const now = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const own = await agent.get("/api/dashboard").query({ from: start, to: now });
  assert.equal(own.status, 200);
  assert.ok(own.body.rows.every((r: any) => r.id === "ana@example.test"));
  assert.equal(own.body.totals.costMillis, own.body.totals.sent * 35);
  assert.equal(
    (await agent.post("/api/auth/logout").set("Origin", "https://evil.test"))
      .status,
    403,
  );
  assert.equal(
    (await agent.get("/api/dashboard").query({ from: "invalid", to: now }))
      .status,
    400,
  );
});
test("admin can create, deactivate, and revoke an employee session", async () => {
  const admin = request.agent(app);
  await admin
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: "admin@example.test", password: "DemoAdmin!2026" });
  const added = await admin.post("/api/users").set("Origin", origin).send({
    name: "Carla Teste",
    email: "carla@example.test",
    password: "DemoPassword!2026",
  });
  assert.equal(added.status, 201);
  const employee = request.agent(app);
  assert.equal(
    (
      await employee
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email: "carla@example.test", password: "DemoPassword!2026" })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin
        .patch("/api/users/" + added.body.id)
        .set("Origin", origin)
        .send({ active: false })
    ).status,
    204,
  );
  assert.equal((await employee.get("/api/auth/me")).status, 401);
});
