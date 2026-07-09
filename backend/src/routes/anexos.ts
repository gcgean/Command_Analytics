import type { FastifyInstance } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { pipeline } from 'node:stream/promises'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

type TabelaAnexo = 'agenda' | 'agendamento_programado' | 'cliente_prontuario'

function isTabelaAnexo(value: unknown): value is TabelaAnexo {
  return value === 'agenda' || value === 'agendamento_programado' || value === 'cliente_prontuario'
}

function toInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._\-\s]/g, '').trim()
  const collapsed = base.replace(/\s+/g, ' ')
  return collapsed.slice(0, 180) || 'arquivo'
}

function getUploadsDir(tabela: TabelaAnexo): string {
  if (tabela === 'cliente_prontuario') {
    return path.resolve(process.cwd(), 'uploads', 'clientes', 'prontuario')
  }
  return path.resolve(process.cwd(), 'uploads', 'agendamentos')
}

function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function ensureUploadsDir(tabela: TabelaAnexo): Promise<string> {
  const dir = getUploadsDir(tabela)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function drain(stream: NodeJS.ReadableStream): Promise<void> {
  for await (const _chunk of stream as any) {
    void _chunk
  }
}

async function assertRegistroExiste(tabela: TabelaAnexo, registroId: number): Promise<boolean> {
  if (tabela === 'agenda') {
    const row: any[] = await prisma.$queryRaw`SELECT cod_agenda AS id FROM agenda WHERE cod_agenda = ${registroId} LIMIT 1`
    return row.length > 0
  }
  if (tabela === 'cliente_prontuario') {
    const row: any[] = await prisma.$queryRaw`SELECT cod_cli AS id FROM cliente WHERE cod_cli = ${registroId} LIMIT 1`
    return row.length > 0
  }
  const row: any[] = await prisma.$queryRaw`SELECT id AS id FROM agendamento_programado WHERE id = ${registroId} LIMIT 1`
  return row.length > 0
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILES_PER_RECORD = 10
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'application/x-pkcs12',
  'application/x-pkcs7-certificates',
])
const ALLOWED_CERT_EXT = new Set(['.pfx', '.p12'])

