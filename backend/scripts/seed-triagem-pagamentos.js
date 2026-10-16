/**
 * Cadastra a triagem de meios de pagamento no motor genérico.
 *
 * É um script de CADASTRO, não código de aplicação: as perguntas e os cenários vivem no banco e
 * podem ser editados depois sem deploy. Rodar de novo atualiza o que mudou e preserva os
 * atendimentos já existentes.
 *
 *   node scripts/seed-triagem-pagamentos.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SLUG = 'meios-pagamento'

const MOTIVOS = [
  'Quero contratar uma integração',
  'Quero saber se minha maquininha é compatível',
  'Já contratei e aguardo habilitação',
  'Preciso instalar ou configurar',
  'Tenho integração, mas está apresentando erro',
  'Tenho dúvida sobre como vender ou receber pagamentos',
  'Quero adicionar outra maquininha',
  'Outro assunto',
]

// As opções saem do catálogo de operadoras — o mesmo que o cadastro de maquininhas usa.
// Duas listas paralelas divergiriam, e aí a resposta da triagem não encontraria a operadora
// na hora de registrar a maquininha do cliente.
let ADQUIRENTES = []

async function carregarAdquirentes() {
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT nome FROM cadastro_operadoras WHERE ativo = 1 ORDER BY ordem, nome`)
  // "Outra" por último, qualquer que seja a ordem do catálogo: é a saída, não uma opção
  // no meio da lista.
  ADQUIRENTES = linhas.map((l) => l.nome)
    .sort((a, b) => (a === 'Outra' ? 1 : b === 'Outra' ? -1 : 0))
  if (ADQUIRENTES.length === 0) {
    throw new Error('Catálogo de operadoras vazio. Suba a API uma vez para ele ser semeado.')
  }
}

const montarPerguntas = () => [
  // ── Identificação ──
  // O que o cadastro já sabe vem com `origem` e nasce preenchido. O responsável e o telefone
  // são de quem está ligando agora, então vêm do próprio atendimento, não da ficha do cliente.
  { chave: 'cnpj', texto: 'CNPJ', tipo: 'cnpj', grupo: 'Identificação', obrigatoria: 1, publico: 'ambos', origem: 'cliente.cnpj' },
  { chave: 'razao_social', texto: 'Razão social', tipo: 'texto', grupo: 'Identificação', obrigatoria: 1, publico: 'ambos', origem: 'cliente.razao_social' },
  { chave: 'nome_fantasia', texto: 'Nome fantasia', tipo: 'texto', grupo: 'Identificação', publico: 'ambos', origem: 'cliente.nome_fantasia' },
  { chave: 'responsavel', texto: 'Quem está falando', ajuda: 'Nome da pessoa que entrou em contato.', tipo: 'texto', grupo: 'Identificação', obrigatoria: 1, publico: 'ambos', origem: 'contato.nome' },
  { chave: 'telefone', texto: 'WhatsApp do contato', tipo: 'telefone', grupo: 'Identificação', obrigatoria: 1, publico: 'ambos', origem: 'contato.telefone' },
  { chave: 'email', texto: 'E-mail', tipo: 'texto', grupo: 'Identificação', publico: 'ambos', origem: 'cliente.email' },

  // ── Necessidade ──
  {
    chave: 'motivo', texto: 'Qual é o motivo do atendimento?', tipo: 'opcao',
    opcoes: MOTIVOS, grupo: 'Necessidade', obrigatoria: 1, publico: 'ambos',
  },
  {
    chave: 'assunto_duvida', texto: 'Sobre qual assunto é a dúvida?', tipo: 'opcao',
    opcoes: [
      'Delivery e pagamento no domicílio', 'Pix estático ou transferência', 'Pix dinâmico',
      'Vendas a prazo e eCONF', 'Cancelamentos e estornos', 'Produtos e serviços',
      'Falhas e contingência', 'Obrigatoriedade e enquadramento',
    ],
    grupo: 'Necessidade', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho dúvida sobre como vender ou receber pagamentos' },
  },

  // ── Perfil operacional ──
  { chave: 'caixas', texto: 'Quantos caixas a empresa possui?', tipo: 'numero', grupo: 'Perfil operacional', obrigatoria: 1, publico: 'ambos' },
  { chave: 'caixas_simultaneos', texto: 'Quantos funcionam ao mesmo tempo?', tipo: 'numero', grupo: 'Perfil operacional', publico: 'ambos' },
  {
    chave: 'volume', texto: 'Volume aproximado de transações por dia', tipo: 'opcao',
    opcoes: ['Até 50', 'De 51 a 200', 'De 201 a 500', 'Acima de 500'],
    grupo: 'Perfil operacional', publico: 'ambos',
  },
  {
    chave: 'equipamento', texto: 'Qual equipamento de pagamento utiliza hoje?', tipo: 'opcao',
    opcoes: ['Nenhum', 'Maquininha avulsa (sem integração)', 'SmartPOS', 'TEF/PinPad'],
    grupo: 'Perfil operacional', obrigatoria: 1, publico: 'ambos',
  },
  {
    chave: 'adquirente', texto: 'Qual é a adquirente ou operadora?', tipo: 'opcao',
    opcoes: ADQUIRENTES, grupo: 'Perfil operacional', obrigatoria: 1, publico: 'ambos',
  },
  {
    chave: 'adquirente_outra', texto: 'Qual adquirente ou operadora?', tipo: 'texto',
    ajuda: 'Informe o nome como aparece na sua maquininha ou no extrato.',
    grupo: 'Perfil operacional', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'adquirente', operador: 'igual', valor: 'Outra' },
  },
  {
    // Alimenta a quantidade no cadastro de maquininhas do cliente.
    chave: 'qtd_maquininhas', texto: 'Quantas maquininhas desse tipo?', tipo: 'numero',
    grupo: 'Perfil operacional', publico: 'ambos',
    condicao: { chave: 'equipamento', operador: 'diferente', valor: 'Nenhum' },
  },
  {
    chave: 'recebimento', texto: 'Onde recebe os pagamentos?', tipo: 'opcao',
    opcoes: ['No estabelecimento', 'Em delivery', 'Nos dois'], grupo: 'Perfil operacional', publico: 'ambos',
  },
  {
    chave: 'meios', texto: 'Quais meios de pagamento aceita?', tipo: 'multipla',
    opcoes: ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Vale/benefício', 'A prazo'],
    grupo: 'Perfil operacional', publico: 'ambos',
  },
  {
    chave: 'ja_integrado', texto: 'Já possui integração com o Command?', tipo: 'sim_nao',
    grupo: 'Perfil operacional', obrigatoria: 1, publico: 'ambos',
  },
  {
    // A etiqueta atrás do aparelho traz modelo e série. Com a foto, o suporte confere a
    // compatibilidade na hora, em vez de pedir o dado de novo depois.
    chave: 'foto_equipamento', texto: 'Foto da etiqueta atrás da maquininha', tipo: 'foto',
    ajuda: 'Vire o aparelho e fotografe a etiqueta com o modelo e o número de série. '
      + 'Se a etiqueta estiver apagada ou não existir, abra o menu "Sobre" no sistema da '
      + 'própria maquininha: o número de série aparece lá, e a foto dessa tela serve. '
      + 'Se tiver mais de uma maquininha, envie uma foto de cada.',
    // Não é obrigatória: cliente sem o aparelho em mãos não pode ficar travado na triagem.
    grupo: 'Perfil operacional', publico: 'ambos',
    condicao: { chave: 'equipamento', operador: 'diferente', valor: 'Nenhum' },
  },

  // ── SmartPOS ──
  {
    chave: 'modelo_smartpos', texto: 'Modelo da maquininha', tipo: 'texto',
    grupo: 'SmartPOS', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'equipamento', operador: 'igual', valor: 'SmartPOS' },
  },
  {
    chave: 'serie_smartpos', texto: 'Número de série da maquininha', tipo: 'texto',
    ajuda: 'Normalmente fica na etiqueta atrás do aparelho.',
    grupo: 'SmartPOS', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'equipamento', operador: 'igual', valor: 'SmartPOS' },
  },

  // ── TEF/PinPad ──
  // EC e número lógico quem fornece é a adquirente. O cliente raramente tem isso em mãos na
  // hora da ligação, então não podem travar a triagem: viram pendência dentro do processo.
  {
    chave: 'tem_dados_tef', texto: 'Já tem o EC e o número lógico da adquirente?', tipo: 'sim_nao',
    ajuda: 'Esses dois dados são fornecidos pela adquirente. Se ainda não tiver, orientamos como pedir.',
    grupo: 'TEF/PinPad', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'equipamento', operador: 'igual', valor: 'TEF/PinPad' },
  },
  {
    chave: 'ec_tef', texto: 'Código de estabelecimento (EC)', tipo: 'texto',
    ajuda: 'Fornecido pela adquirente.',
    grupo: 'TEF/PinPad', publico: 'ambos',
    condicao: { chave: 'tem_dados_tef', operador: 'igual', valor: 'Sim' },
  },
  {
    chave: 'logico_tef', texto: 'Número lógico', tipo: 'texto',
    ajuda: 'Fornecido pela adquirente, junto com o EC.',
    grupo: 'TEF/PinPad', publico: 'ambos',
    condicao: { chave: 'tem_dados_tef', operador: 'igual', valor: 'Sim' },
  },

  // ── Erro de transação ──
  {
    chave: 'erro_data', texto: 'Data e horário da transação', tipo: 'texto',
    grupo: 'Transação com erro', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' },
  },
  {
    chave: 'erro_valor', texto: 'Valor da transação', tipo: 'texto',
    grupo: 'Transação com erro', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' },
  },
  {
    chave: 'erro_identificador', texto: 'Identificador da transação (NSU/autorização), se tiver', tipo: 'texto',
    grupo: 'Transação com erro', publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' },
  },
  {
    chave: 'erro_documento', texto: 'Situação do documento fiscal', tipo: 'opcao',
    opcoes: ['Não emitido', 'Emitido', 'Emitido e cancelado', 'Não sei informar'],
    grupo: 'Transação com erro', obrigatoria: 1, publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' },
  },
  {
    chave: 'erro_mensagem', texto: 'Mensagem de erro exibida', tipo: 'longo',
    grupo: 'Transação com erro', publico: 'ambos',
    condicao: { chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' },
  },

  // ── Só o atendente ──
  {
    chave: 'obs_tecnica', texto: 'Observações do atendente', tipo: 'longo',
    grupo: 'Uso interno', publico: 'tecnico',
  },
]

/** Slug ASCII estável, para a chave do cenário não depender de acento nem de maiúscula. */
const chaveDe = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

