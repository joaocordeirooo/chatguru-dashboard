import { CalendarDays, Paperclip, UserRound, GripVertical } from "lucide-react";
import type { Task, CrmUser } from "./types";
export function TaskCard({
  task,
  users,
  editable,
  onOpen,
  onDrop,
}: {
  task: Task;
  users: CrmUser[];
  editable: boolean;
  onOpen: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const due = task.due_date,
    today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
  return (
    <article
      className="crm-card"
      draggable={editable}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(
          "application/x-crm",
          JSON.stringify({ kind: "task", id: task.id, version: task.version }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <button type="button" className="crm-card-open" onClick={onOpen}>
        <span>{task.title}</span>
        {editable && <GripVertical size={15} />}
      </button>
      {task.client_name && <p>{task.client_name}</p>}
      <div className="crm-card-meta">
        <span>
          <UserRound size={13} />
          {users.find((u) => u.id === task.assignee_id)?.name ||
            "Sem responsável"}
        </span>
        {due && (
          <span className={due < today ? "crm-overdue" : ""}>
            <CalendarDays size={13} />
            {due.split("-").reverse().join("/")}
          </span>
        )}
        {task.attachments_count > 0 && (
          <span>
            <Paperclip size={13} />
            {task.attachments_count}
          </span>
        )}
      </div>
    </article>
  );
}
