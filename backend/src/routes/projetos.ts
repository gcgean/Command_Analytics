import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { initProjetos } from '../utils/projetos'

type TipoProjeto = 'WEB' | 'DESKTOP' | 'MOBILE'
const TIPOS_PROJETO: TipoProjeto[] = ['WEB', 'DESKTOP', 'MOBILE']

function normalizarTipo(valor: unknown): TipoProjeto {
  const v = String(valor ?? '').toUpperCase()
  return (TIPOS_PROJETO as string[]).includes(v) ? (v as TipoProjeto) : 'WEB'
}

type ProjetoRow = {
  id: number
  nome: string
  cor: string | null
  tipo: string
  ativo: number | boolean
  criado_em?: Date
  atualizado_em?: Date
}

let initPromise: Promise<void> | null = null

function getErrorMessage(err: unknown): string {
  const e = err as any
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(' | ')
}

function isMissingTableError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('cadastro_projetos') && (msg.includes("doesn't exist") || msg.includes('does not exist') || msg.includes('1146'))
}

async function ensureTabela(): Promise<void> {
  if (!initPromise) {
    initPromise = initProjetos().catch((err) => {
      initPromise = null
      throw err
    })
  }
  await initPromise
}

async function withTabela<T>(fn: () => Promise<T>): Promise<T> {
  await ensureTabela()
  try {
    return await fn()
  } catch (err) {
    if (!isMissingTableError(err)) throw err
    initPromise = null
    await ensureTabela()
    return fn()
  }
}

function fmt(r: ProjetoRow) {
  return {
    id: Number(r.id),
    nome: r.nome,
    cor: r.cor,
    tipo: normalizarTipo(r.tipo),
    ativo: Number(r.ativo) === 1,
    criadoEm: r.criado_em ?? null,
    atualizadoEm: r.atualizado_em ?? null,
  }
}

export async function projetosRoutes(app: FastifyInstance) {
  // GET /projetos — lista (por padrão só ativos; ?ativo=false ou omitir o filtro pra ver todos)
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Projetos'], summary: 'Listar projetos cadastrados' } }, async (request) => {
    const { ativo } = request.query as { ativo?: string }
    const rows = await withTabela(async () => prisma.$queryRaw<ProjetoRow[]>`
      SELECT id, nome, cor, tipo, ativo, criado_em, atualizado_em
      FROM cadastro_projetos
      ORDER BY nome ASC
    `)
    const projetos = rows.map(fmt)
    if (ativo === undefined) return projetos
    return projetos.filter((p) => p.ativo === (ativo === 'true'))
  })

  // POST /projetos — criar
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Projetos'], summary: 'Criar projeto' } }, async (request, reply) => {
    const { nome, cor, tipo } = request.body as { nome?: string; cor?: string; tipo?: string }
    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do projeto é obrigatório.' })

    await withTabela(async () => prisma.$executeRaw`
      INSERT INTO cadastro_projetos (nome, cor, tipo, ativo, criado_em, atualizado_em)
      VALUES (${nomeTrim}, ${cor?.trim() || null}, ${normalizarTipo(tipo)}, 1, NOW(), NOW())
    `)
    const inserted = await withTabela(async () => prisma.$queryRaw<{ id: number }[]>`SELECT id FROM cadastro_projetos ORDER BY id DESC LIMIT 1`)
    return reply.status(201).send({ id: Number(inserted[0]?.id ?? 0) })
  })

  // PUT /projetos/:id — atualizar
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Projetos'], summary: 'Atualizar projeto' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const projetoId = Number(id)
    if (!Number.isFinite(projetoId) || projetoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const { nome, cor, tipo, ativo } = request.body as { nome?: string; cor?: string; tipo?: string; ativo?: boolean }
    const nomeTrim = String(nome ?? '').trim()
    if (!nomeTrim) return reply.status(400).send({ error: 'Nome do projeto é obrigatório.' })

    await withTabela(async () => prisma.$executeRaw`
      UPDATE cadastro_projetos
      SET nome = ${nomeTrim}, cor = ${cor?.trim() || null}, tipo = ${normalizarTipo(tipo)}, ativo = ${ativo === false ? 0 : 1}, atualizado_em = NOW()
      WHERE id = ${projetoId}
    `)
    return { ok: true }
  })

  // PATCH /projetos/:id/toggle — ativar/inativar
  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Projetos'], summary: 'Ativar/inativar projeto' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const projetoId = Number(id)
    if (!Number.isFinite(projetoId) || projetoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const rows = await withTabela(async () => prisma.$queryRaw<{ ativo: number }[]>`SELECT ativo FROM cadastro_projetos WHERE id = ${projetoId} LIMIT 1`)
    if (!rows.length) return reply.status(404).send({ error: 'Projeto não encontrado.' })

    const novoAtivo = Number(rows[0].ativo) === 1 ? 0 : 1
    await withTabela(async () => prisma.$executeRaw`UPDATE cadastro_projetos SET ativo = ${novoAtivo}, atualizado_em = NOW() WHERE id = ${projetoId}`)
    return { ok: true, ativo: novoAtivo === 1 }
  })

  // DELETE /projetos/:id — só permite excluir se nenhuma solicitação referencia esse projeto
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Projetos'], summary: 'Excluir projeto' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const projetoId = Number(id)
    if (!Number.isFinite(projetoId) || projetoId <= 0) return reply.status(400).send({ error: 'ID inválido.' })

    const emUso = await prisma.atendimento.count({ where: { projetoId } })
    if (emUso > 0) {
      return reply.status(409).send({ error: `Esse projeto está vinculado a ${emUso} solicitação(ões) — inative em vez de excluir, ou desvincule as solicitações primeiro.` })
    }

    await withTabela(async () => prisma.$executeRaw`DELETE FROM cadastro_projetos WHERE id = ${projetoId}`)
    return reply.status(204).send()
  })
}
