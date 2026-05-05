import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
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

type ProcedimentoTecnicoRow = {
  procedimentoId: number
  tecnicoId: number
  tecnicoNome: string | null
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

async function getTecnicosVinculadosMap(procedimentoIds: number[]) {
  if (!procedimentoIds.length) return new Map<number, Array<{ id: number; nome: string }>>()

  const rows = await withProcedimentosTable(async () => prisma.$queryRaw<ProcedimentoTecnicoRow[]>`
    SELECT
      pt.procedimento_id AS procedimentoId,
      pt.cod_tecnico AS tecnicoId,
      COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnicoNome
    FROM cadastro_procedimentos_tecnicos pt
    LEFT JOIN usuario u ON u.COD_USU = pt.cod_tecnico
    WHERE pt.procedimento_id IN (${Prisma.join(procedimentoIds)})
    ORDER BY tecnicoNome ASC, pt.cod_tecnico ASC
  `)

  const map = new Map<number, Array<{ id: number; nome: string }>>()
  for (const row of rows) {
    const procedimentoId = Number(row.procedimentoId)
    const tecnicoId = Number(row.tecnicoId)
    if (!Number.isFinite(procedimentoId) || !Number.isFinite(tecnicoId) || tecnicoId <= 0) continue
    if (!map.has(procedimentoId)) map.set(procedimentoId, [])
    map.get(procedimentoId)!.push({
      id: tecnicoId,
      nome: row.tecnicoNome?.trim() || `#${tecnicoId}`,
    })
  }

  return map
}

async function normalizeTecnicoIds(tecnicoIdsRaw: unknown) {
  const ids = Array.isArray(tecnicoIdsRaw)
    ? tecnicoIdsRaw.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : []

  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) return []

  const rows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT COD_USU AS id
    FROM usuario
    WHERE COD_USU IN (${Prisma.join(uniqueIds)}) AND COALESCE(ATIVO, 'S') = 'S'
  `)

  return rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)
}

export async function procedimentosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Listar procedimentos cadastrados' } }, async (request) => {
    const { ativo } = request.query as { ativo?: string }

    const rows = await withProcedimentosTable(async () => prisma.$queryRaw<ProcedimentoRow[]>`
      SELECT id, nome, descricao, duracao_min, ativo, ordem, criado_em, atualizado_em
      FROM cadastro_procedimentos
      ORDER BY ordem ASC, nome ASC
    `)

    const procedimentoIds = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0)
    const tecnicosMap = await getTecnicosVinculadosMap(procedimentoIds)

    return rows
      .map((r) => {
        const tecnicos = tecnicosMap.get(Number(r.id)) ?? []
        return {
        id: Number(r.id),
        nome: r.nome,
        descricao: r.descricao ?? '',
        duracaoMin: Number(r.duracao_min ?? 60),
        ativo: Number(r.ativo) === 1,
        ordem: Number(r.ordem ?? 0),
        criadoEm: r.criado_em ?? null,
        atualizadoEm: r.atualizado_em ?? null,
        tecnicoIds: tecnicos.map((tecnico) => tecnico.id),
        tecnicos,
      }})
      .filter((r) => (ativo ? String(r.ativo ? 1 : 0) === String(ativo) : true))
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Criar procedimento' } }, async (request, reply) => {
    const { nome, descricao, duracaoMin, ordem, ativo, tecnicoIds } = request.body as {
      nome: string
      descricao?: string
      duracaoMin?: number
      ordem?: number
      ativo?: boolean
      tecnicoIds?: number[]
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do procedimento é obrigatório.' })

    const duracaoNum = Number(duracaoMin ?? 60)
    if (!Number.isFinite(duracaoNum) || duracaoNum < 15) {
      return reply.status(400).send({ error: 'Duração mínima deve ser de 15 minutos.' })
    }

    const normalizedTecnicoIds = await normalizeTecnicoIds(tecnicoIds)

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
    const insertedId = Number(inserted[0]?.id ?? 0)

    if (insertedId > 0 && normalizedTecnicoIds.length) {
      await withProcedimentosTable(async () => prisma.$executeRaw(Prisma.sql`
        INSERT INTO cadastro_procedimentos_tecnicos (procedimento_id, cod_tecnico)
        VALUES ${Prisma.join(normalizedTecnicoIds.map((tecnicoId) => Prisma.sql`(${insertedId}, ${tecnicoId})`), ', ')}
      `))
    }
    return reply.status(201).send({ id: insertedId })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Procedimentos'], summary: 'Atualizar procedimento' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const procedimentoId = Number(id)
    if (!Number.isFinite(procedimentoId) || procedimentoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, descricao, duracaoMin, ordem, ativo, tecnicoIds } = request.body as {
      nome: string
      descricao?: string
      duracaoMin?: number
      ordem?: number
      ativo?: boolean
      tecnicoIds?: number[]
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do procedimento é obrigatório.' })

    const duracaoNum = Number(duracaoMin ?? 60)
    if (!Number.isFinite(duracaoNum) || duracaoNum < 15) {
      return reply.status(400).send({ error: 'Duração mínima deve ser de 15 minutos.' })
    }

    const normalizedTecnicoIds = await normalizeTecnicoIds(tecnicoIds)

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

    await withProcedimentosTable(async () => prisma.$executeRaw`DELETE FROM cadastro_procedimentos_tecnicos WHERE procedimento_id = ${procedimentoId}`)
    if (normalizedTecnicoIds.length) {
      await withProcedimentosTable(async () => prisma.$executeRaw(Prisma.sql`
        INSERT INTO cadastro_procedimentos_tecnicos (procedimento_id, cod_tecnico)
        VALUES ${Prisma.join(normalizedTecnicoIds.map((tecnicoId) => Prisma.sql`(${procedimentoId}, ${tecnicoId})`), ', ')}
      `))
    }

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

    await withProcedimentosTable(async () => prisma.$executeRaw`DELETE FROM cadastro_procedimentos_tecnicos WHERE procedimento_id = ${procedimentoId}`)
    await withProcedimentosTable(async () => prisma.$executeRaw`DELETE FROM cadastro_procedimentos WHERE id = ${procedimentoId}`)
    return reply.status(204).send()
  })
}
