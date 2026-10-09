import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.DEMO_MODE = "false";
process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";
process.env.AUTH_DATABASE_URL = process.env.DATABASE_URL;
process.env.SOURCE_SCHEMA = "atendimento";
const { source, auth } = await import("../src/config/db.js");
const { report } = await import("../src/services/report.js");
test("PostgreSQL reports: status, period boundaries, author isolation, grouping and sources", async () => {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA atendimento;
 CREATE TABLE atendimento.historico_chatguru(chave_importacao text PRIMARY KEY,chat_id text NOT NULL,contato_nome text,telefone text,autor text,tipo text NOT NULL,texto text,url_arquivo text,enviado_em timestamptz NOT NULL,arquivo_origem text NOT NULL,importado_em timestamptz NOT NULL DEFAULT now());
 CREATE TABLE atendimento.contatos(id bigint PRIMARY KEY,nome text,telefone text);
 CREATE TABLE atendimento.conversas(id bigint PRIMARY KEY,contato_id bigint REFERENCES atendimento.contatos(id),responsavel_nome text,responsavel_email text,phone_id text,chat_id text);
 CREATE TABLE atendimento.mensagens(id bigint PRIMARY KEY,conversa_id bigint REFERENCES atendimento.conversas(id),data_origem timestamptz,registrado_em timestamptz,tipo text,status text,direcao text);
 CREATE TABLE atendimento.anotacoes(id bigint PRIMARY KEY,mensagem_id bigint REFERENCES atendimento.mensagens(id),destino text,texto text,registrada_em timestamptz,status text);`);
  await db.exec(await readFile("sql/002_history.sql", "utf8"));
  await db.exec(`INSERT INTO atendimento.historico_chatguru(chave_importacao,chat_id,autor,tipo,enviado_em,arquivo_origem,canal,status,criado_em_origem) VALUES
 ('a','c1','Autora A','chat','2026-10-01 00:00:00-03','test.csv','2998','enviada',NULL),
 ('b','c1','Autora A','audio','2026-10-07 23:59:59-03','test.csv','2998','enviada',NULL),
 ('c','c2','Autora B','chat','2026-10-07 12:00:00-03','test.csv','2998','enviada',NULL),
 ('d','c2','Autora B','chat',NULL,'test.csv','2998','erro','2026-10-07 13:00:00-03'),
 ('e','c3','Autora A','chat','2026-10-08 00:00:00-03','test.csv','2998','enviada',NULL),
 ('f','c4','Autora A','chat','2026-10-07 12:00:00-03','test.csv','outro','enviada',NULL);
 INSERT INTO atendimento.contatos VALUES(1,'Cliente','');
 INSERT INTO atendimento.conversas VALUES(1,1,'Equipe','equipe@example.test','phone1','chat1');
 INSERT INTO atendimento.mensagens VALUES(1,1,NULL,'2026-10-07 12:00:00-03','chat','enviada','saida'),(2,1,NULL,'2026-10-07 12:00:00-03','chat','processada','entrada'),(3,1,NULL,'2026-10-07 12:00:00-03','chat','envio_incerto','saida');`);
  let queryCount = 0;
  (source as any).connect = async () => ({
    query: (sql: string, p: any[]) => {
      queryCount++;
      return db.query(sql, p);
    },
    release: () => {},
  });
  const admin = {
    id: "admin",
    name: "Admin",
    email: "admin@example.test",
    role: "admin" as const,
    active: true,
    version: 0,
    password_hash: "",
  };
  const employee = {
    ...admin,
    id: "employee",
    email: "equipe@example.test",
    role: "employee" as const,
    historical_author: "Autora A",
  };
  const f = {
    from: "2026-10-01",
    to: "2026-10-07",
    group: "employee" as const,
    page: 1,
    channel: "2998",
  };
  const result = await report(admin, f);
  assert.equal(
    queryCount,
    1,
    "all dashboard aggregates use one database round trip",
  );
  assert.equal(result.totals.records, 4);
  assert.equal(result.totals.sent, 3);
  assert.equal(result.totals.errors, 1);
  assert.equal(result.totals.costMillis, 105);
  assert.equal(result.totals.chats, 2);
  assert.equal(result.daily[0].day, "2026-10-01");
  assert.equal(result.daily.at(-1)?.day, "2026-10-07");
  assert.equal((await report(employee, f)).totals.sent, 2);
  assert.equal(
    (await report({ ...employee, historical_author: null }, f)).totals.records,
    0,
  );
  assert.equal(
    (await report(employee, { ...f, author: "Autora B" })).totals.records,
    0,
  );
  assert.equal(
    (await report(admin, { ...f, author: "Autora A' OR TRUE --" })).totals
      .records,
    0,
  );
  const errors = await report(admin, { ...f, status: "erro" });
  assert.equal(errors.totals.costMillis, 0);
  assert.equal(errors.totals.errors, 1);
  assert.equal((await report(admin, { ...f, type: "audio" })).totals.sent, 1);
  assert.equal(
    (await report(admin, { ...f, group: "conversation" })).rows.length,
    2,
  );
  assert.equal((await report(admin, { ...f, page: 2 })).total, 2);
  assert.equal((await report(admin, { ...f, page: 2 })).rows.length, 0);
  const workflow = await report(employee, {
    ...f,
    channel: "",
    dataSource: "workflow",
  });
  assert.equal(workflow.totals.sent, 1);
  assert.equal(workflow.totals.received, 1);
  assert.equal(workflow.totals.costMillis, 35);
  assert.ok(!JSON.stringify(result).includes("password_hash"));
  await db.close();
  await source!.end();
  await auth!.end();
});
