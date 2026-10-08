import { useEffect, useState } from "react";
import {
  Sparkles,
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
type Api = (path: string, options?: RequestInit) => Promise<any>;
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 1000,
  );
const integer = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
}).format(new Date());
const objectives = [
  { value: "summary", label: "Panorama gerencial" },
  { value: "costs", label: "Custos e concentração" },
  { value: "errors", label: "Falhas de envio" },
  { value: "volume", label: "Volume e horários" },
  { value: "comparison", label: "Comparar canais e períodos" },
];
export function Intelligence({
  api,
  onImported,
}: {
  api: Api;
  onImported: () => void;
}) {
  const [config, setConfig] = useState<any>(null),
    [snapshot, setSnapshot] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]);
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [channel, setChannel] = useState("");
  const [uploadChannel, setUploadChannel] = useState("2998"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null),
    [objective, setObjective] = useState("summary"),
    [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState(""),
    [importing, setImporting] = useState(false),
    [analyzing, setAnalyzing] = useState(false),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const [fileVersion, setFileVersion] = useState(0);
  useEffect(() => {
    api("/intelligence/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [api]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSnapshot(null);
    setAnalysis(null);
    setError("");
    const q = new URLSearchParams({
      from,
      to,
      ...(channel ? { channel } : {}),
    });
    api("/intelligence/metrics?" + q)
      .then((r) => {
        if (active) setSnapshot(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, from, to, channel, revision]);
  useEffect(() => {
    if (!config || config.demo) return;
    let active = true;
    api("/intelligence/imports")
      .then((r) => {
        if (active) setHistory(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, config, revision]);
  async function sendFile(commit = false) {
    if (!file) return;
    setError("");
    setImporting(true);
    try {
      const q = new URLSearchParams({
        channel: uploadChannel,
        ...(commit ? { filename: file.name, token: preview.previewToken } : {}),
      });
      const r = await api(
        "/intelligence/imports/" + (commit ? "commit" : "preview") + "?" + q,
        { method: "POST", headers: { "Content-Type": "text/csv" }, body: file },
      );
      if (commit) {
        setResult(r);
        setPreview(null);
        setFile(null);
        setFileVersion((n) => n + 1);
        setRevision((n) => n + 1);
        onImported();
      } else {
        setPreview(r);
        setResult(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  async function generate() {
    setError("");
    setAnalyzing(true);
    setAnalysis(null);
    try {
      setAnalysis(
        await api("/intelligence/analyze", {
          method: "POST",
          body: JSON.stringify({
            from,
            to,
            ...(channel ? { channel } : {}),
            objective,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }
  const totals = snapshot?.current.totals;
  return (
    <div className="intelligence">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="panel import-panel">
        <div className="intelligence-heading">
          <FileSpreadsheet size={23} />
          <div>
            <h2>Importar mensagens do dia</h2>
            <p>
              Envie um CSV por número. Os registros novos serão somados ao
              histórico existente.
            </p>
          </div>
        </div>
        {!config?.importConfigured && (
          <p className="notice">
            {config?.demo
              ? "Importação indisponível na demonstração."
              : "Configure a chave de arquivamento no ambiente do backend para habilitar importações."}
          </p>
        )}
        <div className="import-controls">
          <label>
            Número de origem
            <select
              value={uploadChannel}
              disabled={importing}
              onChange={(e) => {
                setUploadChannel(e.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              <option value="2998">Final 2998</option>
              <option value="0061">Final 0061</option>
            </select>
          </label>
          <label>
            Arquivo CSV
            <input
              key={fileVersion}
              disabled={importing}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
          </label>
          <button
            disabled={
              !file ||
              importing ||
              !config?.importConfigured ||
              file.size > 15 * 1024 * 1024
            }
            onClick={() => sendFile()}
          >
            <Upload size={17} />
            {importing ? "Processando…" : "Verificar arquivo"}
          </button>
        </div>
        {file && file.size > 15 * 1024 * 1024 && (
          <p className="error">
            O arquivo excede 15 MB. Exporte um período menor.
          </p>
        )}
        {preview && (
          <div className="import-preview">
            <strong>
              Prévia · final {preview.channel} · {preview.from} a {preview.to}
            </strong>
            <div className="preview-stats">
              <span>{integer(preview.rows)} registros</span>
              <span>{integer(preview.newRows)} novos</span>
              <span>{integer(preview.existing)} já existentes</span>
              <span>{integer(preview.errors)} erros</span>
            </div>
            <p>
              Custo do arquivo completo: {money(preview.costMillis)}. Registros
              já existentes não serão somados novamente.
            </p>
            <button
              disabled={importing || analyzing}
              onClick={() => sendFile(true)}
            >
              <CheckCircle2 size={17} />
              Confirmar importação
            </button>
          </div>
        )}
        {result && (
          <p role="status" className="import-success">
            Importação concluída para {result.channel}:{" "}
            {integer(result.inserted)} novos registros e{" "}
            {integer(result.skipped)} já existentes. O histórico anterior foi
            preservado.
          </p>
        )}
        <p className="fine-print">
          Mesmo formato de final2998.csv · UTF-8 · até 15 MB / 50.000 linhas.
          Confira o número antes de confirmar: o CSV não identifica o canal
          remetente.
        </p>
      </div>
      <div className="filters panel intelligence-filters">
        <label>
          De
          <input
            type="date"
            value={from}
            disabled={analyzing}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            disabled={analyzing}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Canais
          <select
            value={channel}
            disabled={analyzing}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">2998 + 0061</option>
            <option value="2998">Final 2998</option>
            <option value="0061">Final 0061</option>
          </select>
        </label>
        <button
          disabled={loading || analyzing}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {loading && <p role="status">Calculando indicadores…</p>}
      {totals && (
        <>
          {snapshot.demo && (
            <p className="notice">Dados fictícios do modo demonstração.</p>
          )}
          <div className="intelligence-kpis">
            <div className="panel">
              <p>Enviadas</p>
              <strong>{integer(totals.sent)}</strong>
              <small>Envios confirmados no CSV</small>
            </div>
            <div className="panel">
              <p>Custo de referência</p>
              <strong>{money(totals.costMillis)}</strong>
              <small>R$ 0,035 por envio</small>
            </div>
            <div className="panel">
              <p>Erros de envio</p>
              <strong>{integer(totals.errors)}</strong>
              <small>
                {totals.records
                  ? ((totals.errors / totals.records) * 100).toFixed(2)
                  : "0"}
                % dos registros
              </small>
            </div>
            <div className="panel">
              <p>Chats com envio</p>
              <strong>{integer(totals.chats)}</strong>
              <small>
                {totals.chats ? (totals.sent / totals.chats).toFixed(1) : "0"}{" "}
                envios por chat
              </small>
            </div>
          </div>
          <div className="panel">
            <div className="intelligence-heading">
              <Sparkles size={24} />
              <div>
                <h2>Análise gerencial com IA</h2>
                <p>
                  Interpretação dos indicadores, hipóteses de melhoria e ações
                  para conferir.
                </p>
              </div>
            </div>
            <div className="analysis-controls">
              <label>
                O que analisar
                <select
                  value={objective}
                  disabled={analyzing}
                  onChange={(e) => {
                    setObjective(e.target.value);
                    setAnalysis(null);
                  }}
                >
                  {objectives.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={
                  analyzing ||
                  importing ||
                  loading ||
                  !totals.records ||
                  !config?.aiConfigured ||
                  config?.demo
                }
                onClick={generate}
              >
                <Sparkles size={17} />
                {analyzing ? "Gerando análise…" : "Gerar análise"}
              </button>
            </div>
            {!config?.aiConfigured && (
              <p className="notice">
                Para ativar, configure OPENAI_API_KEY somente no backend.
              </p>
            )}
            <p className="fine-print">
              Somente estatísticas são enviadas à IA. Autores e chats usam
              identificadores anônimos; textos, telefones, nomes de clientes e
              arquivos não são enviados. Cada nova análise utiliza a API;
              resultados idênticos são reaproveitados.
            </p>
            {analysis && (
              <article className="ai-answer">
                <div className="analysis-meta">
                  <span>
                    {analysis.cached ? "Análise reaproveitada" : "Nova análise"}{" "}
                    · {analysis.model}
                  </span>
                  <span>
                    {analysis.usage.inputTokens} tokens de entrada ·{" "}
                    {analysis.usage.outputTokens} de saída
                  </span>
                </div>
                <div className="analysis-text">{analysis.text}</div>
                <p className="fine-print">
                  Interpretação automática: confira as evidências antes de tomar
                  decisões. Gerada em{" "}
                  {new Date(analysis.generatedAt).toLocaleString("pt-BR")}.
                </p>
              </article>
            )}
          </div>
          <div className="intelligence-tables">
            <div className="panel">
              <h2>Comparação entre números</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Enviadas</th>
                      <th>Erros</th>
                      <th>Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.current.channels.map((c: any) => (
                      <tr key={c.channel}>
                        <td>{c.channel}</td>
                        <td>{integer(c.sent)}</td>
                        <td>{integer(c.errors)}</td>
                        <td>{money(c.costMillis)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!totals.records && (
                <p>Nenhum registro no período selecionado.</p>
              )}
            </div>
            <div className="panel">
              <h2>Período anterior equivalente</h2>
              <p>
                {snapshot.previousPeriod.from} a {snapshot.previousPeriod.to}
              </p>
              <strong className="previous-cost">
                {money(snapshot.previous.totals.costMillis)}
              </strong>
              <p>
                {integer(snapshot.previous.totals.sent)} envios ·{" "}
                {snapshot.previous.observedDays} dias com registros.
              </p>
              <p className="fine-print">
                Ausência de registros não comprova ausência de atividade.
                Compare depois de importar ambos os períodos completos.
              </p>
            </div>
          </div>
          <div className="panel">
            <h2>Mensagens por dia e número</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Número</th>
                    <th>Enviadas</th>
                    <th>Erros</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.current.daily.map((d: any) => (
                    <tr key={d.day + d.channel}>
                      <td>{d.day.split("-").reverse().join("/")}</td>
                      <td>{d.channel}</td>
                      <td>{integer(d.sent)}</td>
                      <td>{integer(d.errors)}</td>
                      <td>{money(d.costMillis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {!!history.length && (
        <div className="panel">
          <h2>Últimas importações pelo painel</h2>
          <p>A carga inicial pelo pgAdmin não aparece nesta lista.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Número</th>
                  <th>Período</th>
                  <th>Novos</th>
                  <th>Já existentes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: any, i) => (
                  <tr key={i}>
                    <td>{h.filename}</td>
                    <td>{h.channel}</td>
                    <td>
                      {h.from_day} a {h.to_day}
                    </td>
                    <td>{integer(h.rows_inserted)}</td>
                    <td>{integer(h.rows_total - h.rows_inserted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
