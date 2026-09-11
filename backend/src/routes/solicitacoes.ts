import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'
import { registrarAuditoria } from '../utils/auditoria'
import { notificarAtualizacaoSolicitacao } from '../utils/notificacoesSolicitacoes'
import { SISTEMAS_VERSAO, type SistemaVersao } from './projetos'

/**
 * Compara versões no formato "6.57.3.0". Comparar como texto erraria feio ("6.9" > "6.57"), então
 * cada segmento vira número. Segmento faltando conta como zero.
 */
function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

// Códigos de Status_Atendimento — contrato com o sistema Delphi legado (UMapaAtendimentos.pas,
// combo CbSituacao). Não existe status 15. Alterar esses números quebra o fluxo real de
// suporte/desenvolvimento, porque o Delphi grava nessa mesma tabela em produção.
export const STATUS = {
  EM_FILA: 1,
  EM_ATENDIMENTO: 2,
  AGUARDANDO_CLIENTE: 3,
  AGUARDANDO_ANALISE_DEV: 4,
  EM_ANALISE_DEV: 5,
  AGUARDANDO_PROCEDIMENTO_SUPORTE: 6,
  CONCLUIDO: 7,
  CANCELADO: 8,
  AGUARDANDO_TESTES: 9,
  EM_TESTES: 10,
  TESTADO_OK: 11,
  APROVADO_DEV: 12,
  EM_DESENVOLVIMENTO: 13,
  ARQUIVADO: 14,
  CORRIGIDO_DEV: 16,
  TESTADO_COM_ERRO: 17,
} as const

// Abas do mapa, exatamente como o Delphi as consulta.
export const STATUS_SUPORTE = [1, 2, 3, 6, 13, 16, 17]
export const STATUS_TESTES = [9, 10, 11, 16, 17]
// Aba única "Backlog de Desenvolvimento" — os filtros da tela substituem a antiga aba separada
// de testes, então por padrão mostra as duas frentes juntas.
const STATUS_BACKLOG = Array.from(new Set([...STATUS_SUPORTE, ...STATUS_TESTES]))

// Status em que o atendimento fica "parado esperando alguém" — passando de 3 dias nesse
// estado o Delphi pinta o card de vermelho.
const STATUS_CONTAM_ATRASO = [1, 4, 6]
const DIAS_PARA_ATRASO = 3

const nome = (u: any) => u?.nomeCompleto || u?.nomeUsu || null

const INCLUDE_CARD = {
  cliente: { select: { id: true, nome: true, curvaABC: true, telefone: true } },
  tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
  desenvolvedor: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
  projeto: { select: { id: true, nome: true, cor: true } },
} as const

function paraCard(a: any) {
  const { cliente, tecnico, desenvolvedor, projeto, ...rest } = a
  const referencia = a.dataAtendimento ?? a.dataAbertura
  const diasParado = referencia
    ? Math.floor((Date.now() - new Date(referencia).getTime()) / 86_400_000)
    : 0
  return {
    ...rest,
    clienteNome: cliente?.nome ?? '',
    clienteCurva: cliente?.curvaABC ?? null,
    clienteTelefone: cliente?.telefone ?? null,
    projetoNome: projeto?.nome ?? null,
    projetoCor: projeto?.cor ?? null,
    tecnicoNome: nome(tecnico),
    desenvolvedorNome: nome(desenvolvedor),
    diasParado,
    atrasado: diasParado > DIAS_PARA_ATRASO && STATUS_CONTAM_ATRASO.includes(Number(a.status)),
  }
}

/**
 * Preenche quantos anexos cada card tem. A tabela agendamento_anexo é SQL puro (não é modelo
 * Prisma), então não dá pra pedir _count no include — uma query agrupada só pelos ids da página
 * resolve com um roundtrip, usando o índice (tabela, registro_id).
 */
async function comAnexos<T extends { id: number }>(cards: T[]): Promise<Array<T & { anexos: number }>> {
  if (!cards.length) return []
  const linhas = await prisma.$queryRaw<Array<{ registroId: number; total: bigint | number }>>`
    SELECT registro_id AS registroId, COUNT(*) AS total
      FROM agendamento_anexo
     WHERE tabela = 'atendimentos' AND registro_id IN (${Prisma.join(cards.map((c) => Number(c.id)))})
     GROUP BY registro_id
  `
  const porId = new Map(linhas.map((l) => [Number(l.registroId), Number(l.total)]))
  return cards.map((c) => ({ ...c, anexos: porId.get(Number(c.id)) ?? 0 }))
}

