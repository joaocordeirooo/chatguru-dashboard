import { auth } from "../config/db.js";
import { env } from "../config/env.js";
import { fail } from "../services/errors.js";
import type { PoolClient } from "pg";
export type CrmStage = {
  id: string;
  name: string;
  color: string;
  position: number;
};
export type CrmTask = {
  id: string;
  stage_id: string;
  title: string;
  client_name: string;
  description: string;
  due_date: string | null;
  assignee_id: string | null;
  position: number;
  version: number;
  created_by: string;
  updated_at: string;
};
let setup: Promise<void> | undefined;
export const crmDDL = `
CREATE TABLE IF NOT EXISTS public.crm_stages (
 id uuid PRIMARY KEY, name text NOT NULL, color text NOT NULL, position integer NOT NULL);
CREATE TABLE IF NOT EXISTS public.crm_tasks (
 id uuid PRIMARY KEY, stage_id uuid NOT NULL REFERENCES public.crm_stages(id), title text NOT NULL,
 client_name text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', due_date date,
 assignee_id uuid REFERENCES public.dashboard_users(id), position integer NOT NULL, version integer NOT NULL DEFAULT 0,
 created_by uuid NOT NULL REFERENCES public.dashboard_users(id), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS crm_tasks_stage_idx ON public.crm_tasks(stage_id,position);
CREATE TABLE IF NOT EXISTS public.crm_attachments (
 id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES public.crm_tasks(id), filename text NOT NULL,
 document_type text NOT NULL, mime text NOT NULL, size integer NOT NULL, encrypted bytea NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES public.dashboard_users(id), created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX IF NOT EXISTS crm_attachments_task_idx ON public.crm_attachments(task_id) WHERE deleted_at IS NULL;`;
export async function prepareCrm() {
  if (!auth || env.DEMO_MODE)
    fail(503, "CRM disponível com banco real e DEMO_MODE=false.");
  if (!setup)
    setup = (async () => {
      const db = await auth!.connect();
      try {
        await db.query("BEGIN");
        await db.query("SET LOCAL lock_timeout='10s'");
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtext('dashboard-crm-setup'))",
        );
        for (const statement of crmDDL.split(";").filter((s) => s.trim()))
          await db.query(statement);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
    })().catch((e) => {
      setup = undefined;
      throw e;
    });
  return setup;
}
export async function crmTransaction<T>(
  run: (db: PoolClient) => Promise<T>,
): Promise<T> {
  await prepareCrm();
  const db = await auth!.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('dashboard-crm-write'))",
    );
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function crmQuery(sql: string, params: unknown[] = []) {
  await prepareCrm();
  return auth!.query(sql, params);
}
