import { useEffect, useState } from "react";
import { crmApi, uploadDocument, downloadDocument } from "./api";
import type { Actor, Board, Task, Attachment } from "./types";
import { useDialog } from "./useDialog";
export function TaskEditor({
  id,
  stageId,
  board,
  actor,
  onClose,
  onSaved,
}: {
  id: string | null;
  stageId: string;
  board: Board;
  actor: Actor;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [task, setTask] = useState<Task | null>(null),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [loading, setLoading] = useState(!!id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [title, setTitle] = useState(""),
    [clientName, setClientName] = useState(""),
    [description, setDescription] = useState(""),
    [dueDate, setDueDate] = useState(""),
    [assigneeId, setAssigneeId] = useState(
      actor.role === "admin" ? "" : actor.id,
    ),
    [stage, setStage] = useState(stageId);
  const [file, setFile] = useState<File | null>(null),
    [documentType, setDocumentType] = useState(""),
    [fileVersion, setFileVersion] = useState(0);
  const dialog = useDialog(onClose, busy);
  const editable =
    (!id || !!task) &&
    (actor.role === "admin" || !id || task?.assignee_id === actor.id);
  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const t = await crmApi(`/tasks/${id}`);
      setTask(t);
      setAttachments(t.attachments);
      setTitle(t.title);
      setClientName(t.client_name);
      setDescription(t.description);
      setDueDate(t.due_date || "");
      setAssigneeId(t.assignee_id || "");
      setStage(t.stage_id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await crmApi(id ? `/tasks/${id}` : "/tasks", id ? "PATCH" : "POST", {
        stageId: stage,
        title,
        clientName,
        description,
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
        ...(id ? { version: task!.version } : {}),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="crm-overlay">
      <section
        ref={dialog}
        className="crm-dialog crm-task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={id ? "Detalhes da tarefa" : "Nova tarefa"}
      >
        <div className="crm-dialog-heading">
          <h2>{id ? "Tarefa / pasta" : "Nova tarefa / pasta"}</h2>
          <button onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
        {loading ? (
          <p>Carregando tarefa…</p>
        ) : (
          <>
            {error && (
              <p className="error" role="alert">
                {error}
                {id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void load()}
                  >
                    Recarregar tarefa
                  </button>
                )}
              </p>
            )}
            {!editable && (
              <p className="notice">
                Você pode visualizar esta tarefa. A edição é permitida ao
                responsável e ao administrador.
              </p>
            )}
            <form onSubmit={save}>
              <fieldset disabled={busy || !editable}>
                <label>
                  Nome da tarefa
                  <input
                    autoFocus
                    required
                    maxLength={150}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Cliente / pasta
                  <input
                    maxLength={150}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </label>
                <div className="crm-two-fields">
                  <label>
                    Etapa
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                    >
                      {board.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prazo
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Responsável
                  <select
                    disabled={actor.role !== "admin"}
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Sem responsável</option>
                    {board.users
                      .filter((u) => u.active || u.id === assigneeId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {!u.active ? " (inativo)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Descrição / observações
                  <textarea
                    maxLength={5000}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                {editable && (
                  <button type="submit">
                    {busy ? "Salvando…" : "Salvar tarefa"}
                  </button>
                )}
              </fieldset>
            </form>
            <section className="crm-attachments">
              <h3>Documentos e anexos</h3>
              {!id && <p>Salve a tarefa primeiro para anexar documentos.</p>}
              {attachments.map((a) => (
                <div className="crm-attachment" key={a.id}>
                  <div>
                    <strong>{a.filename}</strong>
                    <small>
                      {a.document_type} · {(a.size / 1024).toFixed(0)} KB
                    </small>
                  </div>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setError("");
                      try {
                        await downloadDocument(a.id, a.filename);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Baixar
                  </button>
                  {editable && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await crmApi(`/attachments/${a.id}`, "DELETE");
                          setAttachments((all) =>
                            all.filter((x) => x.id !== a.id),
                          );
                          await onSaved();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
              {id &&
                editable &&
                (board.uploadsEnabled ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!file) return;
                      if (file.size > board.maxFileBytes) {
                        setError("O limite é de 10 MB por arquivo.");
                        return;
                      }
                      setBusy(true);
                      setError("");
                      try {
                        const a = await uploadDocument(id, file, documentType);
                        setAttachments((all) => [...all, a]);
                        setFile(null);
                        setFileVersion((v) => v + 1);
                        await onSaved();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Tipo do documento
                        <input
                          required
                          maxLength={80}
                          list="crm-document-types"
                          value={documentType}
                          onChange={(e) => setDocumentType(e.target.value)}
                          placeholder="Escolha ou escreva um tipo"
                        />
                      </label>
                      <datalist id="crm-document-types">
                        {board.documentTypes.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                      <label>
                        Arquivo · até 10 MB
                        <input
                          key={fileVersion}
                          required
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      <button type="submit" disabled={!file}>
                        Anexar documento
                      </button>
                    </fieldset>
                  </form>
                ) : (
                  <p className="notice">
                    O backend precisa de ARCHIVE_ENCRYPTION_KEY para receber
                    documentos.
                  </p>
                ))}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
