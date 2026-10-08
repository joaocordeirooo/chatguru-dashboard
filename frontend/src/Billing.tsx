import { useEffect, useState } from "react";
import { Upload, Wallet, CheckCircle2 } from "lucide-react";
type Api = (path: string, options?: RequestInit) => Promise<any>;
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 1000,
  );
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
}).format(new Date());
export function Billing({
  api,
  onChanged,
}: {
  api: Api;
  onChanged: () => void;
}) {
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [channel, setChannel] = useState("");
  const [data, setData] = useState<any>(null),
    [config, setConfig] = useState<any>(null),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<any>(null),
    [result, setResult] = useState<any>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState<any>(null);
  useEffect(() => {
    api("/intelligence/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [api]);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(
      "/billing?" +
        new URLSearchParams({ from, to, ...(channel ? { channel } : {}) }),
    )
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, from, to, channel, revision]);
  async function upload(commit = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "/billing/dialogues/" +
          (commit
            ? "commit?" + new URLSearchParams({ token: preview.previewToken })
            : "preview"),
        { method: "POST", headers: { "Content-Type": "text/csv" }, body: file },
      );
      if (commit) {
        setResult(r);
        setPreview(null);
        setFile(null);
        setVersion((n) => n + 1);
        setRevision((n) => n + 1);
        onChanged();
      } else {
        setPreview(r);
        setResult(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const label = (c: string | null) =>
    c ? (data?.pricing[c]?.label ?? c) : "Sem vínculo";
  return (
    <div className="intelligence">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="panel">
        <div className="intelligence-heading">
          <Wallet size={23} />
          <div>
            <h2>Tarifas por categoria · BRL</h2>
            <p>
              A tarifa é aplicada à categoria confirmada, independentemente de
              texto, áudio ou template.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Por mensagem</th>
                <th>Base do cálculo</th>
              </tr>
            </thead>
            <tbody>
              {data &&
                [
                  "marketing",
                  "service",
                  "utility",
                  "authentication",
                  "unclassified",
                ].map((c) => (
                  <tr key={c}>
                    <td>{data.pricing[c].label}</td>
                    <td>
                      {data.pricing[c].rateBrl === null
                        ? "Pendente"
                        : "R$ " +
                          data.pricing[c].rateBrl
                            .toFixed(c === "marketing" ? 4 : 3)
                            .replace(".", ",")}
                    </td>
                    <td>{data.pricing[c].basis}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="fine-print">
          Cálculo preserva quatro casas decimais e arredonda somente o total
          exibido. São estimativas; não conciliam entrega, franquias, impostos
          ou fatura do provedor.
        </p>
      </div>
      <div className="panel">
        <h2>Importar relatório de diálogos executados</h2>
        <p>
          “Mensagem Inicial” está vinculado a marketing, com 1 envio por
          acionamento, conforme sua confirmação. O canal permanece não
          identificado.
        </p>
        <div className="import-controls">
          <label>
            CSV de diálogos
            <input
              key={version}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
          </label>
          <button
            disabled={
              busy ||
              !file ||
              !config?.importConfigured ||
              file.size > 15 * 1024 * 1024
            }
            onClick={() => upload()}
          >
            <Upload size={16} />
            Verificar arquivo
          </button>
        </div>
        {!config?.importConfigured && (
          <p className="notice">
            Configure a chave de arquivamento no backend para importar o CSV.
          </p>
        )}
        {preview && (
          <div className="import-preview">
            <strong>
              {preview.rows} acionamentos · {preview.from} a {preview.to}
            </strong>
            <p>
              {preview.newRows} novos · {preview.existing} existentes ·{" "}
              {preview.initialExecutions} de Mensagem Inicial.
            </p>
            <p>
              {preview.identicalRows} linhas idênticas adicionais preservadas
              como ocorrências. Reenvios do mesmo histórico são ignorados.
            </p>
            <button disabled={busy} onClick={() => upload(true)}>
              <CheckCircle2 size={16} />
              Confirmar importação
            </button>
          </div>
        )}
        {result && (
          <p className="import-success" role="status">
            Importados {result.inserted} acionamentos. {result.skipped} já
            existentes. As mensagens do histórico foram preservadas.
          </p>
        )}
      </div>
      <div className="filters panel">
        <label>
          De
          <input
            disabled={busy}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            disabled={busy}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Número
          <select
            disabled={busy}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Todos, incluindo não identificado</option>
            <option value="2998">2998</option>
            <option value="0061">0061</option>
          </select>
        </label>
      </div>
      {data && (
        <>
          <div className="panel">
            <h2>CSV de mensagens · custo por categoria</h2>
            <p>
              Envios confirmados no histórico: {data.messages.totals.sent}.
              Custo estimado parcial:{" "}
              <strong>{money(data.messages.totals.costMillis)}</strong>.
            </p>
            <p>
              {data.messages.totals.unclassified ?? 0} envios sem categoria usam
              referência provisória; {data.messages.totals.unpriced ?? 0} estão
              sem tarifa.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Enviadas</th>
                    <th>Estimativa</th>
                    <th>Sem tarifa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.messages.categories.map((c: any) => (
                    <tr key={c.category}>
                      <td>{label(c.category)}</td>
                      <td>{c.sent}</td>
                      <td>
                        {c.unpriced === c.sent && c.sent > 0
                          ? "Pendente"
                          : money(c.costMillis)}
                      </td>
                      <td>{c.unpriced}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine-print">
              Para classificar mensagens, use “IA e importações” e escolha a
              categoria somente quando todo o CSV pertencer a ela. Reenvie o
              mesmo arquivo para classificar registros existentes, sem
              duplicá-los.
            </p>
          </div>
          <div className="panel">
            <h2>CSV de diálogos · estimativa separada</h2>
            <p className="notice">
              Os diálogos podem representar mensagens já presentes no histórico.
              Estes custos não são somados ao CSV de mensagens.
            </p>
            <div className="intelligence-kpis">
              <div>
                <p>Acionamentos</p>
                <strong>{data.dialogues.totals.executions}</strong>
              </div>
              <div>
                <p>Envios vinculados</p>
                <strong>{data.dialogues.totals.sent}</strong>
              </div>
              <div>
                <p>Custo dos vínculos</p>
                <strong>{money(data.dialogues.totals.costMillis)}</strong>
              </div>
              <div>
                <p>Sem categoria confirmada</p>
                <strong>{data.dialogues.totals.pendingExecutions}</strong>
              </div>
            </div>
            <p>
              {data.dialogues.totals.unknownChannelSent} envios vinculados sem
              número identificado · {data.dialogues.totals.unpriced} sem tarifa
              informada.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Diálogo</th>
                    <th>Acionamentos</th>
                    <th>Envios por acionamento</th>
                    <th>Categoria</th>
                    <th>Número</th>
                    <th>Custo</th>
                    <th>Vínculo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dialogues.rows.map((r: any) => (
                    <tr key={r.dialogue}>
                      <td>{r.dialogue}</td>
                      <td>{r.executions}</td>
                      <td>{r.messages_per_execution ?? "Não confirmado"}</td>
                      <td>{label(r.category)}</td>
                      <td>{r.channel ?? "Não identificado"}</td>
                      <td>
                        {r.pendingExecutions || r.unpriced
                          ? "Pendente"
                          : money(r.costMillis)}
                      </td>
                      <td>
                        <button
                          disabled={busy || config?.demo}
                          onClick={() => setEditing(r)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.dialogues.rows.length && (
              <p>Nenhum diálogo importado no período e número selecionados.</p>
            )}
            {editing && (
              <form
                key={editing.dialogue}
                className="rule-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    await api("/billing/rules", {
                      method: "PUT",
                      body: JSON.stringify({
                        dialogue: editing.dialogue,
                        category: f.get("category"),
                        quantity: Number(f.get("quantity")),
                        channel: f.get("channel") || null,
                      }),
                    });
                    setEditing(null);
                    setRevision((n) => n + 1);
                    onChanged();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h2>Vínculo de {editing.dialogue}</h2>
                <div className="import-controls">
                  <label>
                    Categoria
                    <select
                      name="category"
                      defaultValue={editing.category ?? "unclassified"}
                    >
                      {[
                        "unclassified",
                        "marketing",
                        "service",
                        "utility",
                        "authentication",
                      ].map((c) => (
                        <option key={c} value={c}>
                          {label(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Envios por acionamento
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      max="20"
                      required
                      defaultValue={editing.messages_per_execution ?? 1}
                    />
                  </label>
                  <label>
                    Número
                    <select name="channel" defaultValue={editing.channel ?? ""}>
                      <option value="">Não identificado</option>
                      <option value="2998">2998</option>
                      <option value="0061">0061</option>
                    </select>
                  </label>
                </div>
                <label className="rule-confirm">
                  <input type="checkbox" required />
                  Confirmo a categoria e a quantidade de mensagens enviadas por
                  acionamento deste diálogo.
                </label>
                <button disabled={busy}>Salvar vínculo</button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
              </form>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Acionamentos</th>
                    <th>Envios vinculados</th>
                    <th>Custo dos vínculos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dialogues.daily.map((d: any) => (
                    <tr key={d.day}>
                      <td>{d.day.split("-").reverse().join("/")}</td>
                      <td>{d.executions}</td>
                      <td>{d.sent}</td>
                      <td>{money(d.costMillis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
