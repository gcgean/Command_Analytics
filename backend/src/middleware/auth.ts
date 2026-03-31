import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const isDev = process.env.NODE_ENV !== 'production'
  const allowDevBypass = process.env.ALLOW_DEV_AUTH_BYPASS === 'true'

  // Em desenvolvimento, só permite bypass quando explicitamente habilitado por env.
  if (isDev && allowDevBypass) {
    try {
      await request.jwtVerify()
    } catch {
      request.user = { id: 1, email: 'dev@test.com', nome: 'Dev User' }
      return
    }
  } else {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Token inválido ou expirado. Faça login novamente.' })
    }
  }
}
