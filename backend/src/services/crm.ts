import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { crmConfig } from "../config/crm.js";
import { env } from "../config/env.js";
import { crmQuery, crmTransaction, type CrmTask } from "../models/crm.js";
import { assertTaskEditor } from "../middlewares/crm.js";
import { fail } from "./errors.js";
import type { User } from "./users.js";
import type { PoolClient } from "pg";
export type TaskFields = {
  stageId: string;
  title: string;
  clientName: string;
  description: string;
  dueDate: string | null;
  assigneeId: string | null;
};
const metadata = "id,task_id,filename,document_type,mime,size,created_at";
async function stageExists(db: PoolClient, id: string) {
  if (
    !(await db.query("SELECT id FROM public.crm_stages WHERE id=$1", [id]))
      .rowCount
  )
    fail(404, "Etapa não encontrada.");
}
async function assigneeExists(db: PoolClient, id: string | null) {
  if (
    id &&
    !(
      await db.query(
        "SELECT id FROM public.dashboard_users WHERE id=$1 AND active=true",
        [id],
      )
    ).rowCount
  )
    fail(400, "Responsável inativo ou inexistente.");
}
async function editable(
  db: PoolClient,
  id: string,
  user: User,
  version?: number,
): Promise<CrmTask> {
  const task = (
    await db.query("SELECT * FROM public.crm_tasks WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
  if (!task) fail(404, "Tarefa não encontrada.");
  assertTaskEditor(user, task.assignee_id);
  if (version !== undefined && task.version !== version)
    fail(409, "Esta tarefa foi alterada por outra pessoa. Atualize o quadro.");
  return task;
}
export async function board() {
  return crmTransaction(async (db) => {
    const stages = (
      await db.query("SELECT * FROM public.crm_stages ORDER BY position,id")
    ).rows;
    const tasks = (
      await db.query(`SELECT t.id,t.stage_id,t.title,t.client_name,t.due_date::text,t.assignee_id,t.position,t.version,t.updated_at,
      (SELECT COUNT(*)::int FROM public.crm_attachments a WHERE a.task_id=t.id AND a.deleted_at IS NULL) AS attachments_count
      FROM public.crm_tasks t ORDER BY t.position,t.id`)
    ).rows;
    const users = (
      await db.query(
        "SELECT id,name,active FROM public.dashboard_users ORDER BY name,id",
      )
    ).rows;
    return {
      stages,
      tasks,
      users,
      uploadsEnabled: !!env.ARCHIVE_ENCRYPTION_KEY,
      maxFileBytes: crmConfig.maxFileBytes,
      documentTypes: crmConfig.documentTypes,
    };
  });
}
export async function taskDetail(id: string) {
  const task = (
    await crmQuery(
      "SELECT id,stage_id,title,client_name,description,due_date::text,assignee_id,position,version,updated_at FROM public.crm_tasks WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!task) fail(404, "Tarefa não encontrada.");
  return {
    ...task,
    attachments: (
      await crmQuery(
        `SELECT ${metadata} FROM public.crm_attachments WHERE task_id=$1 AND deleted_at IS NULL ORDER BY created_at,id`,
        [id],
      )
    ).rows,
  };
}
export async function createStage(name: string, color: string) {
  return crmTransaction(async (db) => {
    if (
      Number(
        (await db.query("SELECT COUNT(*) AS total FROM public.crm_stages"))
          .rows[0].total,
      ) >= 100
    )
      fail(409, "O limite é de 100 colunas no funil.");
    return (
      await db.query(
        "INSERT INTO public.crm_stages(id,name,color,position) VALUES($1,$2,$3,(SELECT COALESCE(MAX(position),-1)+1 FROM public.crm_stages)) RETURNING *",
        [randomUUID(), name, color],
      )
    ).rows[0];
  });
}
export async function updateStage(id: string, name: string, color: string) {
  return crmTransaction(async (db) => {
    const row = (
      await db.query(
        "UPDATE public.crm_stages SET name=$2,color=$3 WHERE id=$1 RETURNING *",
        [id, name, color],
      )
    ).rows[0];
    if (!row) fail(404, "Etapa não encontrada.");
    return row;
  });
}
export async function reorderStages(ids: string[]) {
  return crmTransaction(async (db) => {
    const current = (
      await db.query("SELECT id FROM public.crm_stages")
    ).rows.map((r) => r.id);
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !current.includes(id))
    )
      fail(409, "As etapas mudaram. Atualize o quadro.");
    for (let i = 0; i < ids.length; i++)
      await db.query("UPDATE public.crm_stages SET position=$2 WHERE id=$1", [
        ids[i],
        i,
      ]);
  });
}
export async function removeStage(id: string) {
  return crmTransaction(async (db) => {
    await stageExists(db, id);
    if (
      (
        await db.query(
          "SELECT id FROM public.crm_tasks WHERE stage_id=$1 LIMIT 1",
          [id],
        )
      ).rowCount
    )
      fail(409, "Mova as tarefas antes de excluir esta coluna.");
    await db.query("DELETE FROM public.crm_stages WHERE id=$1", [id]);
  });
}
export async function createTask(fields: TaskFields, user: User) {
  if (user.role !== "admin" && fields.assigneeId !== user.id)
    fail(403, "Uma nova tarefa deve ser atribuída a você.");
  return crmTransaction(async (db) => {
    await stageExists(db, fields.stageId);
    await assigneeExists(db, fields.assigneeId);
    return (
      await db.query(
        `INSERT INTO public.crm_tasks(id,stage_id,title,client_name,description,due_date,assignee_id,position,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(position),-1)+1 FROM public.crm_tasks WHERE stage_id=$2),$8)
      RETURNING id`,
        [
          randomUUID(),
          fields.stageId,
          fields.title,
          fields.clientName,
          fields.description,
          fields.dueDate,
          fields.assigneeId,
          user.id,
        ],
      )
    ).rows[0];
  });
}
export async function updateTask(
  id: string,
  fields: TaskFields,
  version: number,
  user: User,
) {
  return crmTransaction(async (db) => {
    const old = await editable(db, id, user, version);
    if (user.role !== "admin" && fields.assigneeId !== user.id)
      fail(403, "Somente o administrador pode trocar o responsável.");
    await stageExists(db, fields.stageId);
    await assigneeExists(db, fields.assigneeId);
    await db.query(
      `UPDATE public.crm_tasks SET stage_id=$2,title=$3,client_name=$4,description=$5,due_date=$6,assignee_id=$7,
      position=CASE WHEN stage_id=$2 THEN position ELSE (SELECT COALESCE(MAX(position),-1)+1 FROM public.crm_tasks WHERE stage_id=$2) END,
      version=version+1,updated_at=now() WHERE id=$1`,
      [
        old.id,
        fields.stageId,
        fields.title,
        fields.clientName,
        fields.description,
        fields.dueDate,
        fields.assigneeId,
      ],
    );
  });
}
export async function moveTask(
  id: string,
  stageId: string,
  beforeId: string | null,
  version: number,
  user: User,
) {
  return crmTransaction(async (db) => {
    await editable(db, id, user, version);
    await stageExists(db, stageId);
    const ids: string[] = (
      await db.query(
        "SELECT id FROM public.crm_tasks WHERE stage_id=$1 AND id<>$2 ORDER BY position,id",
        [stageId, id],
      )
    ).rows.map((r) => r.id);
    if (beforeId && !ids.includes(beforeId))
      fail(409, "O cartão de destino mudou. Atualize o quadro.");
    ids.splice(beforeId ? ids.indexOf(beforeId) : ids.length, 0, id);
    await db.query(
      "UPDATE public.crm_tasks SET stage_id=$2,version=version+1,updated_at=now() WHERE id=$1",
      [id, stageId],
    );
    for (let i = 0; i < ids.length; i++)
      await db.query("UPDATE public.crm_tasks SET position=$2 WHERE id=$1", [
        ids[i],
        i,
      ]);
  });
}
function encryptionKey() {
  if (!env.ARCHIVE_ENCRYPTION_KEY)
    fail(
      503,
      "Configure ARCHIVE_ENCRYPTION_KEY para armazenar documentos do CRM.",
    );
  return Buffer.from(env.ARCHIVE_ENCRYPTION_KEY, "hex");
}
export function validateDocument(buffer: Buffer, filename: string): string {
  const ext = filename.split(".").at(-1)?.toLowerCase();
  if (!ext || !crmConfig.extensions.includes(ext))
    fail(400, "Formato permitido: PDF, PNG, JPG, WEBP, DOCX, XLSX ou TXT.");
  if (!buffer.length || buffer.length > crmConfig.maxFileBytes)
    fail(400, "O documento deve ter até 10 MB.");
  const prefix = buffer.subarray(0, 12);
  const pdf = prefix.subarray(0, 5).toString() === "%PDF-";
  const png = prefix
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255;
  const webp =
    prefix.subarray(0, 4).toString() === "RIFF" &&
    prefix.subarray(8, 12).toString() === "WEBP";
  const zip =
    prefix[0] === 80 && prefix[1] === 75 && prefix[2] === 3 && prefix[3] === 4;
  const valid =
    ext === "pdf"
      ? pdf
      : ext === "png"
        ? png
        : ext === "jpg" || ext === "jpeg"
          ? jpg
          : ext === "webp"
            ? webp
            : ext === "docx" || ext === "xlsx"
              ? zip
              : !buffer.includes(0);
  if (!valid)
    fail(400, "O conteúdo do arquivo não corresponde ao formato informado.");
  return (
    {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
    } as Record<string, string>
  )[ext];
}
export async function addAttachment(
  taskId: string,
  filename: string,
  documentType: string,
  buffer: Buffer,
  user: User,
) {
  const key = encryptionKey(),
    mime = validateDocument(buffer, filename),
    id = randomUUID(),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(id + ":" + taskId));
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return crmTransaction(async (db) => {
    await editable(db, taskId, user);
    const n = (
      await db.query(
        "SELECT COUNT(*)::int n FROM public.crm_attachments WHERE task_id=$1 AND deleted_at IS NULL",
        [taskId],
      )
    ).rows[0].n;
    if (n >= crmConfig.maxAttachments)
      fail(409, "Limite de 30 anexos por tarefa.");
    return (
      await db.query(
        `INSERT INTO public.crm_attachments(id,task_id,filename,document_type,mime,size,encrypted,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${metadata}`,
        [
          id,
          taskId,
          filename,
          documentType,
          mime,
          buffer.length,
          encrypted,
          user.id,
        ],
      )
    ).rows[0];
  });
}
export async function downloadAttachment(id: string) {
  const a = (
    await crmQuery(
      "SELECT id,task_id,filename,mime,encrypted FROM public.crm_attachments WHERE id=$1 AND deleted_at IS NULL",
      [id],
    )
  ).rows[0];
  if (!a) fail(404, "Anexo não encontrado.");
  const bytes = Buffer.from(a.encrypted),
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(0, 12),
    );
  decipher.setAAD(Buffer.from(a.id + ":" + a.task_id));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return {
    filename: a.filename,
    mime: a.mime,
    buffer: Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]),
  };
}
export async function removeAttachment(id: string, user: User) {
  return crmTransaction(async (db) => {
    const a = (
      await db.query(
        "SELECT task_id FROM public.crm_attachments WHERE id=$1 AND deleted_at IS NULL",
        [id],
      )
    ).rows[0];
    if (!a) fail(404, "Anexo não encontrado.");
    await editable(db, a.task_id, user);
    await db.query(
      "UPDATE public.crm_attachments SET deleted_at=now() WHERE id=$1",
      [id],
    );
  });
}
