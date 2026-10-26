import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { pipeline } from 'node:stream/promises'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// A tabela `planos` é compartilhada com o Delphi: a gravação é por lista fechada de campos.
// Repassar o body inteiro para o Prisma deixaria qualquer coluna ser escrita pela tela.
const CAMPOS_EDITAVEIS = [
  'descricao', 'ativo', 'valor', 'valorAntigo', 'detalhes', 'sistemaId', 'tipo', 'percComissao',
] as const

const MIME_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const MAX_IMAGEM_BYTES = 4 * 1024 * 1024

const pastaImagens = () => path.resolve(process.cwd(), 'uploads', 'planos')

const dentroDe = (pai: string, filho: string) => {
  const rel = path.relative(pai, filho)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function limpar(body: Record<string, unknown>) {
  const dados: Record<string, unknown> = {}
  for (const campo of CAMPOS_EDITAVEIS) {
    if (!(campo in body)) continue
    const v = body[campo]
    if (campo === 'ativo') dados[campo] = !!v
    else if (campo === 'valor' || campo === 'valorAntigo' || campo === 'percComissao') {
      dados[campo] = v === null || v === '' ? null : Number(v)
    } else if (campo === 'sistemaId' || campo === 'tipo') {
      dados[campo] = v === null || v === '' ? null : Number(v)
    } else {
      dados[campo] = v === null ? null : String(v)
    }
  }
  return dados
}

export async function planosRoutes(app: FastifyInstance) {
  /** Sistemas do cadastro, com quantos planos cada um tem — alimenta o filtro da tela. */
  app.get('/sistemas', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id, s.descricao, s.tipo,
              COALESCE(SUM(CASE WHEN p.ativo = 1 THEN 1 ELSE 0 END), 0) AS planos
         FROM sistema s
         LEFT JOIN planos p ON p.sistema_id = s.id
        GROUP BY s.id, s.descricao, s.tipo
        ORDER BY s.descricao`)
    const [semSistema] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM planos WHERE sistema_id IS NULL AND ativo = 1`)
    return {
      sistemas: linhas.map((s) => ({
        id: Number(s.id),
        nome: s.descricao as string,
        categoria: (s.tipo ?? null) as string | null,
        planos: Number(s.planos ?? 0),
      })),
      semSistema: Number(semSistema?.total ?? 0),
    }
  })

  // GET /planos
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { sistemaId, tipo, todos } = request.query as Record<string, string>
    const planos = await prisma.plano.findMany({
      where: {
        ...(todos !== 'true' && { ativo: true }),
        ...(sistemaId === 'nenhum'
          ? { sistemaId: null }
          : sistemaId ? { sistemaId: Number(sistemaId) } : {}),
        ...(tipo !== undefined && tipo !== '' && { tipo: Number(tipo) }),
      },
      orderBy: { valor: 'asc' },
    })

    // Nome do sistema e existência de imagem resolvidos aqui: a tela não deveria precisar
    // de uma segunda chamada por card.
    const sistemas = await prisma.$queryRawUnsafe<any[]>(`SELECT id, descricao FROM sistema`)
    const nomePorId = new Map(sistemas.map((s) => [Number(s.id), String(s.descricao)]))
    const comImagem = await prisma.$queryRawUnsafe<any[]>(
      `SELECT plano_id FROM plano_imagem`).catch(() => [])
    const temImagem = new Set(comImagem.map((x) => Number(x.plano_id)))

    return planos.map((p) => ({
      ...p,
      sistemaNome: p.sistemaId == null ? null : nomePorId.get(Number(p.sistemaId)) ?? null,
      temImagem: temImagem.has(Number(p.id)),
    }))
  })

  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const plano = await prisma.plano.findUnique({ where: { id: Number(id) } })
    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado.' })
    return plano
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const dados = limpar(request.body as Record<string, unknown>)
    if (!dados.descricao) return reply.status(400).send({ error: 'Informe o nome do plano.' })
    if (dados.valor == null) dados.valor = 0
    const plano = await prisma.plano.create({ data: dados as never })
    return reply.status(201).send(plano)
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const dados = limpar(request.body as Record<string, unknown>)
    if (Object.keys(dados).length === 0) {
      return reply.status(400).send({ error: 'Nada para alterar.' })
    }
    return prisma.plano.update({ where: { id: Number(id) }, data: dados as never })
  })

  // ── Imagem do plano ──
  app.post('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const planoId = Number(id)
    const plano = await prisma.plano.findUnique({ where: { id: planoId } })
    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado.' })

    const dir = pastaImagens()
    await fs.mkdir(dir, { recursive: true })

    let guardado: string | null = null
    let original = 'imagem'
    let mimeType = ''
    let tamanho = 0

    for await (const part of (request as any).parts()) {
      if (part.type !== 'file') continue
      const arquivo = part as MultipartFile
      mimeType = String((arquivo as any).mimetype || '')
      if (!MIME_IMAGEM.has(mimeType)) {
        for await (const _c of arquivo.file as any) void _c
        return reply.status(400).send({ error: 'Use uma imagem JPG, PNG, WEBP ou SVG.' })
      }
      original = String((arquivo as any).filename || 'imagem')
        .replace(/[^a-zA-Z0-9._\-\s]/g, '').trim().slice(0, 180) || 'imagem'
      guardado = `${randomUUID()}${path.extname(original).slice(0, 10)}`
      await pipeline(arquivo.file, createWriteStream(path.join(dir, guardado)))
      tamanho = (await fs.stat(path.join(dir, guardado))).size
      break
    }

    if (!guardado) return reply.status(400).send({ error: 'Nenhuma imagem enviada.' })
    if (tamanho > MAX_IMAGEM_BYTES) {
      await fs.unlink(path.join(dir, guardado)).catch(() => {})
      return reply.status(400).send({ error: 'A imagem passa de 4 MB.' })
    }

    // Troca de imagem apaga a anterior: sem isso, cada troca deixaria um arquivo morto.
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT stored_name FROM plano_imagem WHERE plano_id = ?`, planoId)
    if (atual?.stored_name) {
      const antigo = path.join(dir, String(atual.stored_name))
      if (dentroDe(dir, antigo)) await fs.unlink(antigo).catch(() => {})
    }

    const usuarioId = Number((request.user as { id: number } | undefined)?.id ?? 0) || null
    await prisma.$executeRawUnsafe(
      `INSERT INTO plano_imagem (plano_id, original_name, stored_name, mime_type, size_bytes, atualizado_por)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE original_name = VALUES(original_name),
         stored_name = VALUES(stored_name), mime_type = VALUES(mime_type),
         size_bytes = VALUES(size_bytes), atualizado_por = VALUES(atualizado_por)`,
      planoId, original, guardado, mimeType, tamanho, usuarioId)

    return { ok: true }
  })

  app.get('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [img] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM plano_imagem WHERE plano_id = ?`, Number(id))
    if (!img) return reply.status(404).send({ error: 'Plano sem imagem.' })

    const dir = pastaImagens()
    const caminho = path.join(dir, String(img.stored_name))
    if (!dentroDe(dir, caminho)) return reply.status(400).send({ error: 'Caminho inválido.' })
    if (!(await fs.stat(caminho).catch(() => null))) {
      return reply.status(404).send({ error: 'Arquivo não está mais no servidor.' })
    }
    reply.header('Content-Type', String(img.mime_type))
    reply.header('Cache-Control', 'private, max-age=60')
    return reply.send(createReadStream(caminho))
  })

  app.delete('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const [img] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT stored_name FROM plano_imagem WHERE plano_id = ?`, Number(id))
    if (img?.stored_name) {
      const caminho = path.join(pastaImagens(), String(img.stored_name))
      if (dentroDe(pastaImagens(), caminho)) await fs.unlink(caminho).catch(() => {})
    }
    await prisma.$executeRawUnsafe(`DELETE FROM plano_imagem WHERE plano_id = ?`, Number(id))
    return { ok: true }
  })

  // GET /planos/assinaturas
  app.get('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { clienteId } = request.query as Record<string, string>
    return prisma.assinatura.findMany({
      where: { ...(clienteId && { clienteId: Number(clienteId) }) },
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: { clienteId: 'asc' },
      take: 100,
    })
  })

  app.post('/assinaturas', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const assinatura = await prisma.assinatura.create({ data: body as never })
    return reply.status(201).send(assinatura)
  })

  app.put('/assinaturas/:id', { preHandler: authMiddleware, schema: { tags: ['Planos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.assinatura.update({ where: { id: Number(id) }, data: body as never })
  })
}
