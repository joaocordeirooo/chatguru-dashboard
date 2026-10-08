import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createDecipheriv } from "node:crypto";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "false";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.DATABASE_URL = "postgres://unused:unused@localhost:1/unused";
process.env.AUTH_DATABASE_URL = process.env.DATABASE_URL;
process.env.SOURCE_SCHEMA = "atendimento";
process.env.ARCHIVE_ENCRYPTION_KEY = "ab".repeat(32);
process.env.OPENAI_API_KEY = "test-key-never-sent-to-provider";
const { source, warehouse, auth } = await import("../src/config/db.js");
const { headers, parseHistory, archive } = await import(
  "../src/services/csv.js"
);
const { previewImport, commitImport } = await import(
  "../src/services/imports.js"
);
const { metrics, providerPayload, analyze, requestAnalysis } = await import(
  "../src/services/intelligence.js"
);
const id = "e7399895-8678-4124-b6d5-8f77597b37fa";
const row = (
  status = "Enviada",
  sent = "07-10-2026 10:00:00",
  message = 'mensagem privada, com "aspas"\ne quebra',
) => [
  "Autor privado",
  "Cliente privado",
  "+554199999999",
  "chat1",
  "chat",
  status,
  "07-10-2026 09:00:00",
  sent,
  message,
  "https://example.test/private?sig=123",
];
const csv = (rows: string[][]) =>
  Buffer.from(
    headers.join(",") +
      "\r\n" +
      rows
        .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
        .join("\r\n"),
  );
