export const sources = [
  [
    "bb",
    "Licitações-e / BB",
    "https://licitacoes-e.dc.bb.com.br/",
    "Portal público; validar versões e paginação.",
  ],
  [
    "rs",
    "Compras RS / CELIC",
    "https://www.compras.rs.gov.br/editais/pesquisar",
    "Consulta pública e complemento PNCP.",
  ],
  [
    "banrisul",
    "Banrisul",
    "https://www.banrisul.b.br/bob/site/link/licitacoes-contratos.html",
    "Validar portal de disputas e LICITACON.",
  ],
  [
    "ce",
    "Licitaweb CE",
    "https://s2gpr.sefaz.ce.gov.br/licita-web/paginas/licita/PublicacaoList.seam",
    "Consulta pública com sessão e filtros.",
  ],
  [
    "rj",
    "Compras RJ / Mercatto",
    "https://www.compras.rj.gov.br/Principal/extracaoTotal.action",
    "ZIP de extrações; esquema precisa ser validado.",
  ],
  [
    "sesc",
    "SESC-BA / Paradigma",
    "https://www.sescbahia.com.br/lista-licitacoes/aberto",
    "Validar página de abertos e vínculos de documentos.",
  ],
  [
    "pb",
    "Compras PB",
    "https://segc.sead.pb.gov.br/compra-direta-pub/",
    "SEGC e Central de Compras; cobertura a validar.",
  ],
  [
    "itaipu",
    "Compras Itaipu",
    "https://portaldofornecedor.itaipu.gov.br/pagina-licitacoes",
    "Consulta pública de processos; documentos a complementar.",
  ],
  [
    "pe",
    "PE-Integrado",
    "https://dados.pe.gov.br/dataset/licitacoes_peintegrado",
    "CKAN: descobrir CSV/JSON; esquema a validar.",
  ],
  [
    "am",
    "e-Compras AM",
    "https://www.e-compras.am.gov.br/publico/",
    "Página pública de inscrições; importação parcial.",
  ],
  [
    "sest",
    "SEST SENAT",
    "https://compras.sestsenat.org.br/Default.aspx",
    "Mural público dinâmico; conector pendente.",
  ],
  [
    "sc",
    "e-LIC SC / CIASC",
    "https://e-lic.sc.gov.br/Default.aspx",
    "Este endereço é do CIASC; não representa todo o estado.",
  ],
  [
    "mt",
    "Aquisições MT",
    "https://aquisicoes.seplag.mt.gov.br/licitacao-pub/#/consulta-licitacoes",
    "Aplicação JavaScript e sistema anterior.",
  ],
  [
    "mg",
    "Compras MG",
    "https://dados.mg.gov.br/dataset/portal_licitacoes_mg",
    "CSV de licitações e itens; atualização semanal declarada.",
  ],
  [
    "licitanet",
    "LicitaNet",
    "https://licitanet.com.br/",
    "Consulta pública; bloqueio 403 observado na pesquisa.",
  ],
  [
    "se",
    "ComprasNet SE",
    "https://sistema.comprasnet.se.gov.br/publico/ProcessosOrgaos.aspx?PMod=CP&pLicit=S",
    "Exportações disponíveis; rota e esquema pendentes.",
  ],
  [
    "sp",
    "BEC/SP",
    "https://www.bec.sp.gov.br/BECSP/Home/Home.aspx",
    "Consulta por Oferta de Compra; conector pendente.",
  ],
].map(([id, name, url, note]) => ({
  id,
  name,
  url,
  note,
  implementation: ["mg", "pe", "am", "itaipu", "rj"].includes(id)
    ? "experimental"
    : "pendente",
}));
