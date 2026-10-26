import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { pipeline } from 'node:stream/promises'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

const MIME_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const MAX_IMAGEM_BYTES = 3 * 1024 * 1024

const pastaImagens = () => path.resolve(process.cwd(), 'uploads', 'smartpos')

const dentroDe = (pai: string, filho: string) => {
  const rel = path.relative(pai, filho)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const formatar = (t: any) => ({
  id: Number(t.id),
  adquirente: t.adquirente as string,
  modelo: t.modelo as string,
  fabricante: (t.fabricante ?? null) as string | null,
  observacao: (t.observacao ?? null) as string | null,
  integracaoPropria: Number(t.integracao_propria) === 1,
  integracaoNome: (t.integracao_nome ?? null) as string | null,
  fonte: (t.fonte ?? null) as string | null,
  temImagem: !!t.imagem_nome,
  ativo: Number(t.ativo) === 1,
  ordem: Number(t.ordem ?? 0),
  atualizadoEm: t.atualizado_em,
})

export async function smartposRoutes(app: FastifyInstance) {
  /** Catálogo agrupado por adquirente — é como a consulta acontece no atendimento. */
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request) => {
    const { busca, adquirente, todos } = request.query as Record<string, string>
    const cond: string[] = []
    const val: any[] = []
    if (todos !== 'true') cond.push('ativo = 1')
    if (adquirente) { cond.push('adquirente = ?'); val.push(adquirente) }
    if (busca) {
      cond.push('(modelo LIKE ? OR fabricante LIKE ? OR adquirente LIKE ?)')
      const termo = `%${busca}%`
      val.push(termo, termo, termo)
    }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM smartpos_homologado
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY ordem, adquirente, modelo`, ...val).catch(() => [])

    const grupos: Array<{ adquirente: string; terminais: ReturnType<typeof formatar>[] }> = []
    for (const l of linhas) {
      const nome = String(l.adquirente)
      let g = grupos.find((x) => x.adquirente === nome)
      if (!g) { g = { adquirente: nome, terminais: [] }; grupos.push(g) }
      g.terminais.push(formatar(l))
    }
    return { grupos, total: linhas.length }
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const adquirente = String(b.adquirente ?? '').trim()
    const modelo = String(b.modelo ?? '').trim()
    if (!adquirente || !modelo) {
      return reply.status(400).send({ error: 'Informe a adquirente e o modelo.' })
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO smartpos_homologado
         (adquirente, modelo, fabricante, observacao, fonte, integracao_propria,
          integracao_nome, ativo, ordem)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE fabricante = VALUES(fabricante), observacao = VALUES(observacao),
         fonte = VALUES(fonte), integracao_propria = VALUES(integracao_propria),
         integracao_nome = VALUES(integracao_nome), ativo = VALUES(ativo), ordem = VALUES(ordem)`,
      adquirente, modelo,
      String(b.fabricante ?? '').trim() || null,
      String(b.observacao ?? '').trim() || null,
      String(b.fonte ?? '').trim() || null,
      b.integracaoPropria ? 1 : 0,
      String(b.integracaoNome ?? '').trim() || null,
      b.ativo === false ? 0 : 1,
      Number(b.ordem ?? 0) || 0)
    const [novo] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM smartpos_homologado WHERE adquirente = ? AND modelo = ?`, adquirente, modelo)
    return reply.status(201).send(formatar(novo))
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const [atual] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM smartpos_homologado WHERE id = ?`, Number(id))
    if (!atual) return reply.status(404).send({ error: 'Terminal não encontrado.' })

    await prisma.$executeRawUnsafe(
      `UPDATE smartpos_homologado
          SET adquirente = ?, modelo = ?, fabricante = ?, observacao = ?, fonte = ?,
              integracao_propria = ?, integracao_nome = ?, ativo = ?, ordem = ?
        WHERE id = ?`,
      String(b.adquirente ?? atual.adquirente).trim(),
      String(b.modelo ?? atual.modelo).trim(),
      b.fabricante === undefined ? atual.fabricante : (String(b.fabricante).trim() || null),
      b.observacao === undefined ? atual.observacao : (String(b.observacao).trim() || null),
      b.fonte === undefined ? atual.fonte : (String(b.fonte).trim() || null),
      b.integracaoPropria === undefined ? atual.integracao_propria : (b.integracaoPropria ? 1 : 0),
      b.integracaoNome === undefined ? atual.integracao_nome : (String(b.integracaoNome).trim() || null),
      b.ativo === undefined ? atual.ativo : (b.ativo ? 1 : 0),
      b.ordem === undefined ? atual.ordem : Number(b.ordem) || 0,
      Number(id))
    const [novo] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM smartpos_homologado WHERE id = ?`, Number(id))
    return formatar(novo)
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const [t] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT imagem_nome FROM smartpos_homologado WHERE id = ?`, Number(id))
    if (t?.imagem_nome) {
      const caminho = path.join(pastaImagens(), String(t.imagem_nome))
      if (dentroDe(pastaImagens(), caminho)) await fs.unlink(caminho).catch(() => {})
    }
    await prisma.$executeRawUnsafe(`DELETE FROM smartpos_homologado WHERE id = ?`, Number(id))
    return { ok: true }
  })

  // ── Foto do terminal ──
  app.post('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [t] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM smartpos_homologado WHERE id = ?`, Number(id))
    if (!t) return reply.status(404).send({ error: 'Terminal não encontrado.' })

    const dir = pastaImagens()
    await fs.mkdir(dir, { recursive: true })

    let guardado: string | null = null
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
      const nome = String((arquivo as any).filename || 'foto')
      guardado = `${randomUUID()}${path.extname(nome).slice(0, 10)}`
      await pipeline(arquivo.file, createWriteStream(path.join(dir, guardado)))
      tamanho = (await fs.stat(path.join(dir, guardado))).size
      break
    }

    if (!guardado) return reply.status(400).send({ error: 'Nenhuma imagem enviada.' })
    if (tamanho > MAX_IMAGEM_BYTES) {
      await fs.unlink(path.join(dir, guardado)).catch(() => {})
      return reply.status(400).send({ error: 'A imagem passa de 3 MB.' })
    }

    // A anterior sai do disco: trocar a foto não deveria deixar arquivo morto.
    if (t.imagem_nome) {
      const antigo = path.join(dir, String(t.imagem_nome))
      if (dentroDe(dir, antigo)) await fs.unlink(antigo).catch(() => {})
    }
    await prisma.$executeRawUnsafe(
      `UPDATE smartpos_homologado SET imagem_nome = ?, imagem_mime = ? WHERE id = ?`,
      guardado, mimeType, Number(id))
    return { ok: true }
  })

  app.get('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [t] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT imagem_nome, imagem_mime FROM smartpos_homologado WHERE id = ?`, Number(id))
    if (!t?.imagem_nome) return reply.status(404).send({ error: 'Terminal sem foto.' })

    const dir = pastaImagens()
    const caminho = path.join(dir, String(t.imagem_nome))
    if (!dentroDe(dir, caminho)) return reply.status(400).send({ error: 'Caminho inválido.' })
    if (!(await fs.stat(caminho).catch(() => null))) {
      return reply.status(404).send({ error: 'Arquivo não está mais no servidor.' })
    }
    reply.header('Content-Type', String(t.imagem_mime || 'image/png'))
    reply.header('Cache-Control', 'private, max-age=300')
    return reply.send(createReadStream(caminho))
  })

  app.delete('/:id/imagem', { preHandler: authMiddleware, schema: { tags: ['SmartPOS'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const [t] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT imagem_nome FROM smartpos_homologado WHERE id = ?`, Number(id))
    if (t?.imagem_nome) {
      const caminho = path.join(pastaImagens(), String(t.imagem_nome))
      if (dentroDe(pastaImagens(), caminho)) await fs.unlink(caminho).catch(() => {})
    }
    await prisma.$executeRawUnsafe(
      `UPDATE smartpos_homologado SET imagem_nome = NULL, imagem_mime = NULL WHERE id = ?`,
      Number(id))
    return { ok: true }
  })
}
