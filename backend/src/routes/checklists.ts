import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initChecklists } from '../utils/checklists'

type ChecklistRow = {
  id: number
  nome: string
  descricao: string | null
  itens: string | null
  etapas: string | null
  telas: string | null
  ativo: number | boolean
  ordem: number
  criado_em?: Date
  atualizado_em?: Date
}

let checklistsInitPromise: Promise<void> | null = null

function getErrorMessage(err: unknown): string {
  const e = err as any
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(' | ')
}

function isMissingChecklistsTableError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('cadastro_checklists') && (msg.includes("doesn't exist") || msg.includes('does not exist') || msg.includes('1146'))
}

async function ensureChecklistsTable(): Promise<void> {
  if (!checklistsInitPromise) {
    checklistsInitPromise = initChecklists().catch((err) => {
      checklistsInitPromise = null
      throw err
    })
  }
  await checklistsInitPromise
}

async function withChecklistsTable<T>(fn: () => Promise<T>): Promise<T> {
  await ensureChecklistsTable()
  try {
    return await fn()
  } catch (err) {
    if (!isMissingChecklistsTableError(err)) throw err
    checklistsInitPromise = null
    await ensureChecklistsTable()
    return fn()
  }
}

function parseJsonList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function checklistsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Listar checklists cadastrados' } }, async (request) => {
    const { tela, ativo } = request.query as { tela?: string; ativo?: string }
    const rows = await withChecklistsTable(async () => prisma.$queryRaw<ChecklistRow[]>`
      SELECT id, nome, descricao, itens, etapas, telas, ativo, ordem, criado_em, atualizado_em
      FROM cadastro_checklists
      ORDER BY ordem ASC, nome ASC
    `)

    return rows
      .map((r) => ({
        id: Number(r.id),
        nome: r.nome,
        descricao: r.descricao ?? '',
        itens: parseJsonList(r.itens),
        etapas: parseJsonList(r.etapas),
        telas: parseJsonList(r.telas),
        ativo: Number(r.ativo) === 1,
        ordem: Number(r.ordem),
        criadoEm: r.criado_em ?? null,
        atualizadoEm: r.atualizado_em ?? null,
      }))
      .filter((r) => (ativo ? String(r.ativo ? 1 : 0) === String(ativo) : true))
      .filter((r) => (tela ? r.telas.includes(tela) : true))
  })

  app.get('/telas', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Lista de telas elegíveis para checklists' } }, async () => {
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

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Criar checklist' } }, async (request, reply) => {
    const { nome, descricao, itens, etapas, telas, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      itens?: string[]
      etapas?: string[]
      telas?: string[]
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do checklist é obrigatório.' })

    const itensNorm = (itens ?? []).map((i) => String(i).trim()).filter(Boolean)
    if (!itensNorm.length) return reply.status(400).send({ error: 'Inclua ao menos um item no checklist.' })

    const telasNorm = (telas ?? []).map((t) => String(t).trim()).filter(Boolean)
    if (!telasNorm.length) return reply.status(400).send({ error: 'Selecione ao menos uma tela para o checklist.' })
    const etapasNorm = (etapas ?? []).map((t) => String(t).trim()).filter(Boolean)

    await withChecklistsTable(async () => prisma.$executeRaw`
      INSERT INTO cadastro_checklists (nome, descricao, itens, etapas, telas, ordem, ativo, criado_em, atualizado_em)
      VALUES (
        ${nomeTrim},
        ${String(descricao ?? '').trim() || null},
        ${JSON.stringify(itensNorm)},
        ${JSON.stringify(etapasNorm)},
        ${JSON.stringify(telasNorm)},
        ${Number(ordem ?? 0)},
        ${ativo === false ? 0 : 1},
        NOW(),
        NOW()
      )
    `)

    const inserted = await withChecklistsTable(async () => prisma.$queryRaw<{ id: number }[]>`SELECT id FROM cadastro_checklists ORDER BY id DESC LIMIT 1`)
    return reply.status(201).send({ id: Number(inserted[0]?.id ?? 0) })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Atualizar checklist' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const checklistId = Number(id)
    if (!Number.isFinite(checklistId) || checklistId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, descricao, itens, etapas, telas, ordem, ativo } = request.body as {
      nome: string
      descricao?: string
      itens?: string[]
      etapas?: string[]
      telas?: string[]
      ordem?: number
      ativo?: boolean
    }

    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do checklist é obrigatório.' })

    const itensNorm = (itens ?? []).map((i) => String(i).trim()).filter(Boolean)
    if (!itensNorm.length) return reply.status(400).send({ error: 'Inclua ao menos um item no checklist.' })

    const telasNorm = (telas ?? []).map((t) => String(t).trim()).filter(Boolean)
    if (!telasNorm.length) return reply.status(400).send({ error: 'Selecione ao menos uma tela para o checklist.' })
    const etapasNorm = (etapas ?? []).map((t) => String(t).trim()).filter(Boolean)

    await withChecklistsTable(async () => prisma.$executeRaw`
      UPDATE cadastro_checklists
      SET nome = ${nomeTrim},
          descricao = ${String(descricao ?? '').trim() || null},
          itens = ${JSON.stringify(itensNorm)},
          etapas = ${JSON.stringify(etapasNorm)},
          telas = ${JSON.stringify(telasNorm)},
          ordem = ${Number(ordem ?? 0)},
          ativo = ${ativo === false ? 0 : 1},
          atualizado_em = NOW()
      WHERE id = ${checklistId}
    `)

    return { ok: true }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Ativar/inativar checklist' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const checklistId = Number(id)
    if (!Number.isFinite(checklistId) || checklistId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const rows = await withChecklistsTable(async () => prisma.$queryRaw<{ ativo: number }[]>`SELECT ativo FROM cadastro_checklists WHERE id = ${checklistId} LIMIT 1`)
    if (!rows.length) return reply.status(404).send({ error: 'Checklist não encontrado.' })

    const novoAtivo = Number(rows[0].ativo) === 1 ? 0 : 1
    await withChecklistsTable(async () => prisma.$executeRaw`UPDATE cadastro_checklists SET ativo = ${novoAtivo}, atualizado_em = NOW() WHERE id = ${checklistId}`)

    return { ok: true, ativo: novoAtivo === 1 }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Checklists'], summary: 'Excluir checklist' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const checklistId = Number(id)
    if (!Number.isFinite(checklistId) || checklistId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    await withChecklistsTable(async () => prisma.$executeRaw`DELETE FROM cadastro_checklists WHERE id = ${checklistId}`)
    return reply.status(204).send()
  })
}
