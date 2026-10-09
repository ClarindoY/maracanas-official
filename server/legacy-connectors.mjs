import { load } from "cheerio";
import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";
import { get } from "./network.mjs";
import { normalize, number } from "./model.mjs";

export function csv(text) {
  return parse(text.replace(/^\uFEFF/, ""), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    delimiter: text.split(/\r?\n/)[0].includes(";") ? ";" : ",",
    relax_column_count: false,
  });
}
export function mgRows(source, rows, itemRows = []) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.numero_processo_formatado;
    if (!key || !r.objeto_processo)
      throw new Error("Esquema MG incompatível: processo/objeto ausente.");
    if (!groups.has(key))
      groups.set(key, {
        externalId: key,
        title: r.objeto_processo,
        agency: r.nome_orgao_entidade_compra,
        uf: "MG",
        modality: r.procedimento_contratacao_grupo,
        opening: r.data_licitacao,
        officialStatus: r.situacao_processo,
        value: null,
        suppliers: [],
        raw: [],
      });
    const o = groups.get(key);
    o.raw.push(r);
    if (
      r.nome_empresarial_nome_fornecedor &&
      !o.suppliers.some((x) => x.name === r.nome_empresarial_nome_fornecedor)
    )
      o.suppliers.push({
        name: r.nome_empresarial_nome_fornecedor,
        document: r.cnpj_cpf_fornecedor_formatado || null,
      });
  }
  // Não soma linhas de licitações: o arquivo pode repetir processos/itens/fornecedores.
  const seen = new Set();
  for (const r of itemRows) {
    const o = groups.get(r.numero_processo_formatado);
    if (!o) continue;
    const key = `${r.numero_processo_formatado}:${r.numero_item_processo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (o.items ||= []).push({
      id: r.numero_item_processo,
      description: r.item_material_servico,
      quantity: number(r.quantidade_item_pedido),
      unit: null,
      estimatedUnitValue: number(r.valor_unitario_referencia_item_processo),
      estimatedTotal: number(r.valor_total_referencia_item_processo),
      awardedTotal: number(r.valor_total_homologado),
    });
  }
  return [...groups.values()].map((o) => {
    if (o.items?.length && o.items.every((i) => i.estimatedTotal !== null))
      o.value = o.items.reduce((s, i) => s + i.estimatedTotal, 0);
    return normalize(source, o);
  });
}
export function amRows(source, html) {
  const $ = load(html);
  const rows = [];
  const seen = new Set();
  $('a[href*="licitacoes_detalhes.asp"]').each((_, el) => {
    const a = $(el),
      href = new URL(a.attr("href"), source.url);
    const externalId = href.searchParams.get("ident");
    const title = a.text().replace(/\s+/g, " ").trim();
    if (!externalId || !title || seen.has(externalId)) return;
    seen.add(externalId);
    const container = a.closest(".licitacao");
    const text = container.text().replace(/\s+/g, " ").trim();
    const opening = text.match(
      /Abertura:\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+às\s+(\d{2})h(\d{2})min/i,
    );
    const year = opening
      ? opening[3].length === 2
        ? "20" + opening[3]
        : opening[3]
      : null;
    rows.push(
      normalize(source, {
        externalId,
        title,
        uf: "AM",
        modality: container.find(".modalidade").text().trim() || null,
        opening: opening
          ? `${year}-${opening[2]}-${opening[1]}T${opening[4]}:${opening[5]}:00-04:00`
          : null,
        url: href.href,
        officialStatus:
          "Listada em inscrições abertas — conferir detalhe e prazo",
        raw: { title, url: href.href, listing: text },
      }),
    );
  });
  if (!rows.length)
    throw new Error("Layout AM não reconhecido. Nenhum registro importado.");
  return rows;
}
export function itaipuRows(source, html) {
  const $ = load(html);
  const rows = [];
  $("table tr").each((_, el) => {
    const td = $(el).find("td");
    if (td.length < 6) return;
    const externalId = td.eq(0).text().trim();
    if (!/^[A-Z]{2}\s*\d{3,5}[-/]\d{2,4}$/.test(externalId)) return;
    const a = td.eq(0).find("a").attr("href");
    rows.push(
      normalize(source, {
        externalId,
        title: td.eq(2).text().trim(),
        modality: td.eq(3).text().trim(),
        opening: td.eq(4).text().trim(),
        agency: "ITAIPU Binacional",
        url: a ? new URL(a, source.url).href : source.url,
        raw: td.map((_, c) => $(c).text().trim()).get(),
      }),
    );
  });
  if (!rows.length)
    throw new Error("Tabela Itaipu não reconhecida. Validar versão do portal.");
  return rows;
}
export function mappedRows(source, rows, mapping) {
  if (!mapping?.externalId || !mapping?.title)
    throw new Error("Defina no mapeamento as colunas externalId e title.");
  return rows.map((r) => {
    const o = { raw: r };
    for (const [target, col] of Object.entries(mapping))
      if (col) o[target] = r[col];
    return normalize(source, o);
  });
}
export async function ckanResources(host, dataset) {
  const p = await get(
    `${host}/api/3/action/package_show?id=${encodeURIComponent(dataset)}`,
    "json",
  );
  if (!p.success || !Array.isArray(p.result?.resources))
    throw new Error("Catálogo CKAN inválido.");
  return p.result.resources;
}
export function peRows(source, text, fields) {
  const expected = [
    "CODIGO_PREGAO",
    "NUMERO_PROCESSO_DISPLAY",
    "UNIDADE_COMPRADORA",
    "CNPJ",
    "SOLICITACAO_COMPRA",
    "OBJETO",
    "TIPO",
    "SITUACAO",
    "COMISSAO",
    "TIPO_PREGAO",
    "CRITERIO",
    "TIPO_APURACAO",
    "DATA_INICIAL_PROPOSTA",
    "DATA_FINAL_PROPOSTA",
    "DATA_FINALIZACAO",
    "DATA_DE_ADJUDICACAO",
  ];
  if (JSON.stringify(fields) !== JSON.stringify(expected))
    throw new Error("Esquema PE mudou; importação interrompida.");
  const rows =
    typeof text === "string"
      ? parse(text, { delimiter: ";", skip_empty_lines: true, bom: true })
      : text;
  const compactDate = (v) =>
    /^\d{8}$/.test(v || "")
      ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
      : null;
  const unique = new Map();
  for (const values of rows) {
    let r;
    if (Array.isArray(values)) {
      if (values.length !== fields.length)
        throw new Error("Linha PE com quantidade de campos incompatível.");
      r = Object.fromEntries(fields.map((f, i) => [f, values[i]]));
    } else {
      r = values;
      if (expected.some((k) => !(k in r)))
        throw new Error("JSON PE com campos incompatíveis.");
    }
    unique.set(
      r.CODIGO_PREGAO,
      normalize(source, {
        externalId: r.CODIGO_PREGAO,
        title: r.OBJETO,
        agency: r.UNIDADE_COMPRADORA,
        uf: "PE",
        modality: "Pregão eletrônico",
        officialStatus: r.SITUACAO,
        opening: null,
        proposalDeadline: compactDate(r.DATA_FINAL_PROPOSTA),
        raw: r,
      }),
    );
  }
  return [...unique.values()];
}
export async function collect(source, year = new Date().getFullYear()) {
  if (source.id === "mg") {
    const resources = await ckanResources(
      "https://dados.mg.gov.br",
      "portal_licitacoes_mg",
    );
    const lic = resources.find((r) =>
      new RegExp(`licita.*${year}`, "i").test(r.name),
    );
    const items = resources.find((r) =>
      new RegExp(`itens.*${year}`, "i").test(r.name),
    );
    if (!lic)
      throw new Error(`Arquivo de licitações MG ${year} não encontrado.`);
    const rows = csv(await get(lic.url));
    const itemRows = items ? csv(await get(items.url)) : [];
    return {
      rows: mgRows(source, rows, itemRows),
      note: `Arquivo anual ${year}; cobertura depende do catálogo. Anexos ainda não extraídos.`,
    };
  }
  if (source.id === "am")
    return {
      rows: amRows(source, await get(source.url)),
      note: "Lista de inscrições abertas, modalidade e abertura quando reconhecida. Valores, itens e anexos não extraídos. Horário de Manaus.",
    };
  if (source.id === "itaipu")
    return {
      rows: itaipuRows(source, await get(source.url)),
      note: "Somente tabela pública. Anexos e resultados não extraídos.",
    };
  if (source.id === "pe") {
    const resources = await ckanResources(
      "https://dados.pe.gov.br",
      "licitacoes_peintegrado",
    );
    const resource =
      resources.find(
        (r) =>
          String(r.format).toUpperCase() === "JSON" &&
          !/metadados/i.test(r.name) &&
          new RegExp(String(year)).test(r.name),
      ) ||
      resources.find(
        (r) =>
          String(r.format).toUpperCase() === "CSV" &&
          new RegExp(String(year)).test(r.name),
      );
    if (!resource)
      return {
        discovery: resources.map((r) => ({
          name: r.name,
          url: r.url,
          format: r.format,
        })),
        note: `Catálogo não fornece arquivo ${year}. Selecione outro ano para coletar o histórico disponível.`,
      };
    const metadata = resources.find((r) => /metadados/i.test(r.name));
    if (!metadata) throw new Error("Metadados PE não encontrados.");
    const schema = await get(metadata.url, "json");
    return {
      rows: peRows(
        source,
        await get(
          resource.url,
          String(resource.format).toUpperCase() === "JSON" ? "json" : "text",
        ),
        schema.campos.map((f) => f.Nome),
      ),
      note: `Arquivo ${year} importado. Pode incluir processos de anos anteriores. Prazo final de proposta não foi tratado como abertura de sessão. Sem anexos/itens/valores.`,
    };
  }
  if (source.id === "rj") {
    const $ = load(await get(source.url));
    const files = [];
    $("a[href]").each((_, el) => {
      const name = $(el).text().trim();
      if (/EDITAIS_E_LICITACOES/i.test(name))
        files.push({
          name,
          url: new URL($(el).attr("href"), source.url).href,
          format: "ZIP",
        });
    });
    if (!files.length) throw new Error("Link de extração RJ não localizado.");
    return {
      discovery: files,
      note: "Extração descoberta; esquema de conteúdo precisa de mapeamento antes da importação.",
    };
  }
  throw new Error(
    "Conector de coleta ainda não implementado. Consulte a fonte e use importação mapeada.",
  );
}
export function parseImport(buffer, filename) {
  let data = buffer;
  if (/\.zip$/i.test(filename)) {
    const z = new AdmZip(buffer);
    const files = z
      .getEntries()
      .filter((e) => !e.isDirectory && /\.(csv|json)$/i.test(e.entryName));
    if (files.length !== 1)
      throw new Error(
        "ZIP deve conter um único CSV/JSON. Extraia e importe cada arquivo separadamente.",
      );
    if (files[0].header.size > 50 * 1024 * 1024)
      throw new Error("Arquivo descompactado excede 50 MB.");
    filename = files[0].entryName;
    data = files[0].getData();
  }
  const text = new TextDecoder("utf-8").decode(data);
  if (/\.json$/i.test(filename)) {
    const result = JSON.parse(text);
    const rows = Array.isArray(result)
      ? result
      : result.data || result.dados || result.records;
    if (!Array.isArray(rows))
      throw new Error("JSON deve ser um array ou conter data/dados/records.");
    return rows;
  }
  if (!/\.csv$/i.test(filename)) throw new Error("Use CSV, JSON ou ZIP.");
  return csv(text);
}
