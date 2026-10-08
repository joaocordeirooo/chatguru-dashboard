export const categories = [
  "marketing",
  "service",
  "utility",
  "authentication",
  "unclassified",
] as const;
export type BillingCategory = (typeof categories)[number];
// Valores inteiros em décimos de milésimo de real: 1 real = 10.000 unidades.
export const pricing = {
  currency: "BRL",
  scale: 10000,
  marketing: {
    label: "Marketing",
    rateUnits: 3217,
    rateBrl: 0.3217,
    basis: "Tarifa informada pelo administrador",
  },
  service: {
    label: "Serviço",
    rateUnits: 350,
    rateBrl: 0.035,
    basis: "Referência provisória; não reconcilia franquias ou entrega",
  },
  utility: {
    label: "Utilidade",
    rateUnits: null,
    rateBrl: null,
    basis: "Tarifa não informada",
  },
  authentication: {
    label: "Autenticação",
    rateUnits: null,
    rateBrl: null,
    basis: "Tarifa não informada",
  },
  unclassified: {
    label: "Não identificada",
    rateUnits: 350,
    rateBrl: 0.035,
    basis: "Referência provisória anterior; categoria não confirmada",
  },
};
export function estimate(
  sent: number,
  category: BillingCategory = "unclassified",
) {
  const rate = pricing[category].rateUnits;
  return {
    costUnits: rate === null ? 0 : sent * rate,
    costMillis: rate === null ? 0 : (sent * rate) / 10,
    unpriced: rate === null ? sent : 0,
  };
}
export function rateSql(category: string) {
  return `CASE ${category} WHEN 'marketing' THEN 3217 WHEN 'service' THEN 350 WHEN 'unclassified' THEN 350 ELSE NULL END`;
}
export function costCounts(category: string, sentCondition: string) {
  const rate = rateSql(category);
  return `COALESCE(SUM(${rate}) FILTER(WHERE ${sentCondition}),0)::bigint AS cost_units,COUNT(*) FILTER(WHERE ${sentCondition} AND ${rate} IS NULL)::int AS unpriced,COUNT(*) FILTER(WHERE ${sentCondition} AND ${category}='unclassified')::int AS unclassified`;
}
export function priced(row: any) {
  const { cost_units, ...rest } = row;
  const units = Number(cost_units ?? 0);
  return { ...rest, costUnits: units, costMillis: units / 10 };
}
