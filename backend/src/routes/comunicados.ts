import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { TelegramService } from '../services/telegram'

/**
 * Comunicados por Telegram: uma mensagem para vários usuários de uma vez.
 *
 * O envio é sequencial e espaçado de propósito. A API do Telegram limita o ritmo de mensagens e
 * responde 429 quando se dispara tudo de uma vez — e um 429 no meio de um comunicado deixa
 * metade da equipe sem receber, sem ninguém perceber.
 */

const INTERVALO_ENVIO_MS = 120
const MAX_CARACTERES = 4000 // limite do Telegram é 4096; sobra para o rodapé

export async function initComunicados(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comunicado (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      titulo        VARCHAR(160) NULL,
      mensagem      TEXT NOT NULL,
      enviado_por   INT NULL,
      destinatarios INT NOT NULL DEFAULT 0,
      entregues     INT NOT NULL DEFAULT 0,
      falhas        INT NOT NULL DEFAULT 0,
      criado_em     DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_comunicado_data (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Uma linha por destinatário: sem isso não dá para saber quem ficou de fora.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS comunicado_destinatario (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      comunicado_id INT NOT NULL,
      usuario_id    INT NOT NULL,
      nome          VARCHAR(150) NULL,
      entregue      TINYINT(1) NOT NULL DEFAULT 0,
      erro          VARCHAR(300) NULL,
      INDEX idx_comunicado_dest (comunicado_id),
      CONSTRAINT fk_comunicado_dest FOREIGN KEY (comunicado_id) REFERENCES comunicado(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function comunicadosRoutes(app: FastifyInstance) {
  /**
   * Quem pode receber: usuário ativo e com o Telegram vinculado. Inativo nem aparece —
   * continuava na lista por engano, e quem saiu da empresa não deve receber comunicado
   * interno nem por marcação manual.
   */
  app.get('/destinatarios', { preHandler: authMiddleware, schema: { tags: ['Comunicados'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT u.COD_USU AS id,
             COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome,
             u.NOME_USU AS login,
             u.ID_TELEGRAM AS telegram,
             COALESCE(u.ATIVO, 'S') AS ativo
        FROM usuario u
       WHERE u.ID_TELEGRAM IS NOT NULL AND u.ID_TELEGRAM <> ''
         AND COALESCE(u.ATIVO, 'S') = 'S'
       ORDER BY nome`)
    return linhas.map((l) => ({
      id: Number(l.id),
      nome: l.nome || l.login || `Usuário ${l.id}`,
      login: l.login ?? null,
      ativo: String(l.ativo) === 'S',
    }))
  })

  /**
   * Dispara o comunicado. `usuarios` vazio significa todos os vinculados e ativos — mandar para
   * todo mundo precisa ser uma escolha explícita, então a tela sempre envia a lista.
   */
  app.post('/enviar', { preHandler: authMiddleware, schema: { tags: ['Comunicados'] } }, async (request, reply) => {
    const b = request.body as { titulo?: string; mensagem?: string; usuarios?: number[] }
    const mensagem = String(b.mensagem ?? '').trim()
    if (!mensagem) return reply.status(400).send({ error: 'Escreva a mensagem.' })
    if (mensagem.length > MAX_CARACTERES) {
      return reply.status(400).send({ error: `A mensagem passa de ${MAX_CARACTERES} caracteres.` })
    }

    const escolhidos = Array.isArray(b.usuarios) ? b.usuarios.map(Number).filter(Boolean) : []
    const todos = await prisma.$queryRawUnsafe<any[]>(`
      SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome,
             u.ID_TELEGRAM AS telegram
        FROM usuario u
       WHERE u.ID_TELEGRAM IS NOT NULL AND u.ID_TELEGRAM <> '' AND COALESCE(u.ATIVO,'S') = 'S'`)

    const alvo = escolhidos.length
      ? todos.filter((u) => escolhidos.includes(Number(u.id)))
      : todos
    if (alvo.length === 0) {
      return reply.status(400).send({ error: 'Nenhum destinatário com Telegram vinculado.' })
    }

    const titulo = String(b.titulo ?? '').trim().slice(0, 160) || null
    const autor = Number((request.user as { id: number } | undefined)?.id ?? 0) || null

    await prisma.$executeRawUnsafe(
      `INSERT INTO comunicado (titulo, mensagem, enviado_por, destinatarios) VALUES (?,?,?,?)`,
      titulo, mensagem, autor, alvo.length,
    )
    const [criado] = await prisma.$queryRawUnsafe<any[]>(`SELECT LAST_INSERT_ID() AS id`)
    const comunicadoId = Number(criado?.id ?? 0)

    const texto = titulo ? `📢 *${titulo}*\n\n${mensagem}` : `📢 ${mensagem}`
    let entregues = 0
    let falhas = 0

    for (const u of alvo) {
      let erro: string | null = null
      try {
        const r = await TelegramService.enviar({ userId: String(u.telegram), mensagem: texto })
        if (r.success) entregues += 1
        else { falhas += 1; erro = r.error ?? 'Falha no envio' }
      } catch (e: any) {
        falhas += 1
        erro = String(e?.message ?? e)
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO comunicado_destinatario (comunicado_id, usuario_id, nome, entregue, erro)
         VALUES (?,?,?,?,?)`,
        comunicadoId, Number(u.id), String(u.nome ?? '').slice(0, 150),
        erro ? 0 : 1, erro?.slice(0, 300) ?? null,
      ).catch(() => {})
      // Espaça os envios para não tomar 429 do Telegram no meio do comunicado.
      await espera(INTERVALO_ENVIO_MS)
    }

    await prisma.$executeRawUnsafe(
      `UPDATE comunicado SET entregues = ?, falhas = ? WHERE id = ?`, entregues, falhas, comunicadoId)

    return { id: comunicadoId, destinatarios: alvo.length, entregues, falhas }
  })

  /**
   * Reenvia só a quem falhou. Não é automático de propósito: o erro que aparece aqui é
   * timeout do relay, e timeout não diz se a mensagem chegou ou não — repetir sozinho
   * duplicaria o comunicado para quem já recebeu. Quem decide é quem está olhando.
   */
  app.post('/:id/reenviar', { preHandler: authMiddleware, schema: { tags: ['Comunicados'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const comunicadoId = Number(id)

    const [c] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, titulo, mensagem FROM comunicado WHERE id = ?`, comunicadoId)
    if (!c) return reply.status(404).send({ error: 'Comunicado não encontrado.' })

    const pendentes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cd.id, cd.usuario_id, cd.nome, u.ID_TELEGRAM AS telegram
         FROM comunicado_destinatario cd
         INNER JOIN usuario u ON u.COD_USU = cd.usuario_id
        WHERE cd.comunicado_id = ? AND cd.entregue = 0
          AND u.ID_TELEGRAM IS NOT NULL AND u.ID_TELEGRAM <> ''`, comunicadoId)
    if (pendentes.length === 0) {
      return reply.status(400).send({ error: 'Não há falhas para reenviar neste comunicado.' })
    }

    const texto = c.titulo ? `📢 *${c.titulo}*

${c.mensagem}` : `📢 ${c.mensagem}`
    let entregues = 0
    let falhas = 0

    for (const d of pendentes) {
      let erro: string | null = null
      try {
        const r = await TelegramService.enviar({ userId: String(d.telegram), mensagem: texto })
        if (r.success) entregues += 1
        else { falhas += 1; erro = r.error ?? 'Falha no envio' }
      } catch (e: any) {
        falhas += 1
        erro = String(e?.message ?? e)
      }
      await prisma.$executeRawUnsafe(
        `UPDATE comunicado_destinatario SET entregue = ?, erro = ? WHERE id = ?`,
        erro ? 0 : 1, erro?.slice(0, 300) ?? null, Number(d.id),
      ).catch(() => {})
      await espera(INTERVALO_ENVIO_MS)
    }

    // Recalcula pelo log, que é a fonte: somar aqui erraria se alguém reenviasse duas vezes.
    const [tot] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT SUM(entregue) AS ok, SUM(1 - entregue) AS nok
         FROM comunicado_destinatario WHERE comunicado_id = ?`, comunicadoId)
    await prisma.$executeRawUnsafe(
      `UPDATE comunicado SET entregues = ?, falhas = ? WHERE id = ?`,
      Number(tot?.ok ?? 0), Number(tot?.nok ?? 0), comunicadoId)

    return { tentados: pendentes.length, entregues, falhas }
  })

  /** Histórico, para saber o que já foi comunicado e quem não recebeu. */
  app.get('/historico', { preHandler: authMiddleware, schema: { tags: ['Comunicados'] } }, async (request) => {
    const { limite } = request.query as { limite?: string }
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS autor
         FROM comunicado c
         LEFT JOIN usuario u ON u.COD_USU = c.enviado_por
        ORDER BY c.criado_em DESC LIMIT ${Math.min(Number(limite) || 30, 200)}`)
    return linhas.map((l) => ({
      id: Number(l.id),
      titulo: l.titulo ?? null,
      mensagem: l.mensagem,
      autor: l.autor ?? null,
      destinatarios: Number(l.destinatarios ?? 0),
      entregues: Number(l.entregues ?? 0),
      falhas: Number(l.falhas ?? 0),
      criadoEm: l.criado_em,
    }))
  })

  app.get('/historico/:id', { preHandler: authMiddleware, schema: { tags: ['Comunicados'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT usuario_id, nome, entregue, erro FROM comunicado_destinatario
        WHERE comunicado_id = ? ORDER BY entregue, nome`, Number(id))
    return linhas.map((l) => ({
      usuarioId: Number(l.usuario_id),
      nome: l.nome ?? `Usuário ${l.usuario_id}`,
      entregue: !!l.entregue,
      erro: l.erro ?? null,
    }))
  })
}
