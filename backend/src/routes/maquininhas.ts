import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'
import {
  ensureMaquininhas,
  TIPOS_MAQUININHA,
  STATUS_MAQUININHA,
} from '../utils/maquininhas'

type MaquininhaRow = {
  id: number
  clienteId: number
  operadoraId: number
  operadoraNome: string | null
  tipo: string
  quantidade: number
  statusIntegracao: string
  observacao: string | null
}

function tipoValido(valor: unknown): boolean {
  return TIPOS_MAQUININHA.includes(String(valor).toUpperCase() as never)
}

function statusValido(valor: unknown): boolean {
  return STATUS_MAQUININHA.includes(String(valor).toUpperCase() as never)
}

export async function maquininhasRoutes(app: FastifyInstance) {
  // ── Catálogo de operadoras ─────────────────────────────────
  app.get('/operadoras', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Catálogo de operadoras' } }, async () => {
    await ensureMaquininhas()
    const rows = await prisma.$queryRaw<Array<{ id: number; nome: string }>>`
      SELECT id, nome FROM cadastro_operadoras WHERE ativo = 1 ORDER BY ordem ASC, nome ASC
    `
    return rows.map((r) => ({ id: Number(r.id), nome: r.nome }))
  })

  // ── Maquininhas de um cliente ──────────────────────────────
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Maquininhas do cliente' } }, async (request, reply) => {
    await ensureMaquininhas()
    const { clienteId } = request.query as { clienteId?: string }
    const id = Number(clienteId)
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })

    const rows = await prisma.$queryRaw<MaquininhaRow[]>`
      SELECT M.id, M.cliente_id AS clienteId, M.operadora_id AS operadoraId,
             O.nome AS operadoraNome, M.tipo, M.quantidade,
             M.status_integracao AS statusIntegracao, M.observacao
      FROM cliente_maquininhas M
      LEFT JOIN cadastro_operadoras O ON O.id = M.operadora_id
      WHERE M.cliente_id = ${id}
      ORDER BY O.nome ASC, M.id ASC
    `
    return rows.map((r) => ({
      id: Number(r.id),
      clienteId: Number(r.clienteId),
      operadoraId: Number(r.operadoraId),
      operadoraNome: r.operadoraNome || 'Operadora removida',
      tipo: r.tipo,
      quantidade: Number(r.quantidade),
      statusIntegracao: r.statusIntegracao,
      observacao: r.observacao,
    }))
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Cadastra maquininha do cliente' } }, async (request, reply) => {
    await ensureMaquininhas()
    const { clienteId, operadoraId, tipo, quantidade, statusIntegracao, observacao } = request.body as Record<string, unknown>
    const usuarioId = Number((request.user as any)?.id || 0) || null

    const idCliente = Number(clienteId)
    const idOperadora = Number(operadoraId)
    const qtd = Number(quantidade ?? 1)

    if (!Number.isFinite(idCliente) || idCliente <= 0) return reply.status(400).send({ error: 'Cliente inválido.' })
    if (!Number.isFinite(idOperadora) || idOperadora <= 0) return reply.status(400).send({ error: 'Selecione a operadora.' })
    if (!tipoValido(tipo)) return reply.status(400).send({ error: 'Tipo inválido (use TEF ou SMARTPOS).' })
    if (!statusValido(statusIntegracao ?? 'NAO_INTEGRADO')) return reply.status(400).send({ error: 'Status inválido.' })
    if (!Number.isFinite(qtd) || qtd < 1) return reply.status(400).send({ error: 'Quantidade deve ser pelo menos 1.' })

    const operadora = await prisma.$queryRaw<Array<{ id: number; nome: string }>>`
      SELECT id, nome FROM cadastro_operadoras WHERE id = ${idOperadora} AND ativo = 1 LIMIT 1
    `
    if (!operadora.length) return reply.status(400).send({ error: 'Operadora inválida ou inativa.' })

    const tipoNorm = String(tipo).toUpperCase()
    const statusNorm = String(statusIntegracao ?? 'NAO_INTEGRADO').toUpperCase()
    const obs = String(observacao ?? '').trim() || null

    // Evita duplicar a mesma combinação operadora+tipo para o mesmo cliente — nesse caso
    // o correto é ajustar a quantidade do registro existente, não criar outro.
    const jaExiste = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM cliente_maquininhas
      WHERE cliente_id = ${idCliente} AND operadora_id = ${idOperadora} AND tipo = ${tipoNorm}
      LIMIT 1
    `
    if (jaExiste.length) {
      return reply.status(409).send({
        error: `Este cliente já tem um registro de ${operadora[0].nome} (${tipoNorm}). Edite a quantidade do registro existente em vez de criar outro.`,
      })
    }

    await prisma.$executeRaw`
      INSERT INTO cliente_maquininhas
        (cliente_id, operadora_id, tipo, quantidade, status_integracao, observacao, criado_em, criado_por, atualizado_em, atualizado_por)
      VALUES
        (${idCliente}, ${idOperadora}, ${tipoNorm}, ${qtd}, ${statusNorm}, ${obs}, NOW(), ${usuarioId}, NOW(), ${usuarioId})
    `
    const novo = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM cliente_maquininhas WHERE cliente_id = ${idCliente} ORDER BY id DESC LIMIT 1
    `
    const novoId = Number(novo[0]?.id || 0)

    await registrarAuditoria({
      tabela: 'cliente_maquininhas',
      registroId: novoId,
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: {
        clienteId: idCliente,
        operadora: operadora[0].nome,
        tipo: tipoNorm,
        quantidade: qtd,
        statusIntegracao: statusNorm,
        observacao: obs,
      },
    })

    return { ok: true, id: novoId }
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Atualiza maquininha do cliente' } }, async (request, reply) => {
    await ensureMaquininhas()
    const { id } = request.params as { id: string }
    const registroId = Number(id)
    const { operadoraId, tipo, quantidade, statusIntegracao, observacao } = request.body as Record<string, unknown>
    const usuarioId = Number((request.user as any)?.id || 0) || null

    if (!Number.isFinite(registroId) || registroId <= 0) return reply.status(400).send({ error: 'Registro inválido.' })

    const atual = await prisma.$queryRaw<MaquininhaRow[]>`
      SELECT M.id, M.cliente_id AS clienteId, M.operadora_id AS operadoraId, O.nome AS operadoraNome,
             M.tipo, M.quantidade, M.status_integracao AS statusIntegracao, M.observacao
      FROM cliente_maquininhas M
      LEFT JOIN cadastro_operadoras O ON O.id = M.operadora_id
      WHERE M.id = ${registroId} LIMIT 1
    `
    if (!atual.length) return reply.status(404).send({ error: 'Registro não encontrado.' })

    const idOperadora = operadoraId === undefined ? Number(atual[0].operadoraId) : Number(operadoraId)
    const tipoNorm = tipo === undefined ? atual[0].tipo : String(tipo).toUpperCase()
    const qtd = quantidade === undefined ? Number(atual[0].quantidade) : Number(quantidade)
    const statusNorm = statusIntegracao === undefined ? atual[0].statusIntegracao : String(statusIntegracao).toUpperCase()
    const obs = observacao === undefined ? atual[0].observacao : (String(observacao ?? '').trim() || null)

    if (!tipoValido(tipoNorm)) return reply.status(400).send({ error: 'Tipo inválido (use TEF ou SMARTPOS).' })
    if (!statusValido(statusNorm)) return reply.status(400).send({ error: 'Status inválido.' })
    if (!Number.isFinite(qtd) || qtd < 1) return reply.status(400).send({ error: 'Quantidade deve ser pelo menos 1.' })

    const operadora = await prisma.$queryRaw<Array<{ id: number; nome: string }>>`
      SELECT id, nome FROM cadastro_operadoras WHERE id = ${idOperadora} AND ativo = 1 LIMIT 1
    `
    if (!operadora.length) return reply.status(400).send({ error: 'Operadora inválida ou inativa.' })

    await prisma.$executeRaw`
      UPDATE cliente_maquininhas
      SET operadora_id = ${idOperadora}, tipo = ${tipoNorm}, quantidade = ${qtd},
          status_integracao = ${statusNorm}, observacao = ${obs},
          atualizado_em = NOW(), atualizado_por = ${usuarioId}
      WHERE id = ${registroId}
    `

    await registrarAuditoria({
      tabela: 'cliente_maquininhas',
      registroId,
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: {
        operadora: atual[0].operadoraNome,
        tipo: atual[0].tipo,
        quantidade: Number(atual[0].quantidade),
        statusIntegracao: atual[0].statusIntegracao,
        observacao: atual[0].observacao,
      },
      dadosDepois: {
        operadora: operadora[0].nome,
        tipo: tipoNorm,
        quantidade: qtd,
        statusIntegracao: statusNorm,
        observacao: obs,
      },
    })

    return { ok: true }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Remove maquininha do cliente' } }, async (request, reply) => {
    await ensureMaquininhas()
    const { id } = request.params as { id: string }
    const registroId = Number(id)
    const usuarioId = Number((request.user as any)?.id || 0) || null
    if (!Number.isFinite(registroId) || registroId <= 0) return reply.status(400).send({ error: 'Registro inválido.' })

    const atual = await prisma.$queryRaw<MaquininhaRow[]>`
      SELECT M.id, M.cliente_id AS clienteId, M.operadora_id AS operadoraId, O.nome AS operadoraNome,
             M.tipo, M.quantidade, M.status_integracao AS statusIntegracao, M.observacao
      FROM cliente_maquininhas M
      LEFT JOIN cadastro_operadoras O ON O.id = M.operadora_id
      WHERE M.id = ${registroId} LIMIT 1
    `
    if (!atual.length) return reply.status(404).send({ error: 'Registro não encontrado.' })

    await prisma.$executeRaw`DELETE FROM cliente_maquininhas WHERE id = ${registroId}`

    await registrarAuditoria({
      tabela: 'cliente_maquininhas',
      registroId,
      acao: 'EXCLUSAO',
      usuarioId,
      dadosAntes: {
        clienteId: Number(atual[0].clienteId),
        operadora: atual[0].operadoraNome,
        tipo: atual[0].tipo,
        quantidade: Number(atual[0].quantidade),
        statusIntegracao: atual[0].statusIntegracao,
      },
    })

    return { ok: true }
  })

  // ── Relatório ──────────────────────────────────────────────
  app.get('/relatorio', { preHandler: authMiddleware, schema: { tags: ['Maquininhas'], summary: 'Relatório de maquininhas por operadora/tipo/status' } }, async (request) => {
    await ensureMaquininhas()
    const { operadoraId, tipo, statusIntegracao } = request.query as Record<string, string>

    const cond: Prisma.Sql[] = [Prisma.sql`C.ATIVO = 'S'`]
    if (operadoraId && Number(operadoraId) > 0) cond.push(Prisma.sql`M.operadora_id = ${Number(operadoraId)}`)
    if (tipo && tipoValido(tipo)) cond.push(Prisma.sql`M.tipo = ${String(tipo).toUpperCase()}`)
    if (statusIntegracao && statusValido(statusIntegracao)) cond.push(Prisma.sql`M.status_integracao = ${String(statusIntegracao).toUpperCase()}`)
    const where = Prisma.sql`WHERE ${Prisma.join(cond, ' AND ')}`

    const [detalhado, porOperadora, porTipo, porStatus] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT M.id, M.cliente_id AS clienteId,
               COALESCE(C.NOME_FANTASIA, C.NOME_CLI) AS clienteNome, C.CNPJ_CLI AS cnpj,
               O.nome AS operadoraNome, M.tipo, M.quantidade,
               M.status_integracao AS statusIntegracao, M.observacao
        FROM cliente_maquininhas M
        INNER JOIN cliente C ON C.cod_cli = M.cliente_id
        LEFT JOIN cadastro_operadoras O ON O.id = M.operadora_id
        ${where}
        ORDER BY clienteNome ASC, O.nome ASC
      `,
      prisma.$queryRaw<any[]>`
        SELECT O.nome AS operadora, COUNT(*) AS registros, SUM(M.quantidade) AS maquininhas,
               SUM(CASE WHEN M.status_integracao = 'INTEGRADO' THEN M.quantidade ELSE 0 END) AS integradas
        FROM cliente_maquininhas M
        INNER JOIN cliente C ON C.cod_cli = M.cliente_id
        LEFT JOIN cadastro_operadoras O ON O.id = M.operadora_id
        ${where}
        GROUP BY O.nome ORDER BY maquininhas DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT M.tipo, COUNT(*) AS registros, SUM(M.quantidade) AS maquininhas
        FROM cliente_maquininhas M
        INNER JOIN cliente C ON C.cod_cli = M.cliente_id
        ${where}
        GROUP BY M.tipo ORDER BY maquininhas DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT M.status_integracao AS status, COUNT(*) AS registros, SUM(M.quantidade) AS maquininhas
        FROM cliente_maquininhas M
        INNER JOIN cliente C ON C.cod_cli = M.cliente_id
        ${where}
        GROUP BY M.status_integracao
      `,
    ])

    const num = (v: any) => (v === null || v === undefined ? 0 : Number(v))

    return {
      totais: {
        clientes: new Set(detalhado.map((d) => Number(d.clienteId))).size,
        registros: detalhado.length,
        maquininhas: detalhado.reduce((acc, d) => acc + num(d.quantidade), 0),
        integradas: detalhado
          .filter((d) => d.statusIntegracao === 'INTEGRADO')
          .reduce((acc, d) => acc + num(d.quantidade), 0),
      },
      porOperadora: porOperadora.map((r) => ({
        operadora: r.operadora || 'Sem operadora',
        registros: num(r.registros),
        maquininhas: num(r.maquininhas),
        integradas: num(r.integradas),
      })),
      porTipo: porTipo.map((r) => ({ tipo: r.tipo, registros: num(r.registros), maquininhas: num(r.maquininhas) })),
      porStatus: porStatus.map((r) => ({ status: r.status, registros: num(r.registros), maquininhas: num(r.maquininhas) })),
      detalhado: detalhado.map((r) => ({
        id: Number(r.id),
        clienteId: Number(r.clienteId),
        clienteNome: r.clienteNome,
        cnpj: r.cnpj,
        operadoraNome: r.operadoraNome || 'Sem operadora',
        tipo: r.tipo,
        quantidade: num(r.quantidade),
        statusIntegracao: r.statusIntegracao,
        observacao: r.observacao,
      })),
    }
  })
}
