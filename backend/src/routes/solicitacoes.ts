import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'

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
const STATUS_SUPORTE = [1, 2, 3, 6, 13, 16, 17]
const STATUS_TESTES = [9, 10, 11, 16, 17]

// Status em que o atendimento fica "parado esperando alguém" — passando de 3 dias nesse
// estado o Delphi pinta o card de vermelho.
const STATUS_CONTAM_ATRASO = [1, 4, 6]
const DIAS_PARA_ATRASO = 3

const nome = (u: any) => u?.nomeCompleto || u?.nomeUsu || null

const INCLUDE_CARD = {
  cliente: { select: { id: true, nome: true, curvaABC: true, telefone: true } },
  tecnico: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
  desenvolvedor: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
} as const

function paraCard(a: any) {
  const { cliente, tecnico, desenvolvedor, ...rest } = a
  const referencia = a.dataAtendimento ?? a.dataAbertura
  const diasParado = referencia
    ? Math.floor((Date.now() - new Date(referencia).getTime()) / 86_400_000)
    : 0
  return {
    ...rest,
    clienteNome: cliente?.nome ?? '',
    clienteCurva: cliente?.curvaABC ?? null,
    clienteTelefone: cliente?.telefone ?? null,
    tecnicoNome: nome(tecnico),
    desenvolvedorNome: nome(desenvolvedor),
    diasParado,
    atrasado: diasParado > DIAS_PARA_ATRASO && STATUS_CONTAM_ATRASO.includes(Number(a.status)),
  }
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
    const { tecnicoId, desenvolvedorId, clienteId, status, busca } = request.query as Record<string, string>

    const where: Record<string, any> = { status: { in: STATUS_SUPORTE } }
    if (status) where.status = Number(status)
    if (tecnicoId) where.tecnicoId = Number(tecnicoId)
    if (desenvolvedorId) where.desenvolvedorId = Number(desenvolvedorId)
    if (clienteId) where.clienteId = Number(clienteId)
    if (busca) where.cliente = { nome: { contains: busca } }

    const itens = await prisma.atendimento.findMany({
      where,
      include: INCLUDE_CARD,
      orderBy: { id: 'asc' },
    })
    return { total: itens.length, data: itens.map(paraCard) }
  })

  // GET /solicitacoes/testes — cards da aba Gerenciamento de Teste
  app.get('/testes', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { desenvolvedorId } = request.query as Record<string, string>
    const where: Record<string, any> = { status: { in: STATUS_TESTES } }
    if (desenvolvedorId) where.desenvolvedorId = Number(desenvolvedorId)

    const itens = await prisma.atendimento.findMany({
      where,
      include: INCLUDE_CARD,
      orderBy: { id: 'asc' },
    })
    return { total: itens.length, data: itens.map(paraCard) }
  })

  // GET /solicitacoes/finalizadas — aba Solicitações finalizadas (por período)
  app.get('/finalizadas', { preHandler: authMiddleware, schema: { tags: ['Solicitações'] } }, async (request) => {
    const { dataInicio, dataFim } = request.query as Record<string, string>

    const where: Record<string, any> = { status: STATUS.CONCLUIDO }
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
    return { total: itens.length, data: itens.map(paraCard) }
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

  // ─────────────────────────────── Ações ───────────────────────────────

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
      select: { id: true, desenvolvedorId: true },
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
    return { ok: true }
  })

  // PATCH /solicitacoes/:id/desenvolvedor — "Vincular Dev"
  app.patch('/:id/desenvolvedor', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { desenvolvedorId } = request.body as { desenvolvedorId: number | null }
    const usuarioId = Number((request.user as any)?.id || 0)

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
      return { ok: true, desenvolvedorNome: nome(dev) }
    }

    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: { desenvolvedorId: null, dataUltAlteracao: new Date() },
    })
    await gravarLog(Number(id), usuarioId, 'Desenvolvedor desvinculado')
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
    return { ok: true, somenteOrientacao: !marcado }
  })

  // POST /solicitacoes/:id/cancelar — "Cancelar Atendimento"
  app.post('/:id/cancelar', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { motivo } = request.body as { motivo?: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    if (!motivo?.trim()) return reply.status(400).send({ error: 'Informe o motivo do cancelamento.' })

    const atual = await prisma.atendimento.findUnique({ where: { id: Number(id) }, select: { id: true } })
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
    return { ok: true }
  })
}
