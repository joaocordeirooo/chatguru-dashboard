import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Settings2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { crmApi } from "./api";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { StageEditor } from "./StageEditor";
import type { Actor, Board, Stage } from "./types";
import "./crm.css";
export function Crm({ actor }: { actor: Actor }) {
  const [board, setBoard] = useState<Board | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [stageEditor, setStageEditor] = useState<Stage | null | undefined>(
      undefined,
    ),
    [taskEditor, setTaskEditor] = useState<{
      id: string | null;
      stageId: string;
    } | null>(null);
  const [search, setSearch] = useState(""),
    [onlyMine, setOnlyMine] = useState(false);
  const load = useCallback(async () => {
    const b = await crmApi("/board");
    setBoard(b);
  }, []);
  useEffect(() => {
    let active = true;
    crmApi("/board")
      .then((b) => {
        if (active) setBoard(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function mutate(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      await load();
    } catch (e) {
      setError((e as Error).message);
      try {
        await load();
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function reorder(id: string, beforeId: string | null) {
    if (!board || actor.role !== "admin") return;
    const ids = board.stages.map((s) => s.id).filter((s) => s !== id);
    ids.splice(beforeId ? ids.indexOf(beforeId) : ids.length, 0, id);
    await mutate(() => crmApi("/stages/order", "PUT", { ids }));
  }
  function drop(
    e: React.DragEvent,
    stageId: string,
    beforeId: string | null = null,
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    try {
      const item = JSON.parse(e.dataTransfer.getData("application/x-crm"));
      if (item.kind === "stage") {
        if (actor.role === "admin" && item.id !== stageId)
          void reorder(item.id, stageId);
      } else if (item.kind === "task" && item.id !== beforeId)
        void mutate(() =>
          crmApi(`/tasks/${item.id}/move`, "PATCH", {
            stageId,
            beforeId,
            version: item.version,
          }),
        );
    } catch {
      setError(
        "Não foi possível mover o cartão. Tente pelo campo Etapa da tarefa.",
      );
    }
  }
  const visible =
    board?.tasks.filter(
      (t) =>
        (!onlyMine || t.assignee_id === actor.id) &&
        (!search ||
          `${t.title} ${t.client_name} ${board.users.find((u) => u.id === t.assignee_id)?.name || ""}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())),
    ) || [];
  return (
    <div className="crm">
      <div className="crm-toolbar panel">
        <label>
          Buscar tarefa, cliente ou responsável
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no funil…"
          />
        </label>
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          Somente minhas tarefas
        </label>
        <button disabled={busy} onClick={() => void mutate(load)}>
          <RefreshCw size={16} />
          Atualizar
        </button>
        {actor.role === "admin" && (
          <button disabled={busy} onClick={() => setStageEditor(null)}>
            <Plus size={16} />
            Adicionar coluna
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!board && !error && <p>Carregando CRM…</p>}
      {board && !board.stages.length && (
        <div className="panel crm-empty">
          <h2>Monte o seu funil</h2>
          <p>
            Crie colunas com o nome e a cor de cada etapa. Depois adicione as
            tarefas e mova-as até a assinatura.
          </p>
          {actor.role !== "admin" && (
            <p>O administrador precisa cadastrar a primeira coluna.</p>
          )}
        </div>
      )}
      {board && board.stages.length > 0 && (
        <>
          <p className="fine-print">
            Todos visualizam o quadro. Funcionários editam e movem somente suas
            tarefas. Arraste cartões entre colunas ou altere o campo Etapa na
            tarefa. O administrador pode arrastar os títulos das colunas ou usar
            as setas.
          </p>
          <div
            className="crm-board"
            aria-label="Funil de vendas"
            aria-busy={busy}
          >
            {board.stages.map((stage, index) => {
              const tasks = visible.filter((t) => t.stage_id === stage.id);
              return (
                <section
                  className="crm-column"
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => drop(e, stage.id)}
                  style={{ borderTopColor: stage.color }}
                  aria-label={`Etapa ${stage.name}`}
                >
                  <div
                    className="crm-column-heading"
                    style={{ background: stage.color }}
                    draggable={actor.role === "admin" && !busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-crm",
                        JSON.stringify({ kind: "stage", id: stage.id }),
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <h2>
                      {stage.name}
                      <span>{tasks.length}</span>
                    </h2>
                    {actor.role === "admin" && (
                      <div className="crm-column-actions">
                        <button
                          disabled={busy || index === 0}
                          aria-label={`Mover ${stage.name} para a esquerda`}
                          onClick={() =>
                            void reorder(
                              stage.id,
                              board.stages[index - 1]?.id || null,
                            )
                          }
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          disabled={busy || index === board.stages.length - 1}
                          aria-label={`Mover ${stage.name} para a direita`}
                          onClick={() =>
                            void reorder(board.stages[index + 1]?.id, stage.id)
                          }
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button
                          disabled={busy}
                          aria-label={`Editar coluna ${stage.name}`}
                          onClick={() => setStageEditor(stage)}
                        >
                          <Settings2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className="crm-add-task"
                    disabled={busy}
                    onClick={() =>
                      setTaskEditor({ id: null, stageId: stage.id })
                    }
                  >
                    <Plus size={15} />
                    Nova tarefa
                  </button>
                  <div className="crm-column-tasks">
                    {tasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        users={board.users}
                        editable={
                          !busy &&
                          (actor.role === "admin" || t.assignee_id === actor.id)
                        }
                        onOpen={() =>
                          setTaskEditor({ id: t.id, stageId: stage.id })
                        }
                        onDrop={(e) => drop(e, stage.id, t.id)}
                      />
                    ))}
                    {!tasks.length && (
                      <p className="crm-drop-hint">
                        {search || onlyMine
                          ? "Nenhuma tarefa neste filtro"
                          : "Arraste uma tarefa para esta etapa"}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      {stageEditor !== undefined && (
        <StageEditor
          stage={stageEditor}
          onClose={() => setStageEditor(undefined)}
          onSaved={load}
        />
      )}
      {taskEditor && board && (
        <TaskEditor
          key={taskEditor.id || taskEditor.stageId}
          {...taskEditor}
          board={board}
          actor={actor}
          onClose={() => setTaskEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
