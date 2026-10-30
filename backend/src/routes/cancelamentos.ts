import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import { getUserPermissions } from './grupos'

/**
 * Pedidos de cancelamento de integração de pagamento.
 *
 * Duas confirmações, de pessoas diferentes: quem atende marca que encaminhou à operadora,
 * o financeiro marca que a cobrança foi baixada. Guardar as duas separadas é o que permite
 * responder "está parado em quem?" sem ligar para ninguém.
 */

const num = (v: any) => (v == null ? 0 : Number(v))
const ehData = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))

/** Marcar a baixa é ato do financeiro: ver a tela não dá esse direito. */
async function exigirPermissaoFinanceiro(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = Number((request.user as any)?.id || 0)
  const permissoes = await getUserPermissions(usuarioId)
  if (!permissoes.includes('*') && !permissoes.includes('cancelamento-financeiro')) {
    return reply.status(403).send({
      error: 'Só o financeiro pode confirmar o cancelamento.',
    })
  }
}

function formatar(r: any) {
  const enviado = Number(r.enviado_operadora) === 1
  const baixado = Number(r.cancelado_financeiro) === 1
  return {
    id: Number(r.id),
    clienteId: r.cliente_id == null ? null : Number(r.cliente_id),
    clienteNome: String(r.cliente_nome ?? '').trim(),
    cnpj: r.cnpj ?? null,
    dataSolicitacao: r.data_solicitacao ?? null,
    operadora: r.operadora ?? null,
    observacao: r.observacao ?? null,
    enviadoOperadora: enviado,
    enviadoOperadoraEm: r.enviado_operadora_em ?? null,
    enviadoOperadoraPor: r.nome_enviou ?? null,
    canceladoFinanceiro: baixado,
    canceladoFinanceiroEm: r.cancelado_financeiro_em ?? null,
    canceladoFinanceiroPor: r.nome_financeiro ?? null,
    // O que falta, dito em uma palavra: é o que a lista precisa mostrar.
    situacao: baixado ? 'concluido' : enviado ? 'aguardando_financeiro' : 'aberto',
    criadoEm: r.criado_em ?? null,
    criadoPor: r.nome_criou ?? null,
  }
}

const SELECT_BASE = `
  SELECT c.*,
         COALESCE(uc.NOME_USUARIO_COMPLETO, uc.NOME_USU) AS nome_criou,
         COALESCE(ue.NOME_USUARIO_COMPLETO, ue.NOME_USU) AS nome_enviou,
         COALESCE(uf.NOME_USUARIO_COMPLETO, uf.NOME_USU) AS nome_financeiro
    FROM triagem_cancelamento c
    LEFT JOIN usuario uc ON uc.COD_USU = c.criado_por
    LEFT JOIN usuario ue ON ue.COD_USU = c.enviado_operadora_por
    LEFT JOIN usuario uf ON uf.COD_USU = c.cancelado_financeiro_por`

