import { useEffect, useState } from "react";
type Api = (path: string, options?: RequestInit) => Promise<any>;
type Row = { channel: string; marketing: string; utility: string; authentication: string; service: string; received: string; previousService: string };
const empty = (channel: string): Row => ({ channel, marketing: "0", utility: "0", authentication: "0", service: "", received: "", previousService: "" });
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const usd = (value: number) => "US$ " + value.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fields = [ ["marketing", "Marketing"], ["utility", "Utilidade"], ["authentication", "Autenticação"],
  ["service", "Serviço"], ["received", "Recebidas"], ["previousService", "Serviço antes do período, no mesmo mês"] ] as const;

export function CostCalculator({ api, from, to, channel }: { api: Api; from: string; to: string; channel: string }) {
  const [rows, setRows] = useState<Row[]>([empty("2998"), empty("0061")]);
  const [exchangeRate, setExchangeRate] = useState("5.45");
  const [cap, setCap] = useState("75");
  const [previousFlow, setPreviousFlow] = useState("");
  const [starting, setStarting] = useState("");
  const [ending, setEnding] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setResult(null); setError(""); setRows([empty("2998"), empty("0061")]); setPreviousFlow(""); }, [from, to, channel]);
  const selected = rows.filter(row => !channel || row.channel === channel);
  async function calculate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const r = await api("/billing/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        from, to, exchangeRate: Number(exchangeRate), gupshupCapUsd: Number(cap), previousFlow: Number(previousFlow),
        startingBalanceUsd: Number(starting), endingBalanceUsd: Number(ending),
        channels: selected.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "channel" ? value : Number(value)]))),
      }) }); setResult(r);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const clear = () => setResult(null);
  return <section className="panel cost-calculator">
    <h2>Calculadora e conciliação de créditos</h2>
    <p>Simule o período selecionado acima. Tarifas do código fornecido: marketing US$ 0,0625; utilidade, autenticação e serviço US$ 0,0068; Gupshup US$ 0,001 por enviada ou recebida.</p>
    <p className="notice">Informe volumes sem sobreposição, incluindo os envios do bot. Diálogos e mensagens podem representar o mesmo envio. Dados ausentes não significam zero. Esta simulação não altera o banco nem confirma a categoria de uma mensagem.</p>
    <form onSubmit={calculate} onChange={clear}>
      <fieldset disabled={busy}>
        <legend>Mensagens por número</legend>
        <p className="fine-print">A franquia de serviço é de 1.000 por número e mês. Informe o serviço usado desde o dia 1 até antes deste período. Use zero somente se confirmado. Para analisar outro mês, troque as datas e informe novamente os volumes.</p>
        {selected.map(row => <div key={row.channel} className="calculator-channel">
          <h3>Número {row.channel}</h3>
          <div className="calculator-fields">{fields.map(([key, label]) => <label key={key}>{label}
            <input required type="number" min="0" max="100000000" step="1" value={row[key]}
              onChange={e => setRows(all => all.map(r => r.channel === row.channel ? { ...r, [key]: e.target.value } : r))} />
          </label>)}</div>
        </div>)}
        <div className="calculator-fields">
          <label>Cotação informada (R$ por US$)<input required type="number" min="0.000001" max="100" step="any" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} /></label>
          <label>Teto mensal do grupo Gupshup (US$)<input required type="number" min="0" max="10000" step="any" value={cap} onChange={e => setCap(e.target.value)} /></label>
          <label>Enviadas + recebidas antes do período, no mês (grupo Gupshup)<input required type="number" min="0" max="100000000" step="1" value={previousFlow} onChange={e => setPreviousFlow(e.target.value)} /></label>
          <label>Saldo inicial (US$)<input required type="number" min="0" max="1000000" step="0.000001" value={starting} onChange={e => setStarting(e.target.value)} /></label>
          <label>Saldo final (US$)<input required type="number" min="0" max="1000000" step="0.000001" value={ending} onChange={e => setEnding(e.target.value)} /></label>
        </div>
        <p className="fine-print">R$ 5,45 é apenas o padrão do código, não uma cotação atual. O teto de US$ 75 simula um único grupo de cobrança. Confirme se os números compartilham esse teto; se forem grupos separados, calcule cada um separadamente. O teto já consumido no mês é descontado antes de calcular a taxa deste período. Use saldos e volumes com os mesmos horários.</p>
        <button type="submit">{busy ? "Calculando…" : "Calcular e comparar com o saldo"}</button>
      </fieldset>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <div role="status">
      <div className="table-scroll"><table><thead><tr><th>Número</th><th>Enviadas</th><th>Serviço grátis</th><th>Serviço cobrado</th><th>Meta (USD)</th></tr></thead>
        <tbody>{result.channels.map((r: any) => <tr key={r.channel}><td>{r.channel}</td><td>{r.sent}</td><td>{r.freeService}</td><td>{r.billedService}</td><td>{usd(r.metaUsd)}</td></tr>)}</tbody></table></div>
      <div className="intelligence-kpis">
        <div><span>Meta</span><strong>{usd(result.metaUsd)}</strong></div>
        <div><span>Gupshup · enviadas + recebidas</span><strong>{usd(result.gupshupUsd)}</strong></div>
        <div><span>Total simulado</span><strong>{usd(result.totalUsd)}</strong><span>{brl(result.totalBrl)}</span></div>
        <div><span>Consumo do saldo</span><strong>{usd(result.consumedUsd)}</strong><span>{brl(result.consumedBrl)}</span></div>
        <div><span>Simulação menos saldo consumido</span><strong>{usd(result.differenceUsd)}</strong><span>{brl(result.differenceBrl)}</span></div>
      </div>
      <p className="fine-print">Diferença positiva: simulação acima do consumo. Negativa: abaixo. Coincidência numérica não comprova categoria nem cobrança; isenções especiais e ajustes de carteira não estão incluídos.</p>
    </div>}
  </section>;
}
