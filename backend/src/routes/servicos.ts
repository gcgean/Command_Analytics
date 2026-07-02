import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initServicos } from '../utils/servicos'

type ServicoRow = {
  id: number
  nome: string
  descricao: string | null
  checklist_ids: string | null
  ativo: number | boolean
  ordem: number
  criado_em?: Date
  atualizado_em?: Date
}

let servicosInitPromise: Promise<void> | null = null

function getErrorMessage(err: unknown): string {
  const e = err as any
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(' | ')
}

function isMissingServicosTableError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('cadastro_servicos') && (msg.includes("doesn't exist") || msg.includes('does not exist') || msg.includes('1146'))
}

async function ensureServicosTable(): Promise<void> {
  if (!servicosInitPromise) {
    servicosInitPromise = initServicos().catch((err) => {
      servicosInitPromise = null
      throw err
    })
  }
  await servicosInitPromise
}

async function withServicosTable<T>(fn: () => Promise<T>): Promise<T> {
  await ensureServicosTable()
  try {
    return await fn()
  } catch (err) {
    if (!isMissingServicosTableError(err)) throw err
    servicosInitPromise = null
    await ensureServicosTable()
    return fn()
  }
}

function parseJsonIntList(raw: string | null): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []
  } catch {
    return []
  }
}

export async function servicosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Serviços'], summary: 'Listar serviços cadastrados' } }, async (request) => {
    const { ativo } = request.query as { ativo?: string }
    const rows = await withServicosTable(async () => prisma.$queryRaw<ServicoRow[]>`
      SELECT id, nome, descricao, checklist_ids, ativo, ordem, criado_em, atualizado_em
      FROM cadastro_servicos
      ORDER BY ordem ASC, nome ASC
    `)

    return rows
      .map((r) => ({
        id: Number(r.id),
        nome: r.nome,
        descricao: r.descricao ?? '',
        checklistIds: parseJsonIntList(r.checklist_ids),
        ativo: Number(r.ativo) === 1,
        ordem: Number(r.ordem),
        criadoEm: r.criado_em ?? null,
        atualizadoEm: r.atualizado_em ?? null,
      }))
      .filter((r) => (ativo ? String(r.ativo ? 1 : 0) === String(ativo) : true))
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Serviços'], summary: 'Criar serviço' } }, async (request, reply) => {
    const { nome, descricao, checklistIds, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      checklistIds?: number[]
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do serviço é obrigatório.' })

    const checklistIdsNorm = Array.from(new Set((checklistIds ?? []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)))

    await withServicosTable(async () => prisma.$executeRaw`
      INSERT INTO cadastro_servicos (nome, descricao, checklist_ids, ordem, ativo, criado_em, atualizado_em)
      VALUES (
        ${nomeTrim},
        ${String(descricao ?? '').trim() || null},
        ${JSON.stringify(checklistIdsNorm)},
        ${Number(ordem ?? 0)},
        ${ativo === false ? 0 : 1},
        NOW(),
        NOW()
      )
    `)

    const inserted = await withServicosTable(async () => prisma.$queryRaw<{ id: number }[]>`SELECT id FROM cadastro_servicos ORDER BY id DESC LIMIT 1`)
    return reply.status(201).send({ id: Number(inserted[0]?.id ?? 0) })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Serviços'], summary: 'Atualizar serviço' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const servicoId = Number(id)
    if (!Number.isFinite(servicoId) || servicoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, descricao, checklistIds, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      checklistIds?: number[]
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do serviço é obrigatório.' })

    const checklistIdsNorm = Array.from(new Set((checklistIds ?? []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)))

    await withServicosTable(async () => prisma.$executeRaw`
      UPDATE cadastro_servicos
      SET nome = ${nomeTrim},
          descricao = ${String(descricao ?? '').trim() || null},
          checklist_ids = ${JSON.stringify(checklistIdsNorm)},
          ordem = ${Number(ordem ?? 0)},
          ativo = ${ativo === false ? 0 : 1},
          atualizado_em = NOW()
      WHERE id = ${servicoId}
    `)

    return { ok: true }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Serviços'], summary: 'Ativar/inativar serviço' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const servicoId = Number(id)
    if (!Number.isFinite(servicoId) || servicoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const rows = await withServicosTable(async () => prisma.$queryRaw<{ ativo: number }[]>`SELECT ativo FROM cadastro_servicos WHERE id = ${servicoId} LIMIT 1`)
    if (!rows.length) return reply.status(404).send({ error: 'Serviço não encontrado.' })

    const novoAtivo = Number(rows[0].ativo) === 1 ? 0 : 1
    await withServicosTable(async () => prisma.$executeRaw`UPDATE cadastro_servicos SET ativo = ${novoAtivo}, atualizado_em = NOW() WHERE id = ${servicoId}`)

    return { ok: true, ativo: novoAtivo === 1 }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Serviços'], summary: 'Excluir serviço' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const servicoId = Number(id)
    if (!Number.isFinite(servicoId) || servicoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    await withServicosTable(async () => prisma.$executeRaw`DELETE FROM cadastro_servicos WHERE id = ${servicoId}`)
    return reply.status(204).send()
  })
}

export { ensureServicosTable, withServicosTable, parseJsonIntList }
export type { ServicoRow }