export async function cancelamentosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async (request) => {
    const { situacao, busca, inicio, fim } = request.query as Record<string, string>
    const cond: string[] = []
    const val: any[] = []

    if (situacao === 'aberto') cond.push('c.enviado_operadora = 0 AND c.cancelado_financeiro = 0')
    else if (situacao === 'aguardando_financeiro') cond.push('c.enviado_operadora = 1 AND c.cancelado_financeiro = 0')
    else if (situacao === 'concluido') cond.push('c.cancelado_financeiro = 1')
    else if (situacao === 'pendente') cond.push('c.cancelado_financeiro = 0')

    if (busca) {
      cond.push('(c.cliente_nome LIKE ? OR c.cnpj LIKE ? OR c.observacao LIKE ?)')
      const t = `%${busca}%`
      val.push(t, t, t)
    }
    if (ehData(inicio)) { cond.push('c.data_solicitacao >= ?'); val.push(inicio) }
    if (ehData(fim)) { cond.push('c.data_solicitacao <= ?'); val.push(fim) }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `${SELECT_BASE}
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
       ORDER BY c.cancelado_financeiro, c.data_solicitacao DESC, c.id DESC
       LIMIT 500`, ...val).catch(() => [])

    const itens = linhas.map(formatar)
    return {
      total: itens.length,
      abertos: itens.filter((i) => i.situacao === 'aberto').length,
      aguardandoFinanceiro: itens.filter((i) => i.situacao === 'aguardando_financeiro').length,
      concluidos: itens.filter((i) => i.situacao === 'concluido').length,
      itens,
    }
  })

  /** Operadoras do cadastro — a mesma lista usada nas maquininhas. */
  app.get('/operadoras', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT nome FROM cadastro_operadoras WHERE ativo = 1 ORDER BY ordem, nome`).catch(() => [])
    return linhas.map((r) => String(r.nome ?? '').trim()).filter(Boolean)
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const clienteId = Number(b.clienteId ?? 0) || null
    if (!clienteId) return reply.status(400).send({ error: 'Escolha o cliente que pediu o cancelamento.' })
    if (!ehData(b.dataSolicitacao)) {
      return reply.status(400).send({ error: 'Informe a data em que o cliente pediu o cancelamento.' })
    }

    const [cliente] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cod_cli, NOME_CLI, NOME_FANTASIA, CNPJ_CLI FROM cliente WHERE cod_cli = ?`, clienteId)
    if (!cliente) return reply.status(400).send({ error: 'Cliente não encontrado no cadastro.' })

    await prisma.$executeRawUnsafe(
      `INSERT INTO triagem_cancelamento
         (cliente_id, cliente_nome, cnpj, data_solicitacao, operadora, observacao, criado_por)
       VALUES (?,?,?,?,?,?,?)`,
      clienteId,
      String(cliente.NOME_FANTASIA || cliente.NOME_CLI || '').slice(0, 200),
      String(cliente.CNPJ_CLI ?? '').replace(/\D/g, '').slice(0, 20) || null,
      b.dataSolicitacao,
      String(b.operadora ?? '').trim().slice(0, 80) || null,
      String(b.observacao ?? '').trim() || null,
      usuarioId)

    const [novo] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
    const id = Number(novo?.id ?? 0)
    registrarAuditoria({
      tabela: 'triagem_cancelamento', registroId: id, acao: 'CRIACAO', usuarioId,
      dadosAntes: null, dadosDepois: { clienteId, dataSolicitacao: b.dataSolicitacao },
    })
    return reply.status(201).send({ id })
  })

  /** Edita o que é do registro: data, operadora e observação. */
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const b = request.body as Record<string, any>
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_cancelamento WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Pedido não encontrado.' })
    if (b.dataSolicitacao !== undefined && !ehData(b.dataSolicitacao)) {
      return reply.status(400).send({ error: 'Data da solicitação inválida.' })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_cancelamento
          SET data_solicitacao = ?, operadora = ?, observacao = ?
        WHERE id = ?`,
      b.dataSolicitacao ?? atual.data_solicitacao,
      b.operadora === undefined ? atual.operadora : (String(b.operadora).trim().slice(0, 80) || null),
      b.observacao === undefined ? atual.observacao : (String(b.observacao).trim() || null),
      id)

    registrarAuditoria({
      tabela: 'triagem_cancelamento', registroId: id, acao: 'ALTERACAO',
      usuarioId: Number((request.user as any)?.id || 0),
      dadosAntes: { dataSolicitacao: atual.data_solicitacao, operadora: atual.operadora, observacao: atual.observacao },
      dadosDepois: { dataSolicitacao: b.dataSolicitacao, operadora: b.operadora, observacao: b.observacao },
    })
    const [novo] = await prisma.$queryRawUnsafe<any[]>(`${SELECT_BASE} WHERE c.id = ?`, id)
    return formatar(novo)
  })

  /** Marca (ou desmarca) o envio à operadora. Quem desmarca também fica registrado. */
  app.patch('/:id/operadora', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const enviado = (request.body as { enviado?: boolean })?.enviado !== false
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_cancelamento WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Pedido não encontrado.' })

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_cancelamento
          SET enviado_operadora = ?,
              enviado_operadora_em = ${enviado ? 'UTC_TIMESTAMP()' : 'NULL'},
              enviado_operadora_por = ?
        WHERE id = ?`, enviado ? 1 : 0, enviado ? usuarioId : null, id)

    registrarAuditoria({
      tabela: 'triagem_cancelamento', registroId: id, acao: 'STATUS', usuarioId,
      dadosAntes: { enviadoOperadora: num(atual.enviado_operadora) === 1 },
      dadosDepois: { enviadoOperadora: enviado },
    })
    const [novo] = await prisma.$queryRawUnsafe<any[]>(`${SELECT_BASE} WHERE c.id = ?`, id)
    return formatar(novo)
  })

  /** Baixa do financeiro. */
  app.patch('/:id/financeiro', { preHandler: [authMiddleware, exigirPermissaoFinanceiro], schema: { tags: ['Cancelamentos'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const cancelado = (request.body as { cancelado?: boolean })?.cancelado !== false
    const usuarioId = Number((request.user as any)?.id || 0) || null
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_cancelamento WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Pedido não encontrado.' })

    await prisma.$executeRawUnsafe(
      `UPDATE triagem_cancelamento
          SET cancelado_financeiro = ?,
              cancelado_financeiro_em = ${cancelado ? 'UTC_TIMESTAMP()' : 'NULL'},
              cancelado_financeiro_por = ?
        WHERE id = ?`, cancelado ? 1 : 0, cancelado ? usuarioId : null, id)

    registrarAuditoria({
      tabela: 'triagem_cancelamento', registroId: id, acao: 'STATUS', usuarioId,
      dadosAntes: { canceladoFinanceiro: num(atual.cancelado_financeiro) === 1 },
      dadosDepois: { canceladoFinanceiro: cancelado },
    })
    const [novo] = await prisma.$queryRawUnsafe<any[]>(`${SELECT_BASE} WHERE c.id = ?`, id)
    return formatar(novo)
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Cancelamentos'] } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM triagem_cancelamento WHERE id = ?`, id)
    if (!atual) return reply.status(404).send({ error: 'Pedido não encontrado.' })
    if (Number(atual.cancelado_financeiro) === 1) {
      return reply.status(400).send({
        error: 'Pedido já baixado pelo financeiro não pode ser excluído — desmarque a baixa antes.',
      })
    }
    await prisma.$executeRawUnsafe(`DELETE FROM triagem_cancelamento WHERE id = ?`, id)
    registrarAuditoria({
      tabela: 'triagem_cancelamento', registroId: id, acao: 'EXCLUSAO',
      usuarioId: Number((request.user as any)?.id || 0),
      dadosAntes: { clienteNome: atual.cliente_nome, dataSolicitacao: atual.data_solicitacao },
      dadosDepois: null,
    })
    return { ok: true }
  })
}
