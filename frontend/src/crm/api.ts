export async function crmApi(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/crm" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.status === 204) return null;
  const data = await r
    .json()
    .catch(() => ({ error: "Não foi possível conectar ao CRM." }));
  if (!r.ok) throw new Error(data.error || "Erro no CRM.");
  return data;
}
export async function uploadDocument(
  taskId: string,
  file: File,
  documentType: string,
) {
  const r = await fetch(`/api/crm/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": encodeURIComponent(file.name),
      "X-Document-Type": encodeURIComponent(documentType),
    },
    body: file,
  });
  const data = await r
    .json()
    .catch(() => ({ error: "Falha no upload. O limite é de 10 MB." }));
  if (!r.ok) throw new Error(data.error || "Erro no upload.");
  return data;
}
export async function downloadDocument(id: string, filename: string) {
  const r = await fetch(`/api/crm/attachments/${id}`);
  if (!r.ok) {
    const data = await r.json().catch(() => ({ error: "Erro no download." }));
    throw new Error(data.error);
  }
  const url = URL.createObjectURL(await r.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
