export type CrmUser = { id: string; name: string; active: boolean };
export type Stage = {
  id: string;
  name: string;
  color: string;
  position: number;
};
export type Task = {
  id: string;
  stage_id: string;
  title: string;
  client_name: string;
  due_date: string | null;
  assignee_id: string | null;
  position: number;
  version: number;
  attachments_count: number;
  description?: string;
};
export type Attachment = {
  id: string;
  filename: string;
  document_type: string;
  size: number;
  created_at: string;
};
export type Board = {
  stages: Stage[];
  tasks: Task[];
  users: CrmUser[];
  uploadsEnabled: boolean;
  maxFileBytes: number;
  documentTypes: string[];
};
export type Actor = { id: string; role: string };