// Ordem = prioridade: o primeiro que casar vence.
//
// Os cenários guiados pelo MOTIVO vêm antes dos guiados pelo EQUIPAMENTO. Quem liga com erro de
// transação, ou com dúvida sobre delivery, precisa cair ali — e não no fluxo do SmartPOS só
// porque é o aparelho que ele usa.
const CENARIOS = [
  {
    chave: 'erro-sem-confirmacao',
    nome: 'D — Pagamento aprovado sem confirmação no sistema',
    descricao: 'A transação foi aprovada na maquininha, mas o Command não confirmou.',
    prioridade: 'alta',
    condicoes: [{ chave: 'motivo', operador: 'igual', valor: 'Tenho integração, mas está apresentando erro' }],
    alerta: 'Não orientar uma nova cobrança antes de verificar a transação anterior. '
      + 'Cobrar de novo pode duplicar o débito ao cliente final.',
    passos: [
      'Confirmar data, horário, valor e equipamento da transação',
      'Coletar o identificador da transação (NSU ou código de autorização), quando houver',
      'Verificar a situação do documento fiscal',
      'Registrar a mensagem de erro exibida',
      'Encaminhar para análise técnica — não encerrar no primeiro contato',
    ],
  },
  // ── Cenários sem regra operacional aprovada ──
  // Ficam cadastrados para o atendente não improvisar: identificam a situação e encaminham.
  ...[
    ['Delivery e pagamento no domicílio', 'Delivery e pagamento no domicílio',
      'Compra presencial com entrega posterior, venda não presencial, pagamento no domicílio, '
      + 'antecipado e por intermediador são situações diferentes — não tratar como equivalentes.'],
    ['Pix estático ou transferência', 'Pix estático ou transferência', null],
    ['Pix dinâmico', 'Pix dinâmico', null],
    ['Vendas a prazo e eCONF', 'Vendas a prazo e eCONF',
      'Não recomendar promissória, crediário ou pagamento posterior como forma de evitar '
      + 'a integração ou a identificação fiscal.'],
    ['Cancelamentos e estornos', 'Cancelamentos e estornos', null],
    ['Produtos e serviços', 'Produtos e serviços',
      'Não recomendar cadastrar prestação de serviço como mercadoria apenas para viabilizar a emissão.'],
    ['Falhas e contingência', 'Falhas e contingência',
      'Não recomendar o uso habitual de maquininha sem integração como solução alternativa.'],
    ['Obrigatoriedade e enquadramento', 'Obrigatoriedade e enquadramento', null],
  ].map(([assunto, rotulo, alerta]) => ({
    chave: `duvida-${chaveDe(assunto)}`,
    nome: `Dúvida — ${rotulo} (pendente de validação)`,
    descricao: 'Sem regra operacional aprovada. Registrar a dúvida e encaminhar ao responsável.',
    prioridade: 'normal',
    condicoes: [{ chave: 'assunto_duvida', operador: 'igual', valor: assunto }],
    alerta: [alerta, 'Este cenário ainda não tem orientação aprovada: não improvisar resposta. '
      + 'Registrar a dúvida e encaminhar ao responsável fiscal ou técnico.'].filter(Boolean).join(' '),
    passos: [
      'Registrar a dúvida exatamente como o cliente colocou',
      'Coletar o contexto: como vende, como recebe e o que já tentou',
      'Encaminhar ao responsável fiscal ou técnico',
      'Não dar orientação definitiva antes do retorno',
    ],
  })),

  {
    chave: 'maquina-adicional',
    nome: 'Inclusão de máquina adicional',
    checklist: true,
    descricao: 'Cliente já integrado quer somar outro equipamento.',
    condicoes: [{ chave: 'motivo', operador: 'igual', valor: 'Quero adicionar outra maquininha' }],
    passos: [
      'Confirmar a integração que já existe e está funcionando',
      'Coletar os dados do equipamento novo: adquirente, modelo e número de série',
      'Verificar a compatibilidade',
      'Solicitar a habilitação do equipamento adicional',
      'Configurar e executar o checklist de testes no caixa novo',
    ],
  },

  // ── Por equipamento: só valem quando o motivo não define o fluxo ──
  {
    chave: 'smartpos',
    nome: 'B — Cliente com SmartPOS',
    checklist: true,
    descricao: 'Cliente usa SmartPOS e precisa integrar ao Command.',
    condicoes: [{ chave: 'equipamento', operador: 'igual', valor: 'SmartPOS' }],
    passos: [
      'Conferir CNPJ, razão social, adquirente, modelo e número de série',
      'Verificar a compatibilidade do modelo com a adquirente informada',
      'Solicitar a habilitação MobTEF em https://portal.tef.net.br/novo/',
      'Acompanhar a disponibilização do aplicativo MPM+ no aparelho',
      'Configurar a integração no Command',
      'Executar o checklist de testes obrigatórios',
    ],
    alerta: 'A compatibilidade do modelo precisa de confirmação técnica — não prometer antes de conferir. '
      + 'O prazo de 48 horas da habilitação é referência operacional, não garantia.',
  },
  {
    chave: 'tef-pinpad',
    nome: 'C — Cliente com TEF/PinPad',
    checklist: true,
    descricao: 'Cliente usa TEF com PinPad e precisa do cadastro junto ao fornecedor.',
    condicoes: [{ chave: 'equipamento', operador: 'igual', valor: 'TEF/PinPad' }],
    passos: [
      'Coletar CNPJ, razão social, nome fantasia, telefone, e-mail e quantidade de caixas',
      'Identificar a adquirente e coletar o código de estabelecimento (EC) e o número lógico',
      'Sem o EC e o número lógico, orientar o cliente a pedi-los à adquirente e combinar o '
        + 'retorno — o cadastro no fornecedor TEF não anda sem esses dados',
      'Encaminhar o cadastro ao fornecedor TEF',
      'Aguardar a aprovação do fornecedor',
      'Agendar a instalação e preparar o acesso remoto (https://tef.net.br/multicanal/)',
      'Configurar no Command e executar o checklist de testes',
    ],
  },
  {
    chave: 'sem-integracao',
    nome: 'A — Cliente sem integração',
    descricao: 'Cliente ainda não tem meio de pagamento integrado ao Command.',
    condicoes: [{ chave: 'ja_integrado', operador: 'igual', valor: 'Não' }],
    passos: [
      'Confirmar a quantidade de caixas e o movimento do estabelecimento',
      'Identificar a adquirente e o equipamento atual',
      'Verificar a compatibilidade com confirmação técnica',
      'Avaliar com o cliente SmartPOS ou TEF/PinPad conforme o perfil',
      'Confirmar a contratação',
      'Encaminhar para habilitação',
    ],
    alerta: 'Não apresentar TEF ou SmartPOS como obrigação legal universal. '
      + 'A escolha depende do perfil operacional do cliente.',
  },
]