/**
 * Equivalente ao dm.GravaLogdoATendimento do Delphi. A tabela log_atendimento não tem chave
 * primária, então não dá pra modelar no Prisma — vai em SQL puro mesmo.
 */
async function gravarLog(atendimentoId: number, usuarioId: number, observacao: string) {
  await prisma.$executeRaw`
    INSERT INTO log_atendimento (cod_Atendimento, obs_atendimento, data_hora_log, cod_usu)
    VALUES (${atendimentoId}, ${observacao.slice(0, 300)}, NOW(), ${usuarioId})
  `
}

/**
 * Equivalente ao AlterarStatusAtendimento do Delphi: muda o status e carimba Data_Ult_alteracao,
 * sempre acompanhado de um registro no log.
 */
async function alterarStatus(atendimentoId: number, usuarioId: number, status: number, log: string) {
  await prisma.atendimento.update({
    where: { id: atendimentoId },
    data: { status, dataUltAlteracao: new Date() },
  })
  await gravarLog(atendimentoId, usuarioId, log)
}

/**
 * Toda ação que grava passa por aqui. Ver a tela (permissão 'solicitacoes') não dá direito de
 * mexer na etapa — pra isso o usuário precisa de 'solicitacoes-acoes'.
 */
async function exigirPermissaoDeAcao(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = Number((request.user as any)?.id || 0)
  const permissoes = await getUserPermissions(usuarioId)
  if (!permissoes.includes('*') && !permissoes.includes('solicitacoes-acoes')) {
    return reply.status(403).send({ error: 'Você não tem permissão para alterar a etapa das solicitações.' })
  }
}

