import { parse } from "csv-parse/sync";
import { createHash, createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { warehouse } from "../config/db.js";
import { env } from "../config/env.js";
import { schema, prepareWarehouse } from "./imports.js";
import { csvDate } from "./csv.js";
import { pricing, rateSql, type BillingCategory } from "./pricing.js";
import { fail } from "./errors.js";
import type { Period } from "./intelligence.js";
let initialized: Promise<void> | undefined;
async function setup() {
  await prepareWarehouse();
  const db = await warehouse!.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "dashboard-dialogues-setup:" + env.SOURCE_SCHEMA,
    ]);
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.dashboard_dialogue_events(event_key text PRIMARY KEY,dialogue text NOT NULL,chat_fingerprint text NOT NULL,trigger text NOT NULL,occurred_at timestamptz NOT NULL)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS dashboard_dialogue_period_idx ON ${schema}.dashboard_dialogue_events(occurred_at)`,
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.dashboard_dialogue_rules(dialogue text PRIMARY KEY,category text NOT NULL CHECK(category IN ('marketing','service','utility','authentication','unclassified')),messages_per_execution integer NOT NULL CHECK(messages_per_execution BETWEEN 0 AND 20),channel text CHECK(channel IN ('2998','0061')),confirmed_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),basis text NOT NULL)`,
    );
    await db.query(
      `INSERT INTO ${schema}.dashboard_dialogue_rules(dialogue,category,messages_per_execution,basis) VALUES('Mensagem Inicial','marketing',1,'Confirmação do responsável: um envio por acionamento e categoria marketing') ON CONFLICT DO NOTHING`,
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function prepareDialogues() {
  if (!initialized)
    initialized = setup().catch((e) => {
      initialized = undefined;
      throw e;
    });
  return initialized;
}
export function parseDialogues(buffer: Buffer) {
  if (!env.ARCHIVE_ENCRYPTION_KEY)
    fail(503, "Configure ARCHIVE_ENCRYPTION_KEY para importar diálogos.");
  let data: string[][];
  try {
    data = parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer), {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 10000,
    });
  } catch {
    fail(400, "CSV de diálogos inválido. Exporte em UTF-8.");
  }
  if (
    JSON.stringify(data![0]) !==
    JSON.stringify([
      "Diálogo",
      "Chat",
      "Número",
      "Acionado Por",
      "Data Acionado",
    ])
  )
    fail(
      400,
      "Use o CSV original de Diálogos Executados, com as cinco colunas.",
    );
  if (data!.length < 2 || data!.length > 50001)
    fail(400, "Envie de 1 a 50.000 acionamentos.");
  const seen = new Map<string, number>();
  let identical = 0;
  const rows = data!.slice(1).map((r, i) => {
    if (
      r.length !== 5 ||
      r.some((v) => v.includes("\0")) ||
      !r[0] ||
      r[0].length > 150 ||
      !r[2] ||
      r[3].length > 80
    )
      fail(400, `Linha ${i + 2}: diálogo ou contato inválido.`);
    const canonical = JSON.stringify(r),
      ordinal = (seen.get(canonical) ?? 0) + 1;
    seen.set(canonical, ordinal);
    if (ordinal > 1) identical++;
    const hmac = (v: string) =>
      createHmac("sha256", Buffer.from(env.ARCHIVE_ENCRYPTION_KEY!, "hex"))
        .update(v)
        .digest("hex");
    const occurredAt = csvDate(r[4], i + 2);
    if (!occurredAt) fail(400, `Linha ${i + 2}: data ausente.`);
    return {
      key: "dialogue:" + hmac(canonical + ":" + ordinal),
      dialogue: r[0],
      chat: hmac("contact:" + r[2]),
      trigger: r[3],
      occurredAt,
      day: occurredAt.slice(0, 10),
    };
  });
  const days = rows.map((r) => r.day).sort();
  return {
    hash: createHash("sha256").update(buffer).digest("hex"),
    rows,
    identical,
    from: days[0],
    to: days.at(-1)!,
  };
}
export async function previewDialogues(buffer: Buffer, userId: string) {
  const p = parseDialogues(buffer);
  await prepareDialogues();
  let existing = 0;
  for (let i = 0; i < p.rows.length; i += 2000)
    existing += Number(
      (
        await warehouse!.query(
          `SELECT COUNT(*)::int AS n FROM ${schema}.dashboard_dialogue_events WHERE event_key=ANY($1::text[])`,
          [p.rows.slice(i, i + 2000).map((r) => r.key)],
        )
      ).rows[0].n,
    );
  const marketing = p.rows.filter(
    (r) => r.dialogue === "Mensagem Inicial",
  ).length;
  return {
    rows: p.rows.length,
    existing,
    newRows: p.rows.length - existing,
    identicalRows: p.identical,
    from: p.from,
    to: p.to,
    initialExecutions: marketing,
    previewToken: jwt.sign({ hash: p.hash }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "15m",
      issuer: "dialogue-preview",
      audience: "dialogue-import",
      subject: userId,
    }),
  };
}
export async function importDialogues(
  buffer: Buffer,
  token: string,
  userId: string,
) {
  const p = parseDialogues(buffer);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "dialogue-preview",
      audience: "dialogue-import",
      subject: userId,
    }) as jwt.JwtPayload;
    if (payload.hash !== p.hash) throw new Error();
  } catch {
    fail(400, "Prévia expirada ou CSV alterado. Verifique novamente.");
  }
  await prepareDialogues();
  const db = await warehouse!.connect();
  let inserted = 0;
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "dashboard-dialogues-import",
    ]);
    for (let i = 0; i < p.rows.length; i += 250) {
      const values: unknown[] = [];
      const tuples = p.rows.slice(i, i + 250).map(
        (r) =>
          "(" +
          [r.key, r.dialogue, r.chat, r.trigger, r.occurredAt]
            .map((v) => {
              values.push(v);
              return "$" + values.length;
            })
            .join(",") +
          ")",
      );
      const r = await db.query(
        `INSERT INTO ${schema}.dashboard_dialogue_events(event_key,dialogue,chat_fingerprint,trigger,occurred_at) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
        values,
      );
      inserted += r.rowCount ?? 0;
    }
    await db.query("COMMIT");
    return {
      rows: p.rows.length,
      inserted,
      skipped: p.rows.length - inserted,
      identicalRows: p.identical,
    };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function dialogueReport(f: Period) {
  if (env.DEMO_MODE)
    return {
      rows: [],
      daily: [],
      totals: {
        executions: 0,
        sent: 0,
        pendingExecutions: 0,
        unpriced: 0,
        unknownChannelSent: 0,
        costUnits: 0,
        costMillis: 0,
      },
      pricing,
      alternativeSource: true,
    };
  await prepareDialogues();
  const db = await warehouse!.connect();
  const base = `WITH events AS(SELECT e.dialogue,e.occurred_at,r.channel,r.category,r.messages_per_execution FROM ${schema}.dashboard_dialogue_events e LEFT JOIN ${schema}.dashboard_dialogue_rules r ON r.dialogue=e.dialogue WHERE e.occurred_at>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND e.occurred_at<(($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND ($3::text IS NULL OR r.channel=$3))`;
  const counts = `COUNT(*)::int AS executions,COALESCE(SUM(messages_per_execution),0)::int AS sent,COUNT(*) FILTER(WHERE category IS NULL OR category='unclassified')::int AS pending_executions,COALESCE(SUM(messages_per_execution) FILTER(WHERE channel IS NULL),0)::int AS unknown_channel_sent,COALESCE(SUM(messages_per_execution) FILTER(WHERE category IS NOT NULL AND ${rateSql("category")} IS NULL),0)::int AS unpriced,COALESCE(SUM(messages_per_execution*${rateSql("category")}) FILTER(WHERE category<>'unclassified'),0)::bigint AS cost_units`;
  const params = [f.from, f.to, f.channel ?? null];
  const convert = (r: any) => {
    const { cost_units, pending_executions, unknown_channel_sent, ...rest } = r;
    const costUnits = Number(cost_units);
    return {
      ...rest,
      pendingExecutions: pending_executions,
      unknownChannelSent: unknown_channel_sent,
      costUnits,
      costMillis: costUnits / 10,
    };
  };
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const rows = (
      await db.query(
        base +
          ` SELECT dialogue,category,channel,messages_per_execution,${counts} FROM events GROUP BY 1,2,3,4 ORDER BY executions DESC,dialogue`,
        params,
      )
    ).rows.map(convert);
    const daily = (
      await db.query(
        base +
          ` SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,${counts} FROM events GROUP BY 1 ORDER BY 1`,
        params,
      )
    ).rows.map(convert);
    const totals = convert(
      (await db.query(base + ` SELECT ${counts} FROM events`, params)).rows[0],
    );
    await db.query("COMMIT");
    return { rows, daily, totals, pricing, alternativeSource: true };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function listRules() {
  await prepareDialogues();
  return (
    await warehouse!.query(
      `SELECT dialogue,category,messages_per_execution,channel,basis FROM ${schema}.dashboard_dialogue_rules ORDER BY dialogue`,
    )
  ).rows;
}
export async function saveRule(
  dialogue: string,
  category: BillingCategory,
  quantity: number,
  channel: string | null,
  userId: string,
) {
  await prepareDialogues();
  await warehouse!.query(
    `INSERT INTO ${schema}.dashboard_dialogue_rules(dialogue,category,messages_per_execution,channel,confirmed_by,basis) VALUES($1,$2,$3,$4,$5,'Confirmação manual do administrador') ON CONFLICT(dialogue) DO UPDATE SET category=EXCLUDED.category,messages_per_execution=EXCLUDED.messages_per_execution,channel=EXCLUDED.channel,confirmed_by=EXCLUDED.confirmed_by,basis=EXCLUDED.basis,updated_at=now()`,
    [dialogue, category, quantity, channel, userId],
  );
}