const CHECKLIST = {
  nome: 'Testes de integração de pagamento',
  descricao: 'Obrigatório antes de considerar a integração instalada.',
  itens: [
    'Comunicação entre o Command e o equipamento',
    'Valor enviado corretamente ao equipamento',
    'Pagamento de teste autorizado',
    'Retorno da transação recebido no Command',
    'Forma de pagamento registrada corretamente',
    'Conferência fiscal, quando aplicável',
    'Validação final com o cliente',
  ],
}

// Etapa em que o processo nasce no Pipeline. O nome é procurado no cadastro de etapas:
// o id muda de ambiente, o nome não.
const ETAPA_INICIAL = 'Aguardando Instalação'

async function main() {
  await carregarAdquirentes()

  const [etapa] = await prisma.$queryRawUnsafe(
    `SELECT id FROM cadastro_etapas WHERE nome = ? AND ativo = 1 LIMIT 1`, ETAPA_INICIAL)
  const etapaId = etapa ? Number(etapa.id) : null
  if (!etapaId) {
    console.warn(`AVISO: etapa "${ETAPA_INICIAL}" não encontrada; o processo vai nascer na `
      + 'primeira etapa ativa do quadro.')
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO triagem_modelo
       (nome, slug, descricao, tipo_processo, etapa_inicial, acao_conclusao, permite_link)
     VALUES (?,?,?,?,?,?,1)
     ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao),
       tipo_processo = VALUES(tipo_processo), etapa_inicial = VALUES(etapa_inicial),
       acao_conclusao = VALUES(acao_conclusao)`,
    'Integração de Meios de Pagamento', SLUG,
    'Triagem guiada para integrar maquininhas e meios de pagamento ao Command.',
    'triagem_pagamentos', etapaId, 'maquininha',
  )
  const [m] = await prisma.$queryRawUnsafe(`SELECT id FROM triagem_modelo WHERE slug = ?`, SLUG)
  const modeloId = Number(m.id)

  let ordem = 0
  for (const p of montarPerguntas()) {
    ordem += 10
    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_pergunta
         (modelo_id, chave, texto, ajuda, tipo, opcoes, obrigatoria, publico, condicao, grupo, origem, ordem, ativo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE texto=VALUES(texto), ajuda=VALUES(ajuda), tipo=VALUES(tipo),
         opcoes=VALUES(opcoes), obrigatoria=VALUES(obrigatoria), publico=VALUES(publico),
         condicao=VALUES(condicao), grupo=VALUES(grupo), origem=VALUES(origem),
         ordem=VALUES(ordem), ativo=1`,
      modeloId, p.chave, p.texto, p.ajuda ?? null, p.tipo,
      JSON.stringify(p.opcoes ?? []), p.obrigatoria ?? 0, p.publico ?? 'ambos',
      p.condicao ? JSON.stringify(p.condicao) : null, p.grupo ?? null, p.origem ?? null, ordem,
    )
  }

  // Checklist no cadastro que o Pipeline já usa, visível na tela da triagem. Vem antes dos
  // cenários porque eles guardam o id dele.
  const [jaTem] = await prisma.$queryRawUnsafe(
    `SELECT id FROM cadastro_checklists WHERE nome = ?`, CHECKLIST.nome)
  let checklistId
  if (jaTem) {
    checklistId = Number(jaTem.id)
    await prisma.$executeRawUnsafe(
      `UPDATE cadastro_checklists SET descricao = ?, itens = ?, telas = ?, ativo = 1 WHERE id = ?`,
      CHECKLIST.descricao, JSON.stringify(CHECKLIST.itens),
      JSON.stringify(['implantacao', 'triagem']), checklistId)
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cadastro_checklists (nome, descricao, itens, telas, etapas, ativo, ordem)
       VALUES (?,?,?,?,'[]',1,99)`,
      CHECKLIST.nome, CHECKLIST.descricao, JSON.stringify(CHECKLIST.itens),
      JSON.stringify(['implantacao', 'triagem']))
    const [novo] = await prisma.$queryRawUnsafe(
      `SELECT id FROM cadastro_checklists WHERE nome = ?`, CHECKLIST.nome)
    checklistId = Number(novo.id)
  }

  // Cenários são atualizados pela chave. Apagar e recriar trocaria os ids e deixaria os
  // atendimentos já abertos apontando para cenário inexistente.
  await prisma.$executeRawUnsafe(
    `UPDATE triagem_cenario SET ativo = 0 WHERE modelo_id = ?`, modeloId)
  let oc = 0
  for (const c of CENARIOS) {
    oc += 10
    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_cenario
         (modelo_id, chave, nome, descricao, condicoes, passos, alerta, prioridade, checklist_id, ordem, ativo)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE nome=VALUES(nome), descricao=VALUES(descricao),
         condicoes=VALUES(condicoes), passos=VALUES(passos), alerta=VALUES(alerta),
         prioridade=VALUES(prioridade), checklist_id=VALUES(checklist_id),
         ordem=VALUES(ordem), ativo=1`,
      modeloId, c.chave, c.nome, c.descricao ?? null,
      JSON.stringify(c.condicoes ?? []), JSON.stringify(c.passos ?? []),
      c.alerta ?? null, c.prioridade ?? 'normal', c.checklist ? checklistId : null, oc,
    )
  }

  const [p] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) q FROM triagem_pergunta WHERE modelo_id = ? AND ativo = 1`, modeloId)
  const [c] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) q FROM triagem_cenario WHERE modelo_id = ? AND ativo = 1`, modeloId)
  console.log(`Triagem "${SLUG}": ${Number(p.q)} perguntas, ${Number(c.q)} cenários, `
    + `checklist com ${CHECKLIST.itens.length} itens.`)
}

main()
  .catch((e) => { console.error('ERRO:', String(e?.message ?? e).split('\n').pop()); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
