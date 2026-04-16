import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initProcedimentos } from '../utils/procedimentos'

type ProcedimentoRow = {
  id: number
  nome: string
  descricao: string | null
  duracao_min: number
  ativo: number | boolean
  ordem: number
  criado_em?: Date
  atualizado_em?: Date
}

let procedimentosInitPromise: Promise<void> | null = null

function getErrorMessage(err: unknown): string {
  const e = err as any
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(' | ')
}

function isMissingProcedimentosTableError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('cadastro_procedimentos') && (msg.includes("doesn't exist") || msg.includes('does not exist') || msg.includes('1146'))
}

async function ensureProcedimentosTable(): Promise<void> {
  if (!procedimentosInitPromise) {
    procedimentosInitPromise = initProcedimentos().catch((err) => {
      procedimentosInitPromise = null
      throw err
    })
  }
  await procedimentosInitPromise
}

async function withProcedimentosTable<T>(fn: () => Promise<T>): Promise<T> {
  await ensureProcedimentosTable()
  try {
    return await fn()
  } catch (err) {
    if (!isMissingProcedimentosTableError(err)) throw err
    procedimentosInitPromise = null
    await ensureProcedimentosTable()
    return fn()
  }
}

export async function procedimentosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Listar procedimentos cadastrados' } }, async (request) => {
    const { ativo } = request.query as { ativo?: string }

    const rows = await withProcedimentosTable(async () => prisma.$queryRaw<ProcedimentoRow[]>`
      SELECT id, nome, descricao, duracao_min, ativo, ordem, criado_em, atualizado_em
      FROM cadastro_procedimentos
      ORDER BY ordem ASC, nome ASC
    `)

    return rows
      .map((r) => ({
        id: Number(r.id),
        nome: r.nome,
        descricao: r.descricao ?? '',
        duracaoMin: Number(r.duracao_min ?? 60),
        ativo: Number(r.ativo) === 1,
        ordem: Number(r.ordem ?? 0),
        criadoEm: r.criado_em ?? null,
        atualizadoEm: r.atualizado_em ?? null,
      }))
      .filter((r) => (ativo ? String(r.ativo ? 1 : 0) === String(ativo) : true))
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Criar procedimento' } }, async (request, reply) => {
    const { nome, descricao, duracaoMin, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      duracaoMin?: number
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do procedimento é obrigatório.' })

    const duracaoNum = Number(duracaoMin ?? 60)
    if (!Number.isFinite(duracaoNum) || duracaoNum < 15) {
      return reply.status(400).send({ error: 'Duração mínima deve ser de 15 minutos.' })
    }

    await withProcedimentosTable(async () => prisma.$executeRaw`
      INSERT INTO cadastro_procedimentos (nome, descricao, duracao_min, ordem, ativo, criado_em, atualizado_em)
      VALUES (
        ${nomeTrim},
        ${String(descricao ?? '').trim() || null},
        ${Math.round(duracaoNum)},
        ${Number(ordem ?? 0)},
        ${ativo === false ? 0 : 1},
        NOW(),
        NOW()
      )
    `)

    const inserted = await withProcedimentosTable(async () => prisma.$queryRaw<{ id: number }[]>`SELECT id FROM cadastro_procedimentos ORDER BY id DESC LIMIT 1`)
    return reply.status(201).send({ id: Number(inserted[0]?.id ?? 0) })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Atualizar procedimento' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const procedimentoId = Number(id)
    if (!Number.isFinite(procedimentoId) || procedimentoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, descricao, duracaoMin, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      duracaoMin?: number
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do procedimento é obrigatório.' })

    const duracaoNum = Number(duracaoMin ?? 60)
    if (!Number.isFinite(duracaoNum) || duracaoNum < 15) {
      return reply.status(400).send({ error: 'Duração mínima deve ser de 15 minutos.' })
    }

    await withProcedimentosTable(async () => prisma.$executeRaw`
      UPDATE cadastro_procedimentos
      SET nome = ${nomeTrim},
          descricao = ${String(descricao ?? '').trim() || null},
          duracao_min = ${Math.round(duracaoNum)},
          ordem = ${Number(ordem ?? 0)},
          ativo = ${ativo === false ? 0 : 1},
          atualizado_em = NOW()
      WHERE id = ${procedimentoId}
    `)

    return { ok: true }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Ativar/inativar procedimento' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const procedimentoId = Number(id)
    if (!Number.isFinite(procedimentoId) || procedimentoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const rows = await withProcedimentosTable(async () => prisma.$queryRaw<{ ativo: number }[]>`SELECT ativo FROM cadastro_procedimentos WHERE id = ${procedimentoId} LIMIT 1`)
    if (!rows.length) return reply.status(404).send({ error: 'Procedimento não encontrado.' })

    const novoAtivo = Number(rows[0].ativo) === 1 ? 0 : 1
    await withProcedimentosTable(async () => prisma.$executeRaw`UPDATE cadastro_procedimentos SET ativo = ${novoAtivo}, atualizado_em = NOW() WHERE id = ${procedimentoId}`)

    return { ok: true, ativo: novoAtivo === 1 }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Excluir procedimento' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const procedimentoId = Number(id)
    if (!Number.isFinite(procedimentoId) || procedimentoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    await withProcedimentosTable(async () => prisma.$executeRaw`DELETE FROM cadastro_procedimentos WHERE id = ${procedimentoId}`)
    return reply.status(204).send()
  })
}