test("CSV validates dates, quoted multiline content and preserves initial-import identity", () => {
  const buffer = csv([row(), row("Erro", "")]);
  const parsed = parseHistory(buffer, "2998");
  assert.equal(parsed.summary.sent, 1);
  assert.equal(parsed.summary.errors, 1);
  assert.equal(parsed.summary.costMillis, 35);
  assert.ok(parsed.records[0].message.includes("\n"));
  assert.equal(
    parseHistory(Buffer.concat([Buffer.from("\ufeff"), buffer]), "2998")
      .records[0].key,
    parsed.records[0].key,
  );
  const signed = row();
  signed[9] = "https://example.test/private?sig=changed";
  assert.equal(
    parseHistory(csv([signed]), "2998").records[0].key,
    parsed.records[0].key,
  );
  assert.notEqual(
    parseHistory(buffer, "0061").records[0].key,
    parsed.records[0].key,
  );
  assert.throws(() => parseHistory(csv([row("Enviada", "")]), "2998"));
  assert.throws(() =>
    parseHistory(csv([row("Enviada", "31-02-2026 10:00:00")]), "2998"),
  );
  assert.throws(() => parseHistory(csv([row()]), "other"));
  assert.throws(() => parseHistory(Buffer.from([255]), "2998"));
  const encrypted = archive("sigilo", process.env.ARCHIVE_ENCRYPTION_KEY!)!;
  const [, , iv, tag, data] = encrypted.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.ARCHIVE_ENCRYPTION_KEY!, "hex"),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  assert.equal(
    Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString(),
    "sigilo",
  );
});
test("PostgreSQL import is additive, overlapping exports are deduplicated, AI receives aggregates and cached calls are reused", async () => {
  const db = new PGlite();
  await db.exec(
    `CREATE SCHEMA atendimento;CREATE TABLE atendimento.historico_chatguru(chave_importacao text PRIMARY KEY,chat_id text,contato_nome text,telefone text,autor text,tipo text,texto text,url_arquivo text,enviado_em timestamptz,arquivo_origem text,canal text,status text,criado_em_origem timestamptz);`,
  );
  const query = async (sql: string, p?: any[]) => {
    const result = await db.query(sql, p);
    return { ...result, rowCount: result.affectedRows };
  };
  const client = { query, release: () => {} };
  (source as any).query = query;
  (source as any).connect = async () => client;
  (warehouse as any).query = query;
  (warehouse as any).connect = async () => client;
  const buffer = csv([row(), row("Erro", "")]);
  const before = await previewImport(buffer, "2998", id);
  assert.equal(before.newRows, 2);
  await assert.rejects(
    commitImport(buffer, "0061", "test.csv", before.previewToken, id),
    /Prévia/,
  );
  await assert.rejects(
    commitImport(
      buffer,
      "2998",
      "test.csv",
      before.previewToken,
      "f7399895-8678-4124-b6d5-8f77597b37fa",
    ),
    /Prévia/,
  );
  const first = await commitImport(
    buffer,
    "2998",
    "test.csv",
    before.previewToken,
    id,
  );
  assert.equal(first.inserted, 2);
  const second = await commitImport(
    buffer,
    "2998",
    "test.csv",
    before.previewToken,
    id,
  );
  assert.equal(second.inserted, 0);
  assert.equal(second.alreadyImported, true);
  const extended = csv([
    row(),
    row("Erro", ""),
    row("Enviada", "07-10-2026 11:00:00"),
  ]);
  const preview = await previewImport(extended, "2998", id);
  assert.equal(preview.existing, 2);
  assert.equal(preview.newRows, 1);
  const overlap = await commitImport(
    extended,
    "2998",
    "longer.csv",
    preview.previewToken,
    id,
  );
  assert.equal(overlap.inserted, 1);
  assert.equal(overlap.skipped, 2);
  const p2 = await previewImport(buffer, "0061", id);
  await commitImport(buffer, "0061", "other.csv", p2.previewToken, id);
  // Erro no registro do lote precisa desfazer todos os INSERTs da carga.
  const failing = csv([row("Enviada", "07-10-2026 14:00:00")]);
  const pf = await previewImport(failing, "2998", id);
  (warehouse as any).connect = async () => ({
    query: (sql: string, p?: any[]) =>
      sql.startsWith("INSERT INTO") && sql.includes("dashboard_csv_imports")
        ? Promise.reject(new Error("audit-failure"))
        : query(sql, p),
    release: () => {},
  });
  await assert.rejects(
    commitImport(failing, "2998", "failure.csv", pf.previewToken, id),
    /audit-failure/,
  );
  assert.equal((await previewImport(failing, "2998", id)).existing, 0);
  (warehouse as any).connect = async () => client;
  const stored: any = (
    await db.query(
      "SELECT texto,telefone,url_arquivo FROM atendimento.historico_chatguru LIMIT 1",
    )
  ).rows[0];
  assert.ok(stored.texto.startsWith("enc:v1:"));
  assert.ok(stored.telefone.startsWith("enc:v1:"));
  assert.ok(stored.url_arquivo.startsWith("enc:v1:"));
  const period = { from: "2026-10-01", to: "2026-10-07" };
  const m = await metrics(period);
  assert.equal(m.current.totals.sent, 3);
  assert.equal(m.current.totals.errors, 2);
  assert.equal(m.current.totals.costMillis, 105);
  assert.equal(m.current.totals.chats, 2);
  assert.equal(
    (await metrics({ ...period, channel: "0061" })).current.totals.sent,
    1,
  );
  assert.ok(
    !JSON.stringify(providerPayload(m, "summary")).match(
      /Autor privado|Cliente privado|mensagem privada|554199999999|sig=123|chat1/,
    ),
  );
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.input.includes("Cliente privado"), false);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "Análise estatística do período." },
            ],
          },
        ],
        usage: { input_tokens: 123, output_tokens: 45 },
      }),
      { status: 200 },
    );
  };
  try {
    const a = await analyze(period, "summary"),
      b = await analyze(period, "summary");
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.equal(calls, 1);
    await db.exec(
      "UPDATE atendimento.historico_chatguru SET status='enviada' WHERE canal='0061' AND status='erro'",
    );
    assert.equal((await analyze(period, "summary")).cached, false);
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    await assert.rejects(requestAnalysis(m, "errors"), /Limite ou saldo/);
  } finally {
    globalThis.fetch = fetchBefore;
    await db.close();
    await source!.end();
    await warehouse!.end();
    await auth!.end();
  }
});