export async function anexosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Agenda'], summary: 'Listar anexos' } }, async (request) => {
    const { tabela, registroId } = request.query as Record<string, string>
    if (!isTabelaAnexo(tabela)) return []
    const id = toInt(registroId)
    if (!id) return []

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, tabela, registro_id AS registroId, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt
      FROM agendamento_anexo
      WHERE tabela = ${tabela} AND registro_id = ${id}
      ORDER BY created_at DESC, id DESC
    `
    return rows.map(r => ({
      id: Number(r.id),
      tabela: String(r.tabela),
      registroId: Number(r.registroId),
      originalName: String(r.originalName),
      mimeType: String(r.mimeType),
      sizeBytes: Number(r.sizeBytes),
      createdAt: r.createdAt,
    }))
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Agenda'], summary: 'Upload de anexos' } }, async (request, reply) => {
    const { tabela, registroId } = request.query as Record<string, string>
    if (!isTabelaAnexo(tabela)) return reply.status(400).send({ error: 'Tabela inválida.' })
    const id = toInt(registroId)
    if (!id) return reply.status(400).send({ error: 'registroId inválido.' })

    const exists = await assertRegistroExiste(tabela, id)
    if (!exists) return reply.status(404).send({ error: 'Registro não encontrado.' })

    const uploadsDir = await ensureUploadsDir(tabela)
    let uploadedCount = 0
    const existingRows: any[] = await prisma.$queryRaw`
      SELECT COUNT(*) AS c FROM agendamento_anexo WHERE tabela = ${tabela} AND registro_id = ${id}
    `
    const existingCount = Number(existingRows?.[0]?.c ?? 0)
    let totalAfter = existingCount

    try {
      const parts = request.parts()
      for await (const part of parts) {
        if ((part as any).type !== 'file') continue

        const filePart = part as MultipartFile

        if (totalAfter >= MAX_FILES_PER_RECORD) {
          await drain(filePart.file)
          continue
        }

        const mimeType = String((filePart as any).mimetype || '')
        const originalNameRaw = String((filePart as any).filename || 'arquivo')
        const extRaw = path.extname(originalNameRaw).toLowerCase()
        const isCertFile = ALLOWED_CERT_EXT.has(extRaw)
        if (!ALLOWED_MIME.has(mimeType) && !isCertFile) {
          await drain(filePart.file)
          continue
        }

        const originalName = sanitizeFilename(originalNameRaw)
        const ext = path.extname(originalName).slice(0, 10)
        const storedName = `${randomUUID()}${ext}`
        const fullPath = path.join(uploadsDir, storedName)

        await pipeline(filePart.file, createWriteStream(fullPath))

        const stat = await fs.stat(fullPath)
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          await fs.unlink(fullPath).catch(() => {})
          continue
        }

        const userId = (request as any).user?.id ? Number((request as any).user.id) : null

        await prisma.$executeRaw`
          INSERT INTO agendamento_anexo (tabela, registro_id, original_name, stored_name, mime_type, size_bytes, created_by, created_at)
          VALUES (${tabela}, ${id}, ${originalName}, ${storedName}, ${mimeType}, ${Number(stat.size)}, ${userId}, NOW())
        `

        uploadedCount += 1
        totalAfter += 1
      }
    } catch (e: any) {
      const message = String(e?.message ?? '')
      if (message.toLowerCase().includes('file size') || message.toLowerCase().includes('limit')) {
        return reply.status(413).send({ error: 'Arquivo excede o limite de 10MB.' })
      }
      return reply.status(400).send({ error: 'Falha ao processar upload.' })
    }

    if (uploadedCount === 0) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado (ou tipos não permitidos).' })
    }

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, tabela, registro_id AS registroId, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt
      FROM agendamento_anexo
      WHERE tabela = ${tabela} AND registro_id = ${id}
      ORDER BY created_at DESC, id DESC
    `
    return rows.map(r => ({
      id: Number(r.id),
      tabela: String(r.tabela),
      registroId: Number(r.registroId),
      originalName: String(r.originalName),
      mimeType: String(r.mimeType),
      sizeBytes: Number(r.sizeBytes),
      createdAt: r.createdAt,
    }))
  })

  app.get('/:id/download', { preHandler: authMiddleware, schema: { tags: ['Agenda'], summary: 'Download de anexo' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const anexoId = toInt(id)
    if (!anexoId) return reply.status(400).send({ error: 'id inválido.' })

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, tabela, original_name AS originalName, stored_name AS storedName, mime_type AS mimeType, size_bytes AS sizeBytes
      FROM agendamento_anexo
      WHERE id = ${anexoId}
      LIMIT 1
    `
    if (!rows.length) return reply.status(404).send({ error: 'Anexo não encontrado.' })
    const row = rows[0]

    const uploadsDir = getUploadsDir(String(row.tabela || 'agenda') as TabelaAnexo)
    const fullPath = path.resolve(uploadsDir, String(row.storedName))
    if (!isPathInside(uploadsDir, fullPath)) return reply.status(400).send({ error: 'Caminho inválido.' })

    const download = (request.query as any)?.download === '1'
    const dispositionType = download ? 'attachment' : 'inline'
    const filename = sanitizeFilename(String(row.originalName))

    reply.header('Content-Type', String(row.mimeType))
    reply.header('Content-Length', String(Number(row.sizeBytes)))
    reply.header('Content-Disposition', `${dispositionType}; filename="${filename}"`)

    return reply.send(createReadStream(fullPath))
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Agenda'], summary: 'Excluir anexo' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const anexoId = toInt(id)
    if (!anexoId) return reply.status(400).send({ error: 'id inválido.' })

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, tabela, stored_name AS storedName
      FROM agendamento_anexo
      WHERE id = ${anexoId}
      LIMIT 1
    `
    if (!rows.length) return reply.status(404).send({ error: 'Anexo não encontrado.' })
    const row = rows[0]

    const uploadsDir = getUploadsDir(String(row.tabela || 'agenda') as TabelaAnexo)
    const fullPath = path.resolve(uploadsDir, String(row.storedName))
    if (isPathInside(uploadsDir, fullPath)) {
      await fs.unlink(fullPath).catch(() => {})
    }

    await prisma.$executeRaw`DELETE FROM agendamento_anexo WHERE id = ${anexoId}`
    return reply.status(204).send()
  })
}

