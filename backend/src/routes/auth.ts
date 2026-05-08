import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { getUserPermissions } from './grupos'

function formatUser(u: any, permissoes: string[] = ['*']) {
  return {
    id: u.id,
    nome: u.nomeCompleto || u.nomeUsu || 'Usuário',
    email: u.email ?? '',
    cargo: u.cargo ?? '',
    departamento: u.departamento ?? '',
    avatar: u.avatar ?? null,
    ativo: u.ativo === 'S',
    permissoes,
  }
}

function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Can't reach database server|database server at/i.test(message)
}

function handleAuthRouteError(reply: any, error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return reply.status(503).send({
      error: 'Serviço temporariamente indisponível.',
      message: 'Não foi possível conectar ao banco de dados no momento. Tente novamente em instantes.',
    })
  }

  throw error
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
      try {
        const { usuario: nomeUsu, senha } = request.body as { usuario: string; senha: string }
        const entrada = (nomeUsu ?? '').trim()
        const usuario = await prisma.usuario.findFirst({
          where: {
            OR: [
              { nomeUsu: entrada },
              { nomeUsu: entrada.toUpperCase() },
              { nomeUsu: entrada.toLowerCase() },
            ],
          },
        })
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
      } catch (error) {
        return handleAuthRouteError(reply, error)
      }
    }
  )

  app.get(
    '/me',
    { preHandler: authMiddleware, schema: { tags: ['Auth'], summary: 'Dados do usuário autenticado' } },
    async (request, reply) => {
      try {
        const payload = request.user as { id: number }
        const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } })
        if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
        const permissoes = await getUserPermissions(payload.id)
        return formatUser(usuario, permissoes)
      } catch (error) {
        return handleAuthRouteError(reply, error)
      }
    }
  )

  app.post(
    '/refresh',
    { preHandler: authMiddleware, schema: { tags: ['Auth'], summary: 'Renovar token da sessão autenticada' } },
    async (request, reply) => {
      try {
        const payload = request.user as { id: number }
        const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } })
        if (!usuario || usuario.ativo !== 'S') {
          return reply.status(401).send({ error: 'Usuário inválido para renovação de sessão.' })
        }

        const permissoes = await getUserPermissions(payload.id)
        const user = formatUser(usuario, permissoes)
        const token = app.jwt.sign({ id: usuario.id, email: usuario.email, nome: user.nome })

        return { token, user }
      } catch (error) {
        return handleAuthRouteError(reply, error)
      }
    }
  )

  app.put(
    '/senha',
    { preHandler: authMiddleware, schema: { tags: ['Auth'], summary: 'Alterar senha' } },
    async (request, reply) => {
      try {
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
      } catch (error) {
        return handleAuthRouteError(reply, error)
      }
    }
  )
}
