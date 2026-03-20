import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'

function formatUser(u: any, permissoes: string[] = ['*']) {
  return {
    id: u.id,
    nome: u.nomeCompleto || u.nomeUsu || 'Usuário',
    email: u.email ?? '',
    cargo: u.cargo ?? '',
    departamento: '',
    avatar: u.avatar ?? null,
    ativo: u.ativo === 'S',
    permissoes,
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Autenticar usuário',
        body: {
          type: 'object',
          required: ['usuario', 'senha'],
          properties: {
            usuario: { type: 'string' },
            senha: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { usuario: nomeUsu, senha } = request.body as { usuario: string; senha: string }
      const usuario = await prisma.usuario.findFirst({ where: { nomeUsu } })
      if (!usuario || usuario.ativo !== 'S') {
        return reply.status(401).send({ error: 'Credenciais inválidas.' })
      }
      if (!usuario.senha) {
        return reply.status(401).send({ error: 'Usuário sem acesso à plataforma analytics.' })
      }
      const senhaOk = await bcrypt.compare(senha, usuario.senha)
      if (!senhaOk) {
        return reply.status(401).send({ error: 'Credenciais inválidas.' })
      }
      const permissoes = await getUserPermissions(usuario.id)
      const user = formatUser(usuario, permissoes)
      const token = app.jwt.sign({ id: usuario.id, email: usuario.email, nome: user.nome })
      return { token, user }
    }
  )

  app.get(
    '/me',
    { preHandler: authMiddleware, schema: { tags: ['Auth'], summary: 'Dados do usuário autenticado' } },
    async (request, reply) => {
      const payload = request.user as { id: number }
      const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } })
      if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
      const permissoes = await getUserPermissions(payload.id)
      return formatUser(usuario, permissoes)
    }
  )

  app.put(
    '/senha',
    { preHandler: authMiddleware, schema: { tags: ['Auth'], summary: 'Alterar senha' } },
    async (request, reply) => {
      const payload = request.user as { id: number }
      const { senhaAtual, novaSenha } = request.body as { senhaAtual: string; novaSenha: string }
      const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } })
      if (!usuario || !usuario.senha) {
        return reply.status(404).send({ error: 'Usuário não encontrado.' })
      }
      const ok = await bcrypt.compare(senhaAtual, usuario.senha)
      if (!ok) return reply.status(400).send({ error: 'Senha atual incorreta.' })
      const hash = await bcrypt.hash(novaSenha, 10)
      await prisma.usuario.update({ where: { id: payload.id }, data: { senha: hash } })
      return { message: 'Senha alterada com sucesso.' }
    }
  )
}
