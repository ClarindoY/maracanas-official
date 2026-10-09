export async function get(url, format = "text") {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "EduardaRabelo/0.2 (public procurement research)",
      Accept: format === "json" ? "application/json" : "*/*",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} na fonte.`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 50 * 1024 * 1024)
    throw new Error("Resposta maior que 50 MB. Use importação local.");
  const chunks = [];
  let total = 0;
  for await (const part of response.body) {
    total += part.length;
    if (total > 50 * 1024 * 1024) throw new Error("Limite de 50 MB excedido.");
    chunks.push(part);
  }
  const buffer = Buffer.concat(chunks);
  if (format === "buffer") return buffer;
  const text = new TextDecoder("utf-8").decode(buffer);
  return format === "json" ? JSON.parse(text) : text;
}
