import { z } from "zod";

const count = z.number().int().min(0).max(100_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  "Data inválida",
);
export const calculatorInput = z.object({
  from: date,
  to: date,
  exchangeRate: z.number().positive().max(100),
  gupshupCapUsd: z.number().min(0).max(10000),
  previousFlow: count,
  startingBalanceUsd: z.number().min(0).max(1_000_000),
  endingBalanceUsd: z.number().min(0).max(1_000_000),
  channels: z.array(z.object({
    channel: z.enum(["2998", "0061"]),
    marketing: count,
    utility: count,
    authentication: count,
    service: count,
    received: count,
    previousService: count,
  }).strict()).min(1).max(2),
}).strict().superRefine((value, ctx) => {
  if (value.from > value.to || value.from.slice(0, 7) !== value.to.slice(0, 7) || value.from < "2026-10-01")
    ctx.addIssue({ code: "custom", path: ["from"], message: "Use um período em um único mês, a partir de outubro de 2026" });
  if (new Set(value.channels.map(c => c.channel)).size !== value.channels.length)
    ctx.addIssue({ code: "custom", path: ["channels"], message: "Número repetido" });
  if (value.from.endsWith("-01") && (value.previousFlow !== 0 || value.channels.some(c => c.previousService !== 0)))
    ctx.addIssue({ code: "custom", path: ["previousFlow"], message: "No início do mês o consumo anterior deve ser zero" });
});
export type CalculatorInput = z.infer<typeof calculatorInput>;
// USD em milionésimos evita arredondamento por mensagem.
export const calculatorRates = { marketing: 62500, utility: 6800, authentication: 6800, service: 6800, gupshup: 1000 };
export function calculateBilling(input: CalculatorInput) {
  const channels = input.channels.map(c => {
    const freeService = Math.min(c.service, Math.max(0, 1000 - c.previousService));
    const billedService = c.service - freeService;
    const metaMicros = c.marketing * calculatorRates.marketing + c.utility * calculatorRates.utility
      + c.authentication * calculatorRates.authentication + billedService * calculatorRates.service;
    return { ...c, freeService, billedService, metaUsd: metaMicros / 1e6, metaMicros,
      sent: c.marketing + c.utility + c.authentication + c.service };
  });
  const sent = channels.reduce((s, c) => s + c.sent, 0);
  const received = channels.reduce((s, c) => s + c.received, 0);
  const capMicros = Math.round(input.gupshupCapUsd * 1e6);
  const previousFee = Math.min(capMicros, input.previousFlow * calculatorRates.gupshup);
  const cumulativeFee = Math.min(capMicros, (input.previousFlow + sent + received) * calculatorRates.gupshup);
  const gupshupMicros = cumulativeFee - previousFee;
  const metaMicros = channels.reduce((s, c) => s + c.metaMicros, 0);
  const totalMicros = metaMicros + gupshupMicros;
  const consumedMicros = Math.round(input.startingBalanceUsd * 1e6) - Math.round(input.endingBalanceUsd * 1e6);
  return { from: input.from, to: input.to, exchangeRate: input.exchangeRate, channels, sent, received,
    ratesUsd: Object.fromEntries(Object.entries(calculatorRates).map(([k, v]) => [k, v / 1e6])),
    metaUsd: metaMicros / 1e6, gupshupUsd: gupshupMicros / 1e6, totalUsd: totalMicros / 1e6,
    totalBrl: totalMicros / 1e6 * input.exchangeRate, consumedUsd: consumedMicros / 1e6,
    consumedBrl: consumedMicros / 1e6 * input.exchangeRate,
    differenceUsd: (totalMicros - consumedMicros) / 1e6,
    differenceBrl: (totalMicros - consumedMicros) / 1e6 * input.exchangeRate,
    scope: "Simulação de um único grupo de cobrança Gupshup; não altera categorias nem comprova a fatura",
  };
}
