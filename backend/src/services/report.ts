import { source } from "../config/db.js";
import { env } from "../config/env.js";
import type { User } from "./users.js";
import { pricing, costCounts, priced } from "./pricing.js";
export type Filters = {
  from: string;
  to: string;
  group: "employee" | "conversation" | "client";
  page: number;
  dataSource?: "history" | "workflow";
  channel?: string;
  author?: string;
  type?: string;
  status?: string;
};
export const centsMilli = (sent: number) => sent * 35;
type Event = {
  employeeId: string;
  employee: string;
  email: string;
  clientId: string;
  client: string;
  conversation: string;
  channel: string;
  day: string;
  type: string;
  status: string;
  direction: string;
};
const demo: Event[] = Array.from({ length: 150 }, (_, i) => ({
  employeeId: i % 3 === 0 ? "bruno@example.test" : "ana@example.test",
  employee: i % 3 === 0 ? "Bruno Lima" : "Ana Souza",
  email: i % 3 === 0 ? "bruno@example.test" : "ana@example.test",
  clientId: "cliente-" + (i % 8),
  client: "Cliente " + ((i % 8) + 1),
  conversation: String((i % 12) + 1),
  channel: "2998",
  day: new Date(Date.now() - (i % 28) * 86400000).toISOString().slice(0, 10),
  type: ["chat", "audio", "image", "document", "template", "video"][i % 6],
  status: i % 15 === 0 ? "erro" : "enviada",
  direction: "saida",
}));
export function aggregateDemo(user: User, f: Filters) {
  const records = demo.filter(
    (r) =>
      (user.role === "admin" || r.email === user.email) &&
      r.day >= f.from &&
      r.day <= f.to &&
      (!f.channel || r.channel === f.channel) &&
      (!f.author || r.employee === f.author) &&
      (!f.type || r.type === f.type) &&
      (!f.status || r.status === f.status),
  );
  const groups = new Map<string, any>(),
    days = new Map<string, any>(),
    types = new Map<string, any>(),
    statuses = new Map<string, number>();
  const sent = (r: Event) =>
    r.direction === env.OUTGOING_DIRECTION &&
    env.SENT_STATUSES.split(",").includes(r.status);
  for (const r of records) {
    const id =
      f.group === "employee"
        ? r.employeeId
        : f.group === "client"
          ? r.clientId
          : r.conversation;
    const label =
      f.group === "employee"
        ? r.employee
        : f.group === "client"
          ? r.client
          : "Chat #" + r.conversation;
    const g = groups.get(id) || {
      id,
      label,
      sent: 0,
      received: 0,
      errors: 0,
      records: 0,
      costMillis: 0,
    };
    g.records++;
    g.sent += +sent(r);
    g.errors += +(r.status === "erro");
    g.received += +(r.direction === env.RECEIVED_DIRECTION);
    g.costMillis = centsMilli(g.sent);
    groups.set(id, g);
    const d = days.get(r.day) || { day: r.day, sent: 0, errors: 0, records: 0 };
    d.records++;
    d.sent += +sent(r);
    d.errors += +(r.status === "erro");
    days.set(r.day, d);
    const t = types.get(r.type) || {
      type: r.type,
      sent: 0,
      errors: 0,
      records: 0,
    };
    t.records++;
    t.sent += +sent(r);
    t.errors += +(r.status === "erro");
    types.set(r.type, t);
    statuses.set(r.status, (statuses.get(r.status) || 0) + 1);
  }
  const rows = [...groups.values()].sort(
      (a, b) => b.sent - a.sent || a.id.localeCompare(b.id),
    ),
    n = records.filter(sent).length;
  return {
    demo: true,
    dataSource: f.dataSource ?? "history",
    pricing,
    categories: [
      {
        category: "unclassified",
        sent: n,
        records: records.length,
        costUnits: n * 350,
        costMillis: n * 35,
        unpriced: 0,
        unclassified: n,
      },
    ],
    totals: {
      sent: n,
      received: records.filter((r) => r.direction === env.RECEIVED_DIRECTION)
        .length,
      errors: records.filter((r) => r.status === "erro").length,
      records: records.length,
      chats: new Set(records.filter(sent).map((r) => r.conversation)).size,
      employees: new Set(records.filter(sent).map((r) => r.employeeId)).size,
      costMillis: centsMilli(n),
    },
    daily: [...days.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({ ...r, costMillis: r.sent * 35 })),
    types: [...types.values()].map((r) => ({ ...r, costMillis: r.sent * 35 })),
    statuses: [...statuses].map(([status, records]) => ({ status, records })),
    rows: rows.slice((f.page - 1) * 20, f.page * 20),
    total: rows.length,
    page: f.page,
    accessNotice: null,
  };
}
export function buildReportQuery(user: User, f: Filters) {
  const schema = '"' + env.SOURCE_SCHEMA + '"',
    history = f.dataSource !== "workflow";
  const events = history
    ? `SELECT h.autor AS employee_id,COALESCE(h.autor,'Sem autor') AS employee,NULL::text AS email,h.canal||':'||h.chat_id AS client_id,COALESCE(h.contato_nome,'Cliente sem nome') AS client,h.canal||':'||h.chat_id AS conversation,h.canal AS channel,COALESCE(h.enviado_em,h.criado_em_origem) AS occurred_at,h.tipo AS type,h.status,COALESCE(to_jsonb(h)->>'billing_category','unclassified') AS billing_category,'saida'::text AS direction FROM ${schema}.historico_chatguru h`
    : `SELECT COALESCE(lower(c.responsavel_email),'sem-responsavel') AS employee_id,COALESCE(c.responsavel_nome,'Sem responsável') AS employee,lower(c.responsavel_email) AS email,ct.id::text AS client_id,COALESCE(ct.nome,'Cliente #'||ct.id::text) AS client,c.id::text AS conversation,c.phone_id AS channel,COALESCE(m.data_origem,m.registrado_em) AS occurred_at,m.tipo AS type,m.status,'unclassified'::text AS billing_category,m.direcao AS direction FROM ${schema}.mensagens m JOIN ${schema}.conversas c ON c.id=m.conversa_id JOIN ${schema}.contatos ct ON ct.id=c.contato_id`;
  const base = `WITH events AS (${events}), filtered AS (SELECT * FROM events WHERE occurred_at>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND occurred_at<(($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND ($3::boolean OR ${history ? "employee_id=$4" : "email=$4"}) AND ($5::text IS NULL OR channel=$5) AND ($6::text IS NULL OR employee=$6) AND ($7::text IS NULL OR type=$7) AND ($8::text IS NULL OR status=$8))`;
  return {
    base,
    params: [
      f.from,
      f.to,
      user.role === "admin",
      history ? (user.historical_author ?? null) : user.email,
      f.channel || null,
      f.author || null,
      f.type || null,
      f.status || null,
      env.OUTGOING_DIRECTION,
      env.SENT_STATUSES.split(",").map((s) => s.trim()),
      env.RECEIVED_DIRECTION,
    ],
  };
}
export async function report(user: User, f: Filters) {
  if (env.DEMO_MODE) return aggregateDemo(user, f);
  const { base, params } = buildReportQuery(user, f);
  const counts =
    "COUNT(*) FILTER(WHERE direction=$9 AND status=ANY($10::text[]))::int AS sent,COUNT(*) FILTER(WHERE direction=$11)::int AS received,COUNT(*) FILTER(WHERE status='erro')::int AS errors,COUNT(*)::int AS records," +
    costCounts("billing_category", "direction=$9 AND status=ANY($10::text[])");
  const group =
      f.group === "employee"
        ? "employee_id"
        : f.group === "client"
          ? "client_id"
          : "conversation",
    label =
      f.group === "employee"
        ? "employee"
        : f.group === "client"
          ? "client"
          : "'Chat #'||conversation";
  const db = await source!.connect();
  try {
    // One SQL statement gives every aggregate the same snapshot without network round trips.
    const result = (
      await db.query(
        base.replace("filtered AS (", "filtered AS MATERIALIZED (") +
          `
      , grouped AS (SELECT ${group} AS id,MAX(${label}) AS label,${counts} FROM filtered GROUP BY 1),
      paged AS (SELECT * FROM grouped ORDER BY sent DESC,id NULLS LAST LIMIT 20 OFFSET $12),
      daily AS (SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,${counts} FROM filtered GROUP BY 1),
      types AS (SELECT type,${counts} FROM filtered GROUP BY 1),
      statuses AS (SELECT status,COUNT(*)::int AS records FROM filtered GROUP BY 1),
      categories AS (SELECT billing_category AS category,${counts} FROM filtered GROUP BY 1),
      totals AS (SELECT ${counts},COUNT(DISTINCT conversation) FILTER(WHERE direction=$9 AND status=ANY($10::text[]))::int AS chats,COUNT(DISTINCT employee_id) FILTER(WHERE direction=$9 AND status=ANY($10::text[]))::int AS employees FROM filtered)
      SELECT (SELECT row_to_json(t) FROM totals t) AS totals,
      COALESCE((SELECT json_agg(g ORDER BY sent DESC,id NULLS LAST) FROM paged g),'[]'::json) AS groups,
      COALESCE((SELECT json_agg(d ORDER BY day) FROM daily d),'[]'::json) AS daily,
      COALESCE((SELECT json_agg(t ORDER BY sent DESC,type) FROM types t),'[]'::json) AS types,
      COALESCE((SELECT json_agg(s ORDER BY records DESC,status) FROM statuses s),'[]'::json) AS statuses,
      COALESCE((SELECT json_agg(c ORDER BY category) FROM categories c),'[]'::json) AS categories,
      (SELECT COUNT(*)::int FROM grouped) AS total`,
        [...params, (f.page - 1) * 20],
      )
    ).rows[0];
    return {
      demo: false,
      dataSource: f.dataSource ?? "history",
      pricing,
      totals: priced(result.totals),
      categories: result.categories.map(priced),
      daily: result.daily.map(priced),
      types: result.types.map(priced),
      statuses: result.statuses,
      rows: result.groups.map(priced),
      total: result.total,
      page: f.page,
      accessNotice:
        user.role !== "admin" &&
        f.dataSource !== "workflow" &&
        !user.historical_author
          ? "Seu administrador precisa vincular seu usuário ao autor do relatório ChatGuru."
          : null,
    };
  } finally {
    db.release();
  }
}
