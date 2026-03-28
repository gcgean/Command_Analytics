import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Dev mode: bypass auth if no token
  if (process.env.NODE_ENV !== 'production') {
    try {
      await request.jwtVerify()
    } catch {
      // In development, create a dummy user if token is invalid
      request.user = { id: 1, email: 'dev@test.com', nome: 'Dev User' }
      return
    }
  } else {
    // Production: strict auth
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Token inválido ou expirado. Faça login novamente.' })
    }
  }
}
