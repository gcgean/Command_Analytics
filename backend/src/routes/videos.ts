import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

function fmt(v: any) {
  return {
    id: v.id,
    titulo: v.titulo,
    descricao: v.descricao,
    url: v.url,
    tipo: v.tipo,
    categoriaId: v.categoriaId,
    categoriaDescricao: v.categoria?.descricao ?? null,
    colaboradorId: v.colaboradorId,
    colaboradorNome: v.colaborador?.nome ?? null,
    data: v.data,
    visualizacoes: v.visualizacoes ?? 0,
  }
}

export async function videosRoutes(app: FastifyInstance) {
  // GET /videos
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Vídeos'] } }, async (request) => {
    const { categoriaId, tipo, search } = request.query as Record<string, string>

    const videos = await prisma.video.findMany({
      where: {
        ...(categoriaId && { categoriaId: Number(categoriaId) }),
        ...(tipo !== undefined && { tipo: Number(tipo) }),
        ...(search && { titulo: { contains: search } }),
      },
      include: {
        categoria: { select: { id: true, descricao: true } },
        colaborador: { select: { id: true, nome: true } },
      },
      orderBy: { visualizacoes: 'desc' },
    })

    return videos.map(fmt)
  })

  // GET /videos/:id
  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Vídeos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const video = await prisma.video.findUnique({
      where: { id: Number(id) },
      include: {
        categoria: { select: { id: true, descricao: true } },
        colaborador: { select: { id: true, nome: true } },
      },
    })
    if (!video) return reply.status(404).send({ error: 'Vídeo não encontrado.' })
    return fmt(video)
  })

  // POST /videos
  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Vídeos'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const video = await prisma.video.create({ data: body as never })
    return reply.status(201).send(video)
  })

  // PUT /videos/:id
  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Vídeos'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const video = await prisma.video.update({
      where: { id: Number(id) },
      data: body as never,
      include: {
        categoria: { select: { id: true, descricao: true } },
        colaborador: { select: { id: true, nome: true } },
      },
    })
    return fmt(video)
  })

  // POST /videos/:id/visualizar — incrementar visualizações
  app.post('/:id/visualizar', { preHandler: authMiddleware, schema: { tags: ['Vídeos'], summary: 'Registrar visualização' } }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.video.update({
      where: { id: Number(id) },
      data: { visualizacoes: { increment: 1 } },
    })
  })

  // DELETE /videos/:id
  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Vídeos'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.video.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // GET /videos/categorias — listar categorias de vídeo
  app.get('/categorias/lista', { preHandler: authMiddleware, schema: { tags: ['Vídeos'], summary: 'Listar categorias de vídeo' } }, async () => {
    return prisma.categoriaVideo.findMany({ orderBy: { descricao: 'asc' } })
  })
}
