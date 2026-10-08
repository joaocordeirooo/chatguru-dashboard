import { parse } from "csv-parse/sync";
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { fail } from "./errors.js";
export const headers = [
  "Autor",
  "Chat",
  "Nº do Chat",
  "Chat_ID",
  "Tipo",
  "Status",
  "Criado em",
  "Enviado em",
  "Texto",
  "Link",
];
const sha = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
function date(value: string, row: number) {
  if (!value) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) fail(400, `Linha ${row}: data inválida; use DD-MM-AAAA HH:mm:ss.`);
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
  const parsed = new Date(iso + "Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 19) !== iso ||
    +m[3] < 2000 ||
    +m[3] > 2100
  )
    fail(400, `Linha ${row}: data inexistente.`);
  return iso + "-03:00";
}
export function archive(value: string, key: string) {
  if (!value) return null;
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}
export function parseHistory(buffer: Buffer, channel: string) {
  if (!["2998", "0061"].includes(channel))
    fail(400, "Selecione o canal 2998 ou 0061.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail(
      400,
      "O CSV precisa estar em UTF-8. Exporte novamente sem alterar as colunas.",
    );
  }
  let data: string[][];
  try {
    data = parse(text!, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 200000,
      delimiter: ",",
    });
  } catch {
    fail(400, "CSV inválido: confira separadores, aspas e número de colunas.");
  }
  if (JSON.stringify(data![0]) !== JSON.stringify(headers))
    fail(
      400,
      "As colunas devem ser as mesmas de final2998.csv, na mesma ordem.",
    );
  if (data!.length < 2 || data!.length > 50001)
    fail(400, "Envie entre 1 e 50.000 registros por arquivo.");
  const occurrences = new Map<string, number>();
  const records = data!.slice(1).map((r, index) => {
    if (r.length !== headers.length || r.some((v) => v.includes("\0")))
      fail(400, `Linha ${index + 2}: registro inválido.`);
    const [
      author,
      client,
      phone,
      chat,
      type,
      status,
      created,
      sent,
      message,
      link,
    ] = r;
    if (
      !chat ||
      chat.length > 150 ||
      author.length > 150 ||
      client.length > 500 ||
      !["chat", "audio", "image", "document", "template", "video"].includes(
        type,
      ) ||
      !["Enviada", "Erro"].includes(status)
    )
      fail(400, `Linha ${index + 2}: Chat_ID, autor, tipo ou status inválido.`);
    const createdAt = date(created, index + 2),
      sentAt = date(sent, index + 2);
    if (status === "Enviada" && !sentAt)
      fail(400, `Linha ${index + 2}: mensagem enviada sem data de envio.`);
    if (!sentAt && !createdAt)
      fail(400, `Linha ${index + 2}: falta data de criação ou envio.`);
    let normalizedLink = "";
    if (link) {
      try {
        const url = new URL(link);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
        url.search = "";
        url.hash = "";
        normalizedLink = url.href;
      } catch {
        fail(400, `Linha ${index + 2}: link inválido.`);
      }
    }
    // Mesmo identificador usado na carga inicial; parâmetros temporários dos links são ignorados.
    const canonical = JSON.stringify([
      channel,
      author,
      client,
      phone,
      chat,
      type,
      status,
      created,
      sent,
      message,
      normalizedLink,
    ]);
    const ordinal = (occurrences.get(canonical) ?? 0) + 1;
    occurrences.set(canonical, ordinal);
    return {
      key: `csv${channel}:${sha(canonical + ":" + ordinal)}`,
      author,
      client,
      phone,
      chat,
      type,
      status: status.toLowerCase(),
      createdAt,
      sentAt,
      message,
      link,
      day: (sentAt ?? createdAt)!.slice(0, 10),
    };
  });
  const days = records.map((r) => r.day).sort();
  return {
    hash: sha(buffer),
    channel,
    records,
    summary: {
      channel,
      rows: records.length,
      sent: records.filter((r) => r.status === "enviada").length,
      errors: records.filter((r) => r.status === "erro").length,
      from: days[0],
      to: days.at(-1)!,
      costMillis: records.filter((r) => r.status === "enviada").length * 35,
    },
  };
}
