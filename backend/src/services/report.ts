import { source } from "../config/db.js";
import { env } from "../config/env.js";
import type { User } from "./users.js";
export type Filters = {
  from: string;
  to: string;
  group: "employee" | "conversation" | "client";
  page: number;
};
export function centsMilli(sent: number) {
  return sent * 35;
}
const demoRows = Array.from({ length: 120 }, (_, i) => ({
  id: String(i + 1),
  day: new Date(Date.now() - (i % 28) * 86400000).toISOString().slice(0, 10),
  employee: i % 3 === 0 ? "Bruno Lima" : "Ana Souza",
  email: i % 3 === 0 ? "bruno@example.test" : "ana@example.test",
  client: "Cliente " + ((i % 8) + 1),
  conversation: String((i % 12) + 1),
  sent: 3 + (i % 17),
  received: 2 + (i % 9),
}));
export async function report(user: User, f: Filters) {
  if (env.DEMO_MODE) {
    const rows = demoRows.filter(
      (r) =>
        (user.role === "admin" || r.email === user.email) &&
        r.day >= f.from &&
        r.day <= f.to,
    );
    const map = new Map<string, any>();
    for (const r of rows) {
      const id =
        f.group === "employee"
          ? r.email
          : f.group === "client"
            ? r.client
            : r.conversation;
      const label =
        f.group === "employee"
          ? r.employee
          : f.group === "client"
            ? r.client
            : "Atendimento #" + r.conversation;
      const v = map.get(id) || { id, label, sent: 0, received: 0 };
      v.sent += r.sent;
      v.received += r.received;
      map.set(id, v);
    }
    const all = [...map.values()]
      .sort((a, b) => b.sent - a.sent)
      .map((r) => ({ ...r, costMillis: centsMilli(r.sent) }));
    const daily = new Map<string, number>();
    rows.forEach((r) => daily.set(r.day, (daily.get(r.day) || 0) + r.sent));
    return {
      demo: true,
      unitCostMillis: 35,
      totals: {
        sent: rows.reduce((s, r) => s + r.sent, 0),
        received: rows.reduce((s, r) => s + r.received, 0),
        costMillis: centsMilli(rows.reduce((s, r) => s + r.sent, 0)),
      },
      daily: [...daily].sort().map(([day, sent]) => ({ day, sent })),
      rows: all.slice((f.page - 1) * 20, f.page * 20),
      total: all.length,
      page: f.page,
    };
  }
  const identity =
    f.group === "employee"
      ? "COALESCE(lower(c.responsavel_email),'sem-responsavel')"
      : f.group === "client"
        ? "ct.id::text"
        : "c.id::text";
  const label =
    f.group === "employee"
      ? "COALESCE(c.responsavel_nome,'Sem responsável')"
      : f.group === "client"
        ? "COALESCE(ct.nome,'Cliente #' || ct.id::text)"
        : "'Atendimento #' || c.id::text";
  const base = `FROM public.mensagens m JOIN public.conversas c ON c.id=m.conversa_id JOIN public.contatos ct ON ct.id=c.contato_id WHERE COALESCE(m.data_origem,m.registrado_em)>=$1::date::timestamp AT TIME ZONE 'America/Sao_Paulo' AND COALESCE(m.data_origem,m.registrado_em)<($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo' AND ($3::boolean OR lower(c.responsavel_email)=$4)`;
  const params = [
    f.from,
    f.to,
    user.role === "admin",
    user.email,
    env.OUTGOING_DIRECTION,
    env.SENT_STATUSES.split(",").map((s) => s.trim()),
    env.RECEIVED_DIRECTION,
  ];
  const counts =
    "COUNT(*) FILTER(WHERE m.direcao=$5 AND m.status=ANY($6::text[]))::int AS sent,COUNT(*) FILTER(WHERE m.direcao=$7)::int AS received";
  const [totals, groups, daily] = await Promise.all([
    source!.query("SELECT " + counts + " " + base, params),
    source!.query(
      `SELECT ${identity} AS id,${label} AS label,${counts},COUNT(*) OVER()::int AS total ${base} GROUP BY 1,2 ORDER BY sent DESC,id LIMIT 20 OFFSET $8`,
      [...params, (f.page - 1) * 20],
    ),
    source!.query(
      `SELECT (COALESCE(m.data_origem,m.registrado_em) AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,${counts} ${base} GROUP BY 1 ORDER BY 1`,
      params,
    ),
  ]);
  const t = totals.rows[0];
  return {
    demo: false,
    unitCostMillis: 35,
    totals: { ...t, costMillis: centsMilli(t.sent) },
    daily: daily.rows.map(({ day, sent }) => ({ day, sent })),
    rows: groups.rows.map(({ total, ...r }) => ({
      ...r,
      costMillis: centsMilli(r.sent),
    })),
    total: groups.rows[0]?.total ?? 0,
    page: f.page,
  };
}
