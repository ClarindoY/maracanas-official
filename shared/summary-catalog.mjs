// Cada categoria permanece explícita, mesmo quando os documentos não a informam.
export const SUMMARY_BLOCKS=[
 ['Informações gerais e participação',[
 'Identificação do órgão, pregão, processo e plataforma','Objeto detalhado e modalidade de contratação','Critério de julgamento e modo de disputa','Datas e horários de abertura, disputa e envio de documentos','Valor global, valores por lote e limites unitários','Situação, retificações e esclarecimentos presentes nos documentos','Participação de agências de viagens e organizadoras de eventos','Consórcios e subcontratações']],
 ['Habilitação e documentação',[
 'Checklist documento por documento','Documentação jurídica, fiscal, trabalhista e econômico-financeira','Atestados: características, quantitativos e somatório','Capital social ou patrimônio líquido mínimo','Índices contábeis e fórmulas','Declarações e modelos obrigatórios','Certificados, registros e licenças','Documentos dos hotéis e demais fornecedores','Documentos por fase: proposta, habilitação e contrato']],
 ['Detalhamento técnico do objeto',[
 'Quantidades de serviços, unidades e diárias','Participantes e distribuição por grupo','Check-in, check-out e execução','Apartamentos e configurações de camas','Categoria, localização, distância e infraestrutura dos hotéis','Refeições, cardápio e atendimento','Salas, auditórios, equipamentos e estruturas','Veículos, capacidade, horários e condições','Passagens aéreas e seguro-viagem','Equipe operacional, monitoria, receptivo e preposto','Exigências eliminatórias e preferências']],
 ['Formação de preços e estratégia de disputa',[
 'Tabela completa de itens, quantidades e valores referenciais','Valores fixos, reembolsáveis e disputáveis','Custos de fornecedores por item','Tributos, administração e custos indiretos','Margem por item e global','Descontos e cenários de rentabilidade','Preço-alvo e limite mínimo viável','Lances, negociação e desclassificação','Exequibilidade e comprovação']],
 ['Obrigações contratuais e riscos financeiros',[
 'Vigência e execução contratual','Pagamento: condições, prazos e documentos','Antecipação de valores','Garantia: percentual, prazo e modalidades','Cancelamento, remarcação e no-show','Multas, sanções e rescisão','Reajuste e reequilíbrio','Obrigações da contratada e dos fornecedores','Fluxo de caixa e capital de giro','Faturamento e comprovação dos serviços']],
 ['Mapeamento e viabilidade operacional',[
 'Tipos de fornecedores necessários','Hotéis e estabelecimentos compatíveis','Capacidade de apartamentos e estruturas','Disponibilidade nas datas','Distâncias e método de medição','Documentação dos fornecedores','Alternativas em caso de indisponibilidade','Cronograma de contratação, reservas e execução']],
 ['Pendências, inconsistências e esclarecimentos',[
 'Divergências entre edital, TR e anexos','Datas, valores e quantitativos contraditórios','Exigências ambíguas','Confirmações oficiais necessárias','Fundamentos para esclarecimento ou impugnação','Cláusula, item e página de cada ocorrência']],
 ['Parecer estratégico e plano de ação',[
 'Compatibilidade com a atuação da empresa','Viabilidade técnica, documental, operacional e financeira','Oportunidades comerciais','Riscos prioritários','Pendências, prioridades e responsáveis','Próximas providências e prazos','Conclusão e justificativa']]
].map(([title,labels],b)=>({id:'b'+(b+1),title,fields:labels.map((label,i)=>({id:'b'+(b+1)+'_'+(i+1),label}))}));
export const SUMMARY_FIELDS=SUMMARY_BLOCKS.flatMap(b=>b.fields.map(f=>({...f,blockId:b.id})));
export const EXTERNAL_FIELDS=new Set(['b4_3','b4_4','b4_5','b4_6','b4_7','b5_9','b6_2','b6_4','b6_7','b8_1','b8_2','b8_3','b8_4','b8_5','b8_6','b8_7']);
export function pricingScenario(rows,discount){
 if(!Array.isArray(rows)||!rows.length||!Number.isFinite(discount)||discount<0||discount>=100)return null;
 let revenue=0,cost=0,tax=0;const items=[];
 for(const r of rows){const vals=['quantity','unitPrice','unitCost','taxPercent','indirectCost'].map(k=>r[k]);if(vals.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||r.quantity<=0||r.taxPercent>=100)return null;
 const gross=r.quantity*r.unitPrice*(r.disputable===false?1:1-discount/100),base=r.quantity*r.unitCost+r.indirectCost,taxes=gross*r.taxPercent/100;
 revenue+=gross;cost+=base;tax+=taxes;items.push({name:r.name,revenue:gross,cost:base,tax:taxes,profit:gross-base-taxes,breakEven:base/(1-r.taxPercent/100)});
 }
 return {revenue,cost,tax,profit:revenue-cost-tax,margin:revenue?(revenue-cost-tax)/revenue*100:null,items,breakEven:items.reduce((s,i)=>s+i.breakEven,0)};
}
