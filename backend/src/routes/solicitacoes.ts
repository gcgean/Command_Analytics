import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'
import { registrarAuditoria } from '../utils/auditoria'

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
    const { tecnicoId, desenvolvedorId, clienteId, status, busca, prioritario } = request.query as Record<string, string>

    // Cada filtro aceita uma lista separada por vírgula (multi-seleção na tela) ou um valor único.
    const paraLista = (v?: string) => v?.split(',').map(Number).filter((n) => !Number.isNaN(n)) ?? []

    const statusLista = paraLista(status)
    const tecnicoLista = paraLista(tecnicoId)
    const desenvolvedorLista = paraLista(desenvolvedorId)

    const where: Record<string, any> = { status: { in: statusLista.length ? statusLista : STATUS_BACKLOG } }
    if (tecnicoLista.length) where.tecnicoId = { in: tecnicoLista }
    if (desenvolvedorLista.length) where.desenvolvedorId = { in: desenvolvedorLista }
    if (clienteId) where.clienteId = Number(clienteId)
    if (busca) where.cliente = { nome: { contains: busca } }
    if (prioritario === 'true') where.prioritario = 'S'

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
      select: { observacoes: true },
      orderBy: { dataFechamento: 'asc' },
    })

    const texto = itens
      .map((a) => a.observacoes?.trim())
      .filter((obs): obs is string => !!obs)
      .join('\n')

    return { total: itens.length, texto }
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
        tecnicoId: true, desenvolvedorId: true, prioritario: true, foraHorario: true, bugSistema: true,
      },
    })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })

    const dados: Record<string, any> = { dataUltAlteracao: new Date() }
    if (b.clienteId) dados.clienteId = Number(b.clienteId)
    if (b.observacoes !== undefined) dados.observacoes = String(b.observacoes).slice(0, 5000)
    if (b.solucao !== undefined) dados.solucao = String(b.solucao).slice(0, 2000)
    if (b.tipoContato !== undefined) dados.tipoContato = Number(b.tipoContato)
    if (b.tecnicoId !== undefined) dados.tecnicoId = b.tecnicoId ? Number(b.tecnicoId) : null
    if (b.desenvolvedorId !== undefined) dados.desenvolvedorId = b.desenvolvedorId ? Number(b.desenvolvedorId) : null
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
    return { ok: true }
  })

  // POST /solicitacoes/:id/finalizar — aba "Finalização" do lançamento
  app.post('/:id/finalizar', { preHandler: [authMiddleware, exigirPermissaoDeAcao], schema: { tags: ['Solicitações'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { solucao } = request.body as { solucao?: string }
    const usuarioId = Number((request.user as any)?.id || 0)

    if (!solucao?.trim()) return reply.status(400).send({ error: 'Descreva a solução antes de finalizar.' })

    const atual = await prisma.atendimento.findUnique({ where: { id: Number(id) }, select: { id: true, status: true } })
    if (!atual) return reply.status(404).send({ error: 'Solicitação não encontrada.' })
    if (atual.status === STATUS.CONCLUIDO) return reply.status(400).send({ error: 'Essa solicitação já está concluída.' })

    const agora = new Date()
    await prisma.atendimento.update({
      where: { id: Number(id) },
      data: {
        status: STATUS.CONCLUIDO,
        solucao: solucao.trim().slice(0, 2000),
        dataFechamento: agora,
        dataUltAlteracao: agora,
      },
    })
    await gravarLog(Number(id), usuarioId, `Atendimento finalizado: ${solucao.trim()}`)
    await registrarAuditoria({
      tabela: 'atendimentos',
      registroId: Number(id),
      acao: 'STATUS',
      usuarioId,
      dadosAntes: { status: atual.status },
      dadosDepois: { status: STATUS.CONCLUIDO, solucao: solucao.trim().slice(0, 500) },
    })
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
    return { ok: true }
  })
}
