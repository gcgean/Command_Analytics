import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

const nome = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

function fmt(u: any) {
  return {
    id: u.id,
    nome: nome(u),
    nomeUsu: u.nomeUsu,
    nomeCompleto: u.nomeCompleto,
    nomePlataforma: u.nomePlataforma,
    email: u.email ?? '',
    cargo: u.cargo ?? '',
    departamento: '',
    avatar: u.avatar ?? null,
    ativo: u.ativo === 'S',
    permissoes: ['all'],
  }
}

export async function usuariosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Usuários'] } }, async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: 'S' },
      orderBy: { nomeUsu: 'asc' },
    })
    return usuarios.map(fmt)
  })

  app.get('/todos', { preHandler: authMiddleware, schema: { tags: ['Usuários'], summary: 'Todos os usuários (ativos e inativos)' } }, async () => {
    const usuarios = await prisma.usuario.findMany({ orderBy: { nomeUsu: 'asc' } })
    return usuarios.map(fmt)
  })

  app.get('/:id', { preHandler: authMiddleware, schema: { tags: ['Usuários'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
    return fmt(usuario)
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Usuários'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    // Nunca permitir alteração de senha por esta rota
    delete body.senha
    const usuario = await prisma.usuario.update({
      where: { id: Number(id) },
      data: body as never,
    })
    return fmt(usuario)
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Usuários'], summary: 'Ativar/inativar usuário' } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
    const novoAtivo = usuario.ativo === 'S' ? 'N' : 'S'
    const updated = await prisma.usuario.update({
      where: { id: Number(id) },
      data: { ativo: novoAtivo },
    })
    return fmt(updated)
  })
}
