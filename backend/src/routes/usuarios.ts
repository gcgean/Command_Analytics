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
    departamento: u.departamento ?? '',
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

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Usuários'] } }, async (request, reply) => {
    try {
      const body = request.body as any
      const bcrypt = require('bcryptjs')
      const saltRounds = 10
      const senhaHash = body.senha ? await bcrypt.hash(body.senha, saltRounds) : null

      const maxId = await prisma.usuario.aggregate({ _max: { id: true } })
      const nextId = (maxId._max.id || 0) + 1

      const data: any = {
        id: nextId,
        nomeUsu: body.nomeUsu,
        nomeCompleto: body.nomeCompleto || body.nome || '',
        email: body.email,
        cargo: body.cargo,
        ativo: body.ativo === false || body.ativo === 'N' ? 'N' : 'S',
      }
      if (senhaHash) data.senha = senhaHash

      const usuario = await prisma.usuario.create({ data })
      return reply.status(201).send(fmt(usuario))
    } catch (err: any) {
      // Trata erros de constraint e validação para evitar 500 genérico
      const code = err?.code
      if (code === 'P2002') {
        const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(',') : err?.meta?.target
        const msg = target?.includes('email_analytics') ? 'E-mail já cadastrado.' : 'Registro duplicado.'
        return reply.status(400).send({ error: msg })
      }
      return reply.status(400).send({ error: err?.message || 'Falha ao salvar usuário.' })
    }
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Usuários'] } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = request.body as any
      const data: any = { ...body }
      
      if (body.senha) {
        const bcrypt = require('bcryptjs')
        const saltRounds = 10
        data.senha = await bcrypt.hash(body.senha, saltRounds)
      } else {
        delete data.senha
      }
      
      if (data.ativo === true || data.ativo === 'S') {
        data.ativo = 'S'
      } else if (data.ativo === false || data.ativo === 'N') {
        data.ativo = 'N'
      }

      delete data.id
      delete data.nome
      delete data.departamento

      if (data.nomeCompleto === undefined && body.nome) {
        data.nomeCompleto = body.nome
      }

      const usuario = await prisma.usuario.update({
        where: { id: Number(id) },
        data,
      })
      return fmt(usuario)
    } catch (err: any) {
      const code = err?.code
      if (code === 'P2002') {
        const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(',') : err?.meta?.target
        const msg = target?.includes('email_analytics') ? 'E-mail já cadastrado.' : 'Registro duplicado.'
        return reply.status(400).send({ error: msg })
      }
      if (code === 'P2025') {
        return reply.status(404).send({ error: 'Usuário não encontrado para atualização.' })
      }
      return reply.status(400).send({ error: err?.message || 'Falha ao atualizar usuário.' })
    }
  })

  app.patch('/:id/toggle', { preHandler: authMiddleware, schema: { tags: ['Usuários'], summary: 'Ativar/inativar usuário' } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } })
      if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
      const novoAtivo = usuario.ativo === 'S' ? 'N' : 'S'
      const updated = await prisma.usuario.update({
        where: { id: Number(id) },
        data: { ativo: novoAtivo },
      })
      return fmt(updated)
    } catch (err: any) {
      const code = err?.code
      if (code === 'P2025') {
        return reply.status(404).send({ error: 'Usuário não encontrado para atualização.' })
      }
      return reply.status(400).send({ error: err?.message || 'Falha ao alterar status do usuário.' })
    }
  })
}
