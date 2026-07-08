import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initEtapas } from '../utils/etapas'

type EtapaRow = {
  id: number
  nome: string
  cor: string
  telas: string | null
  ativo: number | boolean
  ordem: number
  sla_dias: number | null
  criado_em?: Date
  atualizado_em?: Date
}

let etapasInitPromise: Promise<void> | null = null
let slaColumnEnsured = false

async function ensureSlaColumn(): Promise<void> {
  if (slaColumnEnsured) return
  const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cadastro_etapas'
      AND COLUMN_NAME = 'sla_dias'
  `
  if (rows.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE cadastro_etapas ADD COLUMN sla_dias INT NULL AFTER cor`)
  }
  slaColumnEnsured = true
}

function getErrorMessage(err: unknown): string {
  const e = err as any
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(' | ')
}

function isMissingEtapasTableError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('cadastro_etapas') && (msg.includes("doesn't exist") || msg.includes('does not exist') || msg.includes('1146'))
}

async function ensureEtapasTable(): Promise<void> {
  if (!etapasInitPromise) {
    etapasInitPromise = initEtapas().then(ensureSlaColumn).catch((err) => {
      etapasInitPromise = null
      throw err
    })
  }
  await etapasInitPromise
}

async function withEtapasTable<T>(fn: () => Promise<T>): Promise<T> {
  await ensureEtapasTable()
  try {
    return await fn()
  } catch (err) {
    if (!isMissingEtapasTableError(err)) throw err
    etapasInitPromise = null
    await ensureEtapasTable()
    return fn()
  }
}

function parseTelas(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function normalizeColor(cor?: string): string {
  const val = String(cor ?? '').trim()
  if (/^#([0-9a-fA-F]{6})$/.test(val)) return val
  return '#3b82f6'
}

export async function etapasRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Listar etapas cadastradas' } }, async (request) => {
    const { tela, ativo } = request.query as { tela?: string; ativo?: string }
    const rows = await withEtapasTable(async () => prisma.$queryRaw<EtapaRow[]>`
        SELECT id, nome, cor, telas, ativo, ordem, sla_dias, criado_em, atualizado_em
        FROM cadastro_etapas
        ORDER BY ordem ASC, nome ASC
      `)

    return rows
      .map((r) => ({
        id: Number(r.id),
        nome: r.nome,
        cor: normalizeColor(r.cor),
        telas: parseTelas(r.telas),
        ativo: Number(r.ativo) === 1,
        ordem: Number(r.ordem),
        slaDias: r.sla_dias === null || r.sla_dias === undefined ? null : Number(r.sla_dias),
        criadoEm: r.criado_em ?? null,
        atualizadoEm: r.atualizado_em ?? null,
      }))
      .filter((r) => (ativo ? String(r.ativo ? 1 : 0) === String(ativo) : true))
      .filter((r) => (tela ? r.telas.includes(tela) : true))
  })

  app.get('/telas', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Lista de telas elegíveis para etapas' } }, async () => {
    return [
      { id: 'atendimentos', label: 'Atendimentos' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'agenda-agendamentos', label: 'Agenda Programada' },
      { id: 'clientes', label: 'Clientes' },
      { id: 'crm', label: 'CRM / Negócios' },
      { id: 'implantacao', label: 'Implantação' },
      { id: 'desenvolvimento', label: 'Tarefas Dev' },
      { id: 'financeiro', label: 'Financeiro' },
      { id: 'comissoes', label: 'Comissões' },
      { id: 'boletim-comercial', label: 'Boletim Comercial' },
      { id: 'videos', label: 'Vídeos' },
      { id: 'campanhas', label: 'Campanhas' },
      { id: 'banco-horas', label: 'Banco de Horas' },
    ]
  })

  app.patch('/reorder', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Reordenar etapas (arrastar e soltar)' } }, async (request, reply) => {
    const { ids } = request.body as { ids?: number[] }
    const lista = (ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (!lista.length) return reply.status(400).send({ error: 'Lista de etapas vazia.' })

    await withEtapasTable(async () => {
      for (let i = 0; i < lista.length; i++) {
        await prisma.$executeRaw`UPDATE cadastro_etapas SET ordem = ${i + 1}, atualizado_em = NOW() WHERE id = ${lista[i]}`
      }
    })
    return { ok: true }
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Criar etapa' } }, async (request, reply) => {
    const { nome, cor, telas, ordem, ativo, slaDias } = request.body as {
      nome: string
      cor?: string
      telas?: string[]
      ordem?: number
      ativo?: boolean
      slaDias?: number | null
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome da etapa é obrigatório.' })

    const slaNormalizado = slaDias === undefined || slaDias === null ? null : Math.max(0, Number(slaDias) || 0)
    const telasJson = JSON.stringify((telas ?? []).map(String))
    await withEtapasTable(async () => prisma.$executeRaw`
        INSERT INTO cadastro_etapas (nome, cor, telas, ordem, ativo, sla_dias, criado_em, atualizado_em)
        VALUES (${nomeTrim}, ${normalizeColor(cor)}, ${telasJson}, ${Number(ordem ?? 0)}, ${ativo === false ? 0 : 1}, ${slaNormalizado}, NOW(), NOW())
      `)

    const inserted = await withEtapasTable(async () => prisma.$queryRaw<{ id: number }[]>`SELECT id FROM cadastro_etapas ORDER BY id DESC LIMIT 1`)
    return reply.status(201).send({ id: Number(inserted[0]?.id ?? 0) })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Atualizar etapa' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const etapaId = Number(id)
    if (!Number.isFinite(etapaId) || etapaId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, cor, telas, ordem, ativo, slaDias } = request.body as {
      nome: string
      cor?: string
      telas?: string[]
      ordem?: number
      ativo?: boolean
      slaDias?: number | null
    }
    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome da etapa é obrigatório.' })

    const slaNormalizado = slaDias === undefined || slaDias === null ? null : Math.max(0, Number(slaDias) || 0)
    const telasJson = JSON.stringify((telas ?? []).map(String))
    await withEtapasTable(async () => prisma.$executeRaw`
        UPDATE cadastro_etapas
        SET nome = ${nomeTrim},
            cor = ${normalizeColor(cor)},
            telas = ${telasJson},
            ordem = ${Number(ordem ?? 0)},
            ativo = ${ativo === false ? 0 : 1},
            sla_dias = ${slaNormalizado},
            atualizado_em = NOW()
        WHERE id = ${etapaId}
      `)

    return { ok: true }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Ativar/inativar etapa' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const etapaId = Number(id)
    if (!Number.isFinite(etapaId) || etapaId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const rows = await withEtapasTable(async () => prisma.$queryRaw<{ ativo: number }[]>`SELECT ativo FROM cadastro_etapas WHERE id = ${etapaId} LIMIT 1`)
    if (!rows.length) return reply.status(404).send({ error: 'Etapa não encontrada.' })

    const novoAtivo = Number(rows[0].ativo) === 1 ? 0 : 1
    await withEtapasTable(async () => prisma.$executeRaw`UPDATE cadastro_etapas SET ativo = ${novoAtivo}, atualizado_em = NOW() WHERE id = ${etapaId}`)

    return { ok: true, ativo: novoAtivo === 1 }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Etapas'], summary: 'Excluir etapa' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const etapaId = Number(id)
    if (!Number.isFinite(etapaId) || etapaId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    await withEtapasTable(async () => prisma.$executeRaw`DELETE FROM cadastro_etapas WHERE id = ${etapaId}`)
    return reply.status(204).send()
  })
}
