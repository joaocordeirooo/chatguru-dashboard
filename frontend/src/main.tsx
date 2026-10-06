import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import "./style.css";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
type Report = {
  demo: boolean;
  totals: { sent: number; received: number; costMillis: number };
  rows: {
    id: string;
    label: string;
    sent: number;
    received: number;
    costMillis: number;
  }[];
  daily: { day: string; sent: number }[];
  total: number;
  page: number;
};
const currency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 1000,
  );
async function api(path: string, options: RequestInit = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (r.status === 204) return null;
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Erro de conexão");
  return value;
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("dashboard");
  const [report, setReport] = useState<Report | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [group, setGroup] = useState("employee");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!user) return;
    let ignore = false;
    setBusy(true);
    setError("");
    setReport(null);
    api(
      "/dashboard?" +
        new URLSearchParams({ from, to, group, page: String(page) }),
    )
      .then((r) => {
        if (!ignore) setReport(r);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      })
      .finally(() => {
        if (!ignore) setBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, from, to, group, page]);
  async function loadUsers() {
    try {
      setEmployees(await api("/users"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      setUser(
        await api("/auth/login", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(f)),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <div className="login">Carregando…</div>;
  if (!user)
    return (
      <div className="login">
        <div className="login-card">
          <img src="/logo.png" alt="Darcísio Müller Advogados Associados" />
          <span className="eyebrow">INTELIGÊNCIA DE ATENDIMENTO</span>
          <h1>Bem-vindo ao painel</h1>
          <p>Acompanhe suas mensagens e custos em um só lugar.</p>
          <form onSubmit={login}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                required
                placeholder="seu@email.com"
              />
            </label>
            <label>
              Senha
              <input name="password" type="password" required />
            </label>
            <button disabled={busy}>
              Entrar no painel <ChevronRight size={16} />
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <details>
            <summary>Contas do modo demonstração</summary>
            <p>
              Admin: admin@example.test / DemoAdmin!2026
              <br />
              Funcionário: ana@example.test / DemoEquipe!2026
            </p>
          </details>
          <small>
            As contas demonstrativas funcionam somente com DEMO_MODE=true.
          </small>
        </div>
      </div>
    );
  return (
    <div className="shell">
      <aside>
        <img
          className="brand"
          src="/logo.png"
          alt="Darcísio Müller Advogados Associados"
        />
        <span className="eyebrow">GESTÃO DE MENSAGENS</span>
        <button
          className={view === "dashboard" ? "nav active" : "nav"}
          onClick={() => setView("dashboard")}
        >
          <LayoutDashboard size={19} />
          Visão geral
        </button>
        {user.role === "admin" && (
          <button
            className={view === "users" ? "nav active" : "nav"}
            onClick={() => {
              setView("users");
              loadUsers();
            }}
          >
            <Users size={19} />
            Funcionários
          </button>
        )}
        <div className="side-bottom">
          <ShieldCheck size={20} />
          <p>
            Acesso protegido
            <small>
              {user.role === "admin" ? "Administrador" : "Seus registros"}
            </small>
          </p>
        </div>
        <div className="profile">
          <span className="avatar">{user.name[0]}</span>
          <div>
            {user.name}
            <small>
              {user.role === "admin" ? "Administrador" : "Funcionário"}
            </small>
          </div>
          <button
            className="icon"
            aria-label="Sair"
            onClick={async () => {
              try {
                await api("/auth/logout", { method: "POST" });
                setUser(null);
                setReport(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            {view === "dashboard" ? "Visão geral" : "Funcionários"}
          </div>
          <span className="badge">
            ChatGuru • {report?.demo ? "Demonstração" : "Dashboard"}
          </span>
        </header>
        <section>
          <div className="title-row">
            <div>
              <span className="eyebrow">
                DARCÍSIO MÜLLER · ADVOGADOS ASSOCIADOS
              </span>
              <h1>
                {view === "dashboard"
                  ? "Visão geral das mensagens"
                  : "Gestão de funcionários"}
              </h1>
              <p>
                {view === "dashboard"
                  ? "Clareza sobre seus atendimentos. Controle sobre cada envio."
                  : "Cadastre a equipe e controle os acessos ao painel."}
              </p>
            </div>
            <span className="tariff">
              Tarifa de referência
              <strong>
                R$ 0,035 <small>/ envio</small>
              </strong>
            </span>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {view === "users" ? (
            <>
              <form
                className="create-user panel"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  try {
                    await api("/users", {
                      method: "POST",
                      body: JSON.stringify(
                        Object.fromEntries(new FormData(form)),
                      ),
                    });
                    form.reset();
                    loadUsers();
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <h2>Novo funcionário</h2>
                <input
                  aria-label="Nome"
                  name="name"
                  placeholder="Nome completo"
                  required
                  minLength={2}
                />
                <input
                  aria-label="E-mail"
                  name="email"
                  type="email"
                  placeholder="E-mail do responsável no ChatGuru"
                  required
                />
                <input
                  aria-label="Senha inicial"
                  name="password"
                  type="password"
                  placeholder="Senha inicial (mínimo 12 caracteres)"
                  required
                  minLength={12}
                />
                <button>Cadastrar funcionário</button>
              </form>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>E-mail</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.active ? "Ativo" : "Desativado"}</td>
                        <td>
                          {u.role === "employee" && (
                            <>
                              <button
                                className="small-btn"
                                onClick={async () => {
                                  try {
                                    await api("/users/" + u.id, {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        active: !u.active,
                                      }),
                                    });
                                    loadUsers();
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              >
                                {u.active ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                className="small-btn"
                                onClick={async () => {
                                  const password = prompt(
                                    "Nova senha (mínimo 12 caracteres)",
                                  );
                                  if (!password) return;
                                  try {
                                    await api("/users/" + u.id, {
                                      method: "PATCH",
                                      body: JSON.stringify({ password }),
                                    });
                                    setError(
                                      "Senha atualizada. As sessões anteriores foram revogadas.",
                                    );
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              >
                                Redefinir senha
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="filters">
                <span>Período de análise</span>
                <label>
                  De
                  <input
                    aria-label="Data inicial"
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label>
                  Até
                  <input
                    aria-label="Data final"
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <span className="muted">Horário de Brasília</span>
              </div>
              <div className="cards">
                {[
                  {
                    label: "Mensagens enviadas",
                    value: report?.totals.sent.toLocaleString("pt-BR"),
                    icon: <ArrowUpRight />,
                    detail: "Envios contabilizados no período",
                  },
                  {
                    label: "Mensagens recebidas",
                    value: report?.totals.received.toLocaleString("pt-BR"),
                    icon: <ArrowDownLeft />,
                    detail: "Entradas sem cobrança de envio",
                  },
                  {
                    label: "Custo estimado",
                    value: report
                      ? currency(report.totals.costMillis)
                      : undefined,
                    icon: <Wallet />,
                    detail: "Mensagens enviadas × R$ 0,035",
                  },
                ].map((c) => (
                  <article key={c.label}>
                    <div className="card-label">
                      {c.label}
                      <span>{c.icon}</span>
                    </div>
                    <strong>{c.value ?? "—"}</strong>
                    <small>{c.detail}</small>
                  </article>
                ))}
              </div>
              <div className="panel chart">
                <div className="panel-title">
                  <div>
                    <h2>Volume de envios</h2>
                    <p>Distribuição diária de mensagens enviadas</p>
                  </div>
                  <span className="legend">● Mensagens enviadas</span>
                </div>
                <div className="bars">
                  {report?.daily.map((d) => (
                    <div className="bar-column" key={d.day}>
                      <span
                        className="bar"
                        title={d.day + ": " + d.sent + " envios"}
                        style={{
                          height: Math.max(
                            3,
                            (d.sent /
                              Math.max(...report.daily.map((d) => d.sent), 1)) *
                              150,
                          ),
                        }}
                      />
                      <small>{d.day.slice(8)}</small>
                    </div>
                  ))}
                  {busy && <p>Carregando dados…</p>}
                  {report && !report.daily.length && (
                    <p>Nenhuma mensagem no período.</p>
                  )}
                </div>
              </div>
              <div className="panel table-wrap">
                <div className="panel-title">
                  <div>
                    <h2>
                      Custos por{" "}
                      {group === "employee"
                        ? "funcionário"
                        : group === "client"
                          ? "cliente"
                          : "atendimento"}
                    </h2>
                    <p>Valores estimados pela tarifa de referência</p>
                  </div>
                  <select
                    aria-label="Agrupar custos"
                    value={group}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="employee">Funcionários</option>
                    <option value="conversation">Atendimentos</option>
                    <option value="client">Clientes</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>
                        {group === "employee"
                          ? "Funcionário"
                          : group === "client"
                            ? "Cliente"
                            : "Atendimento"}
                      </th>
                      <th>Recebidas</th>
                      <th>Enviadas</th>
                      <th>Custo estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report?.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="row-icon">
                            <MessagesSquare size={15} />
                          </span>
                          {r.label}
                        </td>
                        <td>{r.received.toLocaleString("pt-BR")}</td>
                        <td>{r.sent.toLocaleString("pt-BR")}</td>
                        <td>
                          <strong>{currency(r.costMillis)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report && !report.rows.length && (
                  <p className="empty">
                    Nenhum registro encontrado para este período.
                  </p>
                )}
                <div className="pagination">
                  <small>
                    {report?.total ?? 0} registros · página {page}
                  </small>
                  <button
                    className="small-btn"
                    disabled={page === 1 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="small-btn"
                    disabled={!report || page * 20 >= report.total || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </div>
              <footer>
                {report?.demo
                  ? "Dados fictícios para avaliação do protótipo."
                  : "Dados do banco ChatGuru."}{" "}
                Custo estimado; não representa uma fatura da Meta.
              </footer>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
