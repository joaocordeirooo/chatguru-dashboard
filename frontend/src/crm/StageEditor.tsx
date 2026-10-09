import { useState } from "react";
import type { Stage } from "./types";
import { crmApi } from "./api";
import { useDialog } from "./useDialog";
export function StageEditor({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(stage?.name || ""),
    [color, setColor] = useState(stage?.color || "#34436f"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useDialog(onClose, busy);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await crmApi(
        stage ? `/stages/${stage.id}` : "/stages",
        stage ? "PATCH" : "POST",
        { name, color },
      );
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
        className="crm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={stage ? "Editar coluna" : "Nova coluna"}
      >
        <div className="crm-dialog-heading">
          <h2>{stage ? "Editar coluna" : "Nova coluna"}</h2>
          <button type="button" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Nome da coluna
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Cor da coluna
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <button type="submit">
              {busy ? "Salvando…" : "Salvar coluna"}
            </button>
            {stage && (
              <button
                className="crm-danger"
                type="button"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await crmApi(`/stages/${stage.id}`, "DELETE");
                    await onSaved();
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Excluir coluna vazia
              </button>
            )}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
