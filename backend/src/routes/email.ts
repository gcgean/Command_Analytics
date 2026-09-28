import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middleware/auth'
import { obterConfigEmail, salvarConfigEmail, enviarEmail, montarHtmlEmail } from '../utils/email'

export async function emailRoutes(app: FastifyInstance) {
  // GET /email/config — a senha nunca volta pra tela, só a informação de que existe uma gravada
  app.get('/config', { preHandler: [authMiddleware], schema: { tags: ['E-mail'] } }, async () => {
    const c = await obterConfigEmail()
    if (!c) {
      return { ativo: false, host: '', porta: 587, seguro: false, usuario: '', remetenteNome: '', remetenteEmail: '', temSenha: false }
    }
    const { senha, ...semSenha } = c
    return { ...semSenha, temSenha: !!senha }
  })

  // PUT /email/config — senha em branco mantém a atual
  app.put('/config', { preHandler: [authMiddleware], schema: { tags: ['E-mail'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    if (b.ativo && !String(b.host ?? '').trim()) {
      return reply.status(400).send({ error: 'Informe o host SMTP para ativar o envio.' })
    }
    await salvarConfigEmail({
      ativo: !!b.ativo,
      host: b.host,
      porta: b.porta !== undefined ? Number(b.porta) : undefined,
      seguro: !!b.seguro,
      usuario: b.usuario,
      senha: b.senha,
      remetenteNome: b.remetenteNome,
      remetenteEmail: b.remetenteEmail,
    })
    const c = await obterConfigEmail()
    const { senha, ...semSenha } = c!
    return { ...semSenha, temSenha: !!senha }
  })

  // POST /email/testar — envia de verdade, pra separar "configurei certo" de "achei que estava certo"
  app.post('/testar', { preHandler: [authMiddleware], schema: { tags: ['E-mail'] } }, async (request, reply) => {
    const { para } = request.body as { para?: string }
    const destino = String(para ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destino)) {
      return reply.status(400).send({ error: 'Informe um e-mail de destino válido para o teste.' })
    }

    const envio = await enviarEmail({
      para: destino,
      assunto: 'Teste de configuração de e-mail — Command Analytics',
      html: montarHtmlEmail(
        'Configuração de e-mail funcionando',
        `<p>Se você está lendo esta mensagem, o servidor SMTP configurado no Command Analytics está enviando corretamente.</p>
         <p>Enviado em ${new Date().toLocaleString('pt-BR')}.</p>`,
      ),
    })
    if (!envio.success) return reply.status(400).send({ error: envio.error || 'Falha ao enviar o e-mail de teste.' })
    return { ok: true }
  })
}
