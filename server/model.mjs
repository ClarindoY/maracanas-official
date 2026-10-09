import { createHash } from "node:crypto";
export const stages = ["ABERTOS", "PENDENTES", "JÁ EM OPERAÇÃO"];
export function number(v) {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function date(v) {
  if (!v) return null;
  const s = String(v).trim();
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (match) {
    const [, d, m, y, h, mi] = match;
    return h ? `${y}-${m}-${d}T${h}:${mi}:00-03:00` : `${y}-${m}-${d}`;
  }
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s) && !Number.isNaN(Date.parse(s))
    ? s
    : null;
}
export function url(v) {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function normalize(source, row) {
  if (!row.externalId || !row.title?.trim())
    throw new Error("Registro sem identificador ou objeto.");
  const id = `${source.id}:${row.externalId}`;
  const normalized = {
    id,
    sourceId: source.id,
    source: source.name,
    externalId: String(row.externalId),
    title: row.title.trim(),
    agency: row.agency || null,
    uf: row.uf || null,
    modality: row.modality || null,
    value: number(row.value),
    opening: date(row.opening),
    officialStatus: row.officialStatus || null,
    url: url(row.url || source.url),
    items: row.items || [],
    attachments: row.attachments || [],
    suppliers: row.suppliers || [],
    provenance: row.provenance || "coleta",
    collectedAt: new Date().toISOString(),
    raw: row.raw || row,
  };
  normalized.proposalDeadline = date(row.proposalDeadline);
  normalized.hash = createHash("sha256")
    .update(JSON.stringify({ ...normalized, collectedAt: null }))
    .digest("hex");
  return normalized;
}
