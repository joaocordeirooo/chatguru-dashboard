import { warehouse, source } from "../config/db.js";
import { env } from "../config/env.js";
import { parseHistory, archive } from "./csv.js";
import { fail } from "./errors.js";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { BillingCategory } from "./pricing.js";
export const schema = `"${env.SOURCE_SCHEMA}"`;
let initialization: Promise<void> | undefined;
async function initializeWarehouse() {
  if (!warehouse)
    fail(503, "Importação disponível somente com banco real configurado.");
  const db = await warehouse!.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "dashboard-setup:" + env.SOURCE_SCHEMA,
    ]);
    await db.query(
      `ALTER TABLE ${schema}.historico_chatguru ADD COLUMN IF NOT EXISTS billing_category text NOT NULL DEFAULT 'unclassified' CHECK(billing_category IN ('marketing','service','utility','authentication','unclassified'))`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS ${schema}.dashboard_csv_imports(
    id uuid PRIMARY KEY,channel text NOT NULL,file_hash text NOT NULL,filename text NOT NULL,
    rows_total integer NOT NULL,rows_inserted integer NOT NULL,from_day date NOT NULL,to_day date NOT NULL,
    imported_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(channel,file_hash))`);
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.dashboard_ai_cache(cache_key text PRIMARY KEY,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function prepareWarehouse() {
  if (!initialization)
    initialization = initializeWarehouse().catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
async function countExisting(parsed: ReturnType<typeof parseHistory>) {
  let existing = 0;
  for (let i = 0; i < parsed.records.length; i += 2000) {
    existing += Number(
      (
        await source!.query(
          `SELECT COUNT(*)::int AS n FROM ${schema}.historico_chatguru WHERE chave_importacao=ANY($1::text[])`,
          [parsed.records.slice(i, i + 2000).map((r) => r.key)],
        )
      ).rows[0].n,
    );
  }
  return existing;
}
export async function previewImport(
  buffer: Buffer,
  channel: string,
  userId: string,
  category: BillingCategory = "unclassified",
) {
  if (!warehouse || !source) fail(503, "Configure o banco para importar CSVs.");
  if (!env.ARCHIVE_ENCRYPTION_KEY)
    fail(
      503,
      "Configure ARCHIVE_ENCRYPTION_KEY no backend com a chave de arquivamento.",
    );
  const parsed = parseHistory(buffer, channel, category);
  const existing = await countExisting(parsed);
  const token = jwt.sign(
    { hash: parsed.hash, channel, category },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "15m",
      subject: userId,
      issuer: "csv-preview",
      audience: "csv-import",
    },
  );
  return {
    ...parsed.summary,
    existing,
    newRows: parsed.records.length - existing,
    previewToken: token,
  };
}
export async function commitImport(
  buffer: Buffer,
  channel: string,
  filename: string,
  token: string,
  userId: string,
  category: BillingCategory = "unclassified",
) {
  if (!env.ARCHIVE_ENCRYPTION_KEY)
    fail(503, "Configure a chave de arquivamento no backend.");
  const parsed = parseHistory(buffer, channel, category);
  try {
    const p = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "csv-preview",
      audience: "csv-import",
      subject: userId,
    }) as jwt.JwtPayload;
    if (
      p.hash !== parsed.hash ||
      p.channel !== channel ||
      (p.category ?? "unclassified") !== category
    )
      throw new Error();
  } catch {
    fail(400, "Prévia expirada ou arquivo alterado. Gere a prévia novamente.");
  }
  await prepareWarehouse();
  const db = await warehouse!.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "dashboard-csv:" + channel,
    ]);
    const previous = (
      await db.query(
        `SELECT id FROM ${schema}.dashboard_csv_imports WHERE channel=$1 AND file_hash=$2`,
        [channel, parsed.hash],
      )
    ).rows[0];
    let reclassified = 0;
    const classifyExisting = async () => {
      if (category === "unclassified") return;
      for (let i = 0; i < parsed.records.length; i += 2000) {
        const result = await db.query(
          `UPDATE ${schema}.historico_chatguru SET billing_category=$1 WHERE chave_importacao=ANY($2::text[]) AND billing_category<>$1`,
          [category, parsed.records.slice(i, i + 2000).map((r) => r.key)],
        );
        reclassified += result.rowCount ?? 0;
      }
    };
    if (previous) {
      await classifyExisting();
      await db.query("COMMIT");
      return {
        ...parsed.summary,
        inserted: 0,
        skipped: parsed.records.length,
        alreadyImported: true,
        reclassified,
      };
    }
    let inserted = 0;
    for (let i = 0; i < parsed.records.length; i += 250) {
      const values: unknown[] = [];
      const tuples = parsed.records.slice(i, i + 250).map((r) => {
        const fields = [
          r.key,
          r.chat,
          r.client,
          archive(r.phone, env.ARCHIVE_ENCRYPTION_KEY!),
          r.author,
          r.type,
          archive(r.message, env.ARCHIVE_ENCRYPTION_KEY!),
          archive(r.link, env.ARCHIVE_ENCRYPTION_KEY!),
          r.sentAt,
          filename,
          channel,
          r.status,
          r.createdAt,
          r.billingCategory,
        ];
        const slots = fields.map((v) => {
          values.push(v);
          return "$" + values.length;
        });
        return "(" + slots.join(",") + ")";
      });
      const result = await db.query(
        `INSERT INTO ${schema}.historico_chatguru(chave_importacao,chat_id,contato_nome,telefone,autor,tipo,texto,url_arquivo,enviado_em,arquivo_origem,canal,status,criado_em_origem,billing_category) VALUES ${tuples.join(",")} ON CONFLICT(chave_importacao) DO NOTHING`,
        values,
      );
      inserted += result.rowCount ?? 0;
    }
    await classifyExisting();
    await db.query(
      `INSERT INTO ${schema}.dashboard_csv_imports(id,channel,file_hash,filename,rows_total,rows_inserted,from_day,to_day,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        channel,
        parsed.hash,
        filename,
        parsed.records.length,
        inserted,
        parsed.summary.from,
        parsed.summary.to,
        userId,
      ],
    );
    await db.query("COMMIT");
    return {
      ...parsed.summary,
      inserted,
      skipped: parsed.records.length - inserted,
      alreadyImported: false,
      reclassified,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function importHistory() {
  await prepareWarehouse();
  return (
    await warehouse!.query(
      `SELECT channel,filename,rows_total,rows_inserted,from_day::text,to_day::text,created_at FROM ${schema}.dashboard_csv_imports ORDER BY created_at DESC LIMIT 20`,
    )
  ).rows;
}