export async function solicitacoesRoutes(app: FastifyInstance) {
  // ─────────────────────────────── Leitura ───────────────────────────────

  // GET /solicitacoes/suporte — cards da aba Suporte
  app.get('/suporte', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { tecnicoId, desenvolvedorId, clienteId, status, busca, prioritario, projetoId } = request.query as Record<string, string>

    // Cada filtro aceita uma lista separada por vírgula (multi-seleção na tela) ou um valor único.
    const paraLista = (v?: string) => v?.split(',').map(Number).filter((n) => !Number.isNaN(n)) ?? []

    const statusLista = paraLista(status)
    const tecnicoLista = paraLista(tecnicoId)
    const desenvolvedorLista = paraLista(desenvolvedorId)
    const projetoLista = paraLista(projetoId)

    const where: Record<string, any> = { status: { in: statusLista.length ? statusLista : STATUS_BACKLOG } }
    if (tecnicoLista.length) where.tecnicoId = { in: tecnicoLista }
    if (desenvolvedorLista.length) where.desenvolvedorId = { in: desenvolvedorLista }
    if (projetoLista.length) where.projetoId = { in: projetoLista }
    if (clienteId) where.clienteId = Number(clienteId)
    if (busca) where.cliente = { nome: { contains: busca } }
    if (prioritario === 'true') where.prioritario = 'S'

    const itens = await prisma.atendimento.findMany({
      where,
      include: INCLUDE_CARD,
      orderBy: { id: 'asc' },
    })
    return { total: itens.length, data: await comAnexos(itens.map(paraCard)) }
  })

  // GET /solicitacoes/finalizadas — aba Solicitações finalizadas (por período)
  app.get('/finalizadas', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { dataInicio, dataFim, tecnicoId, desenvolvedorId, projetoId, busca, prioritario } =
      request.query as Record<string, string>

    // Mesmos filtros da aba de backlog — a etapa não entra porque aqui tudo é Concluído.
    const paraLista = (v?: string) => v?.split(',').map(Number).filter((n) => !Number.isNaN(n)) ?? []
    const tecnicoLista = paraLista(tecnicoId)
    const desenvolvedorLista = paraLista(desenvolvedorId)
    const projetoLista = paraLista(projetoId)

    const where: Record<string, any> = { status: STATUS.CONCLUIDO }
    if (tecnicoLista.length) where.tecnicoId = { in: tecnicoLista }
    if (desenvolvedorLista.length) where.desenvolvedorId = { in: desenvolvedorLista }
    if (projetoLista.length) where.projetoId = { in: projetoLista }
    if (busca) where.cliente = { nome: { contains: busca } }
    if (prioritario === 'true') where.prioritario = 'S'
    if (dataInicio || dataFim) {
      where.dataFechamento = {}
      if (dataInicio) where.dataFechamento.gte = new Date(`${dataInicio}T00:00:00`)
      if (dataFim) {
        const fim = new Date(`${dataFim}T00:00:00`)
        fim.setDate(fim.getDate() + 1)
        where.dataFechamento.lt = fim
      }
    }

    const itens = await prisma.atendimento.findMany({
      where,
      include: INCLUDE_CARD,
      orderBy: { dataFechamento: 'desc' },
      take: 500,
    })
    return { total: itens.length, data: await comAnexos(itens.map(paraCard)) }
  })

  // GET /solicitacoes/notas-atualizacao — botão "Notas de atualização" da aba Finalizadas:
  // junta o Obs_Atendimento de tudo que foi concluído no período, pronto pra virar release notes.
  app.get('/notas-atualizacao', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { dataInicio, dataFim } = request.query as Record<string, string>
    if (!dataInicio || !dataFim) return reply.status(400).send({ error: 'Informe dataInicio e dataFim.' })

    const fim = new Date(`${dataFim}T00:00:00`)
    fim.setDate(fim.getDate() + 1)

    const itens = await prisma.atendimento.findMany({
      where: {
        status: STATUS.CONCLUIDO,
        dataFechamento: { gte: new Date(`${dataInicio}T00:00:00`), lt: fim },
      },
      select: { id: true, observacoes: true, projeto: { select: { nome: true } } },
      orderBy: { dataFechamento: 'asc' },
    })

    // O que o pessoal digita vem cheio de linha em branco, espaço no fim e indentação solta.
    // Limpa cada linha e derruba sequências de linhas vazias, senão a lista sai esparramada.
    const limpar = (texto: string) =>
      texto
        .split('\n')
        .map((linha) => linha.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    // Importações em lote gravam a mesma frase em centenas de registros ("LANCADO VIA EXCEL" e
    // afins). Repetir isso na nota não informa nada, então cada texto entra uma vez só.
    const vistos = new Map<string, { projeto: string | null; texto: string }>()
    for (const a of itens) {
      const texto = limpar(a.observacoes ?? '')
      if (!texto) continue
      const chave = texto.toLowerCase()
      if (!vistos.has(chave)) vistos.set(chave, { projeto: a.projeto?.nome ?? null, texto })
    }
    const comTexto = [...vistos.values()]

    const dataBR = (iso: string) => iso.split('-').reverse().join('/')
    const cabecalho = [
      `NOTAS DE ATUALIZAÇÃO — ${dataBR(dataInicio)} a ${dataBR(dataFim)}`,
      `${itens.length} ${itens.length === 1 ? 'solicitação concluída' : 'solicitações concluídas'}` +
        (comTexto.length !== itens.length ? ` · ${comTexto.length} descrição(ões) distinta(s)` : ''),
      '',
    ]

    // Sem número de item nem número do ticket: a nota vai pro cliente, e id interno não diz nada
    // pra ele. Agrupa por projeto (na ordem em que apareceram) pra não repetir o nome do projeto
    // linha a linha.
    const porProjeto = new Map<string, typeof comTexto>()
    for (const a of comTexto) {
      const chave = a.projeto ?? ''
      const grupo = porProjeto.get(chave)
      if (grupo) grupo.push(a)
      else porProjeto.set(chave, [a])
    }

    const blocos = [...porProjeto.entries()].map(([projeto, itensDoProjeto]) => {
      const corpo = itensDoProjeto
        .map((a) =>
          a.texto
            .split('\n')
            .map((linha, i) => (linha ? (i === 0 ? `- ${linha}` : `  ${linha}`) : ''))
            .join('\n')
        )
        .join('\n\n')
      return projeto ? `${projeto.toUpperCase()}\n${corpo}` : corpo
    })

    const texto = comTexto.length ? [...cabecalho, blocos.join('\n\n')].join('\n') : ''
    return { total: itens.length, texto }
  })

  // GET /solicitacoes/pendentes-atualizacao — aba "Clientes a atualizar".
  // Fecha o ciclo suporte → desenvolvimento → cliente: mostra quem pediu algo que já foi entregue
  // numa versão, mas continua rodando uma versão anterior a ela.
  app.get('/pendentes-atualizacao', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { tecnicoId, desenvolvedorId, projetoId, busca, prioritario } = request.query as Record<string, string>
    const paraLista = (v?: string) => v?.split(',').map(Number).filter((n) => !Number.isNaN(n)) ?? []
    const tecnicoLista = paraLista(tecnicoId)
    const desenvolvedorLista = paraLista(desenvolvedorId)
    const projetoLista = paraLista(projetoId)

    const where: Record<string, any> = {
      status: STATUS.CONCLUIDO,
      dataFechamento: { not: null },
      projeto: { sistemaVersao: { not: null } },
    }
    if (tecnicoLista.length) where.tecnicoId = { in: tecnicoLista }
    if (desenvolvedorLista.length) where.desenvolvedorId = { in: desenvolvedorLista }
    if (projetoLista.length) where.projetoId = { in: projetoLista }
    if (busca) where.cliente = { nome: { contains: busca } }
    if (prioritario === 'true') where.prioritario = 'S'

    const concluidas = await prisma.atendimento.findMany({
      where,
      // Igual ao card, mas precisa também de qual versão o projeto acompanha.
      include: { ...INCLUDE_CARD, projeto: { select: { id: true, nome: true, cor: true, sistemaVersao: true } } },
      orderBy: { dataFechamento: 'desc' },
      take: 1000,
    })
    if (!concluidas.length) return { total: 0, data: [] }

    // Versões lançadas dos sistemas envolvidos, uma vez só — comparar em memória evita uma
    // consulta por solicitação.
    const sistemas = [...new Set(concluidas.map((a) => a.projeto?.sistemaVersao).filter(Boolean) as string[])]
    const idsSistema = sistemas.map((s) => SISTEMAS_VERSAO[s as SistemaVersao].sistemaId)
    const versoes = await prisma.versao.findMany({
      where: { sistemaId: { in: idsSistema }, data: { not: null } },
      select: { sistemaId: true, versao: true, data: true },
      orderBy: { data: 'asc' },
    })

    // Versão instalada em cada cliente (tabela legada, sem modelo Prisma).
    const clienteIds = [...new Set(concluidas.map((a) => a.clienteId).filter(Boolean) as number[])]
    const instaladas = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT cod_cli AS clienteId, versao_exe_retaguarda AS RETAGUARDA,
              versao_exe_pdv AS PDV, versao_exe_connection AS CONNECTION
         FROM dados_gerais_clientes WHERE cod_cli IN (${clienteIds.map(() => '?').join(',') || 'NULL'})`,
      ...clienteIds,
    )
    const porCliente = new Map(instaladas.map((r) => [Number(r.clienteId), r]))

    const pendentes = concluidas.flatMap((a) => {
      const sistema = a.projeto?.sistemaVersao as SistemaVersao | null | undefined
      if (!sistema || !a.clienteId || !a.dataFechamento) return []

      // A entrega saiu na primeira versão publicada depois que a solicitação foi concluída.
      const sistemaId = SISTEMAS_VERSAO[sistema].sistemaId
      const entrega = versoes.find((v) => v.sistemaId === sistemaId && v.data! >= a.dataFechamento!)
      if (!entrega) return []

      const instalada = porCliente.get(a.clienteId)?.[sistema]
      const instaladaTexto = instalada ? String(instalada).trim() : ''
      if (!instaladaTexto) return []
      if (compararVersao(instaladaTexto, entrega.versao) >= 0) return []

      return [{
        ...paraCard(a),
        sistema,
        sistemaLabel: SISTEMAS_VERSAO[sistema].label,
        versaoInstalada: instaladaTexto,
        versaoEntrega: entrega.versao,
        dataEntrega: entrega.data,
      }]
    })

    return { total: pendentes.length, data: pendentes }
  })

  // GET /solicitacoes/:id/log — "Consultar Log do Atendimento (F11)"
  app.get('/:id/log', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const linhas = await prisma.$queryRaw<Array<{ obs: string; data: Date; usuario: string | null }>>`
      SELECT l.obs_atendimento AS obs, l.data_hora_log AS data,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario
        FROM log_atendimento l
        LEFT JOIN usuario u ON u.COD_USU = l.cod_usu
       WHERE l.cod_Atendimento = ${Number(id)}
       ORDER BY l.data_hora_log DESC
       LIMIT 200
    `
    return { data: linhas }
  })

  // GET /solicitacoes/procedimentos — catálogo de procedimentos (tabela legada)
  app.get('/procedimentos', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async () => {
    const linhas = await prisma.$queryRaw<Array<{ id: number; descricao: string; pontuacao: number }>>`
      SELECT cod_procedimento AS id, TRIM(descricao) AS descricao, COALESCE(pontuacao, 0) AS pontuacao
        FROM procedimentos
       WHERE descricao IS NOT NULL AND TRIM(descricao) <> ''
       ORDER BY TRIM(descricao)
    `
    return { data: linhas }
  })

  // GET /solicitacoes/:id/procedimentos — procedimentos efetuados no atendimento
  app.get('/:id/procedimentos', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const linhas = await prisma.$queryRaw<Array<{ id: number; descricao: string; pontuacao: number; data: Date }>>`
      SELECT p.cod_procedimento AS id, p.descricao, pa.pontuacao, pa.data_hora_lan AS data
        FROM procedimentos_atendimentos pa
        INNER JOIN procedimentos p ON p.cod_procedimento = pa.cod_procedimento
       WHERE pa.cod_atendimento = ${Number(id)}
       ORDER BY pa.data_hora_lan
    `
    return { data: linhas }
  })

  // ─────────────────────────────── Ações ───────────────────────────────

  // POST /solicitacoes — Novo Atendimento (aba "Salvar atendimento" do lançamento)
  app.post('/', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0)

    if (!b.clienteId) return reply.status(400).send({ error: 'Selecione o cliente.' })
    if (!b.observacoes?.trim()) return reply.status(400).send({ error: 'Descreva os dados do atendimento.' })
    if (!b.desenvolvedorId) return reply.status(400).send({ error: 'Selecione o desenvolvedor responsável.' })

    // Mesmas opções de abertura que o Delphi oferece no lançamento.
    const statusAbertura: number[] = [1, 2, 3, 4, 6, 9]
    const status = Number(b.status ?? STATUS.EM_ATENDIMENTO)
    if (!statusAbertura.includes(status)) {
      return reply.status(400).send({ error: 'Status de abertura inválido.' })
    }
    if (status === STATUS.AGUARDANDO_TESTES && !b.desenvolvedorId) {
      return reply.status(400).send({ error: 'Vincule um desenvolvedor para abrir aguardando testes.' })
    }

    const agora = new Date()
    const bug = b.bugSistema ? 'S' : ''
    const criado = await prisma.atendimento.create({
      data: {
        clienteId: Number(b.clienteId),
        tipoContato: Number(b.tipoContato ?? 0),
        observacoes: String(b.observacoes).slice(0, 5000),
        status,
        dataAbertura: agora,
        dataAtendimento: b.dataAtendimento ? new Date(b.dataAtendimento) : agora,
        usuarioLancId: usuarioId,
        // O Delphi grava 'S' ou string vazia — não 'N'. Manter igual pra não divergir das telas legadas.
        prioritario: b.urgente ? 'S' : '',
        foraHorario: b.foraHorario ? 'S' : '',
        bugSistema: bug,
        // Bug do sistema entra como prioridade A, exatamente como no lançamento legado.
        prioridade: bug ? 'A' : '',
        // Sem técnico escolhido o atendimento fica com quem lançou.
        tecnicoId: b.tecnicoId ? Number(b.tecnicoId) : usuarioId,
        desenvolvedorId: b.desenvolvedorId ? Number(b.desenvolvedorId) : null,
        projetoId: b.projetoId ? Number(b.projetoId) : null,
      },
      select: { id: true },
    })

    await gravarLog(criado.id, usuarioId, 'Atendimento lançado')
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: criado.id,
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: { clienteId: Number(b.clienteId), status, observacoes: String(b.observacoes).slice(0, 500) },
    })
    return reply.status(201).send({ ok: true, id: criado.id })
  })

  // PUT /solicitacoes/:id — Alterar Atendimento
  app.put('/:id', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.atendimento.findUnique({
      where: { id: Number(id) },
      select: {
        clienteId: true, observacoes: true, solucao: true, tipoContato: true,
        tecnicoId: true, desenvolvedorId: true, prioritario: true, foraHorario: true, bugSistema: true, projetoId: true,
      },
    })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    const dados: Record<string, any> = { dataUltAlteracao: new Date() }
    if (b.clienteId) dados.clienteId = Number(b.clienteId)
    if (b.observacoes !== undefined) dados.observacoes = String(b.observacoes).slice(0, 5000)
    if (b.solucao !== undefined) dados.solucao = String(b.solucao).slice(0, 2000)
    if (b.tipoContato !== undefined) dados.tipoContato = Number(b.tipoContato)
    // O técnico responsável nunca é zerado: vindo vazio, mantém o que já estava gravado e, se nem
    // isso existir, fica com quem está alterando (mesma regra do lançamento no POST).
    if (b.tecnicoId !== undefined) dados.tecnicoId = Number(b.tecnicoId) || atual.tecnicoId || usuarioId
    if (b.desenvolvedorId !== undefined) dados.desenvolvedorId = b.desenvolvedorId ? Number(b.desenvolvedorId) : null
    if (b.projetoId !== undefined) dados.projetoId = b.projetoId ? Number(b.projetoId) : null
    if (b.urgente !== undefined) dados.prioritario = b.urgente ? 'S' : ''
    if (b.foraHorario !== undefined) dados.foraHorario = b.foraHorario ? 'S' : ''
    if (b.bugSistema !== undefined) {
      dados.bugSistema = b.bugSistema ? 'S' : ''
      dados.prioridade = b.bugSistema ? 'A' : ''
    }

    await prisma.atendimento.update({ where: { id: Number(id) }, data: dados })
    await gravarLog(Number(id), usuarioId, 'Atendimento alterado')
    const { dataUltAlteracao, ...dadosAuditados } = dados
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: atual,
      dadosDepois: { ...atual, ...dadosAuditados },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, 'Atendimento alterado')
    return { ok: true }
  })

  // POST /solicitacoes/:id/finalizar — aba "Finalização" do lançamento
  app.post('/:id/finalizar', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { solucao } = request.body as { solucao?: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.atendimento.findUnique({ where: { id: Number(id) }, select: { id: true, status: true } })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })
    if (atual.status === STATUS.CONCLUIDO) return reply.status(400).send({ error: 'Essa solicitação já está concluída.' })

    const solucaoTexto = solucao?.trim() ?? ''
    const agora = new Date()
    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: {
        status: STATUS.CONCLUIDO,
        solucao: solucaoTexto.slice(0, 2000),
        dataFechamento: agora,
        dataUltAlteracao: agora,
      },
    })
    await gravarLog(Number(id), usuarioId, solucaoTexto ? `Atendimento finalizado: ${solucaoTexto}` : 'Atendimento finalizado')
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'STATUS',
      usuarioId,
      dadosAntes: { status: atual.status },
      dadosDepois: { status: STATUS.CONCLUIDO, solucao: solucaoTexto.slice(0, 500) },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, solucaoTexto ? `Finalizada: ${solucaoTexto}` : 'Finalizada')
    return { ok: true }
  })

  // POST /solicitacoes/:id/procedimentos — registra um procedimento efetuado
  app.post('/:id/procedimentos', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { procedimentoId } = request.body as { procedimentoId: number }
    const usuarioId = Number((request.user as any)?.id || 0)

    if (!procedimentoId) return reply.status(400).send({ error: 'Selecione o procedimento.' })

    const [proc] = await prisma.$queryRaw<Array<{ descricao: string; pontuacao: number }>>`
      SELECT descricao, pontuacao FROM procedimentos WHERE cod_procedimento = ${Number(procedimentoId)}
    `
    if (!proc) return reply.status(404).send({ error: 'Procedimento não encontrado.' })

    await prisma.$executeRaw`
      INSERT INTO procedimentos_atendimentos (cod_atendimento, cod_procedimento, pontuacao, data_hora_lan)
      VALUES (${Number(id)}, ${Number(procedimentoId)}, ${proc.pontuacao ?? 0}, NOW())
    `
    await gravarLog(Number(id), usuarioId, `Procedimento efetuado: ${proc.descricao}`)
    await registrarAuditoria({
      tabela: 'procedimentos_atendimentos',
      registroId: Number(id),
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: { procedimentoId: Number(procedimentoId), descricao: proc.descricao },
    })
    return reply.status(201).send({ ok: true })
  })

  // DELETE /solicitacoes/:id/procedimentos/:procedimentoId
  app.delete('/:id/procedimentos/:procedimentoId', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request) => {
    const { id, procedimentoId } = request.params as { id: string; procedimentoId: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    await prisma.$executeRaw`
      DELETE FROM procedimentos_atendimentos
       WHERE cod_atendimento = ${Number(id)} AND cod_procedimento = ${Number(procedimentoId)}
    `
    await gravarLog(Number(id), usuarioId, 'Procedimento removido')
    await registrarAuditoria({
      tabela: 'procedimentos_atendimentos',
      registroId: Number(id),
      acao: 'EXCLUSAO',
      usuarioId,
      dadosAntes: { procedimentoId: Number(procedimentoId) },
    })
    return { ok: true }
  })

  // PATCH /solicitacoes/:id/status — troca de status genérica do fluxo
  app.patch('/:id/status', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, observacao } = request.body as { status: number; observacao?: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    const permitidos: number[] = [
      STATUS.EM_ATENDIMENTO, STATUS.AGUARDANDO_ANALISE_DEV, STATUS.EM_ANALISE_DEV,
      STATUS.APROVADO_DEV, STATUS.EM_DESENVOLVIMENTO, STATUS.AGUARDANDO_TESTES,
      STATUS.EM_TESTES, STATUS.TESTADO_OK, STATUS.CORRIGIDO_DEV, STATUS.TESTADO_COM_ERRO,
    ]
    if (!permitidos.includes(Number(status))) {
      return reply.status(400).send({ error: 'Status não permitido por esta tela.' })
    }

    const atual = await prisma.atendimento.findUnique({
      where: { id: Number(id) },
      select: { id: true, status: true, desenvolvedorId: true },
    })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    // Mesma trava do Delphi: sem desenvolvedor vinculado não vai pra desenvolvimento.
    if (Number(status) === STATUS.EM_DESENVOLVIMENTO && !atual.desenvolvedorId) {
      return reply.status(400).send({ error: 'Vincule um desenvolvedor antes de colocar em desenvolvimento.' })
    }

    // Justificativa é o que aparece no log — o Delphi pede ela nesses dois passos.
    const exigeJustificativa: number[] = [STATUS.TESTADO_COM_ERRO, STATUS.CORRIGIDO_DEV]
    if (exigeJustificativa.includes(Number(status)) && !observacao?.trim()) {
      return reply.status(400).send({ error: 'Informe a justificativa para essa alteração.' })
    }

    const rotulos: Record<number, string> = {
      [STATUS.EM_ATENDIMENTO]: 'Voltou para Em Atendimento',
      [STATUS.AGUARDANDO_ANALISE_DEV]: 'Aguardando Análise do Desenvolvimento',
      [STATUS.EM_ANALISE_DEV]: 'Em Análise pelo Desenvolvimento',
      [STATUS.APROVADO_DEV]: 'Aprovado pelo Desenvolvimento',
      [STATUS.EM_DESENVOLVIMENTO]: 'Em Desenvolvimento',
      [STATUS.AGUARDANDO_TESTES]: 'Aguardando Testes',
      [STATUS.EM_TESTES]: 'Em Testes',
      [STATUS.TESTADO_OK]: 'Testado OK',
      [STATUS.CORRIGIDO_DEV]: 'Corrigido pelo desenvolvimento',
      [STATUS.TESTADO_COM_ERRO]: 'Testado com Erros',
    }
    const texto = observacao?.trim()
      ? `${rotulos[Number(status)]}: ${observacao.trim()}`
      : rotulos[Number(status)]

    await alterarStatus(Number(id), usuarioId, Number(status), texto)
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'STATUS',
      usuarioId,
      dadosAntes: { status: atual.status },
      dadosDepois: { status: Number(status), observacao: observacao?.trim() || null },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, texto)
    return { ok: true }
  })

  // PATCH /solicitacoes/:id/desenvolvedor — "Vincular Dev"
  app.patch('/:id/desenvolvedor', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { desenvolvedorId } = request.body as { desenvolvedorId: number | null }
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.atendimento.findUnique({ where: { id: Number(id) }, select: { desenvolvedorId: true } })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    if (desenvolvedorId) {
      const dev = await prisma.usuario.findUnique({
        where: { id: Number(desenvolvedorId) },
        select: { id: true, nomeUsu: true, nomeCompleto: true },
      })
      if (!dev) return reply.status(404).send({ error: 'Desenvolvedor não encontrado.' })

      await prisma.atendimento.update({
        where: { id: Number(id) },
        data: { desenvolvedorId: dev.id, dataUltAlteracao: new Date() },
      })
      await gravarLog(Number(id), usuarioId, `Desenvolvedor vinculado: ${nome(dev)}`)
      await registrarAuditoria({
        tabela: 'atendimentos',
        registroId: Number(id),
        acao: 'ALTERACAO',
        usuarioId,
        dadosAntes: { desenvolvedorId: atual.desenvolvedorId },
        dadosDepois: { desenvolvedorId: dev.id },
      })
      void notificarAtualizacaoSolicitacao(Number(id), usuarioId, `Desenvolvedor vinculado: ${nome(dev)}`)
      return { ok: true, desenvolvedorNome: nome(dev) }
    }

    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: { desenvolvedorId: null, dataUltAlteracao: new Date() },
    })
    await gravarLog(Number(id), usuarioId, 'Desenvolvedor desvinculado')
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: { desenvolvedorId: atual.desenvolvedorId },
      dadosDepois: { desenvolvedorId: null },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, 'Desenvolvedor desvinculado')
    return { ok: true, desenvolvedorNome: null }
  })

  // PATCH /solicitacoes/:id/prioritario — "Marcar como Prioritário" (a estrela do card)
  app.patch('/:id/prioritario', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.atendimento.findUnique({
      where: { id: Number(id) },
      select: { prioritario: true },
    })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    const marcado = atual.prioritario === 'S'
    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: { prioritario: marcado ? 'N' : 'S', dataUltAlteracao: new Date() },
    })
    await gravarLog(Number(id), usuarioId, marcado ? 'Removido como prioritário' : 'Marcado como prioritário')
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: { prioritario: atual.prioritario },
      dadosDepois: { prioritario: marcado ? 'N' : 'S' },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, marcado ? 'Removido como prioritário' : 'Marcado como prioritário')
    return { ok: true, prioritario: !marcado }
  })

  // PATCH /solicitacoes/:id/orientacao — "Somente Orientação (Não Desenvolver)"
  app.patch('/:id/orientacao', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.atendimento.findUnique({
      where: { id: Number(id) },
      select: { somenteOrientacao: true },
    })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    const marcado = atual.somenteOrientacao === 'S'
    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: { somenteOrientacao: marcado ? 'N' : 'S', dataUltAlteracao: new Date() },
    })
    await gravarLog(Number(id), usuarioId, marcado ? 'Removido de Somente Orientação' : 'Marcado como Somente Orientação (não desenvolver)')
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: { somenteOrientacao: atual.somenteOrientacao },
      dadosDepois: { somenteOrientacao: marcado ? 'N' : 'S' },
    })
    void notificarAtualizacaoSolicitacao(
      Number(id),
      usuarioId,
      marcado ? 'Removido de Somente Orientação' : 'Marcado como Somente Orientação (não desenvolver)'
    )
    return { ok: true, somenteOrientacao: !marcado }
  })

  // POST /solicitacoes/:id/cancelar — "Cancelar Atendimento"
  app.post('/:id/cancelar', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { motivo } = request.body as { motivo?: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    if (!motivo?.trim()) return reply.status(400).send({ error: 'Informe o motivo do cancelamento.' })

    const atual = await prisma.atendimento.findUnique({ where: { id: Number(id) }, select: { status: true } })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: {
        status: STATUS.CANCELADO,
        motivoCancelamento: motivo.trim().slice(0, 300),
        usuarioCancelamentoId: usuarioId,
        dataCancelamento: new Date(),
        dataUltAlteracao: new Date(),
      },
    })
    await gravarLog(Number(id), usuarioId, `Atendimento cancelado: ${motivo.trim()}`)
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'STATUS',
      usuarioId,
      dadosAntes: { status: atual.status },
      dadosDepois: { status: STATUS.CANCELADO, motivo: motivo.trim().slice(0, 300) },
    })
    void notificarAtualizacaoSolicitacao(Number(id), usuarioId, `Cancelada: ${motivo.trim()}`)
    return { ok: true }
  })
}
