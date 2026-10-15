import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

/**
 * Precificação aberta por link, para as revendas calcularem o preço de uma implantação sem ter
 * conta no Analytics.
 *
 * O que este canal NÃO faz, de propósito:
 *  - não lista nem consulta clientes — o nome é digitado livre;
 *  - não grava nada: a precificação feita aqui não entra no nosso histórico;
 *  - não aceita escrita de espécie alguma, só leitura dos parâmetros de cálculo.
 *
 * O acesso é por token no link, para poder ser revogado sem mexer em código.
 */

export async function initPrecificacaoPublica(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS precificacao_link (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      nome        VARCHAR(120) NOT NULL,
      token       VARCHAR(64) NOT NULL,
      ativo       TINYINT(1) NOT NULL DEFAULT 1,
      acessos     INT NOT NULL DEFAULT 0,
      ultimo_uso  DATETIME NULL,
      criado_por  INT NULL,
      criado_em   DATETIME NOT NULL DEFAULT NOW(),
      UNIQUE KEY uk_precificacao_token (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function validarToken(token: string | undefined) {
  if (!token) return null
  const [l] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, nome, ativo FROM precificacao_link WHERE token = ?`, token)
  if (!l || !l.ativo) return null
  await prisma.$executeRawUnsafe(
    `UPDATE precificacao_link SET acessos = acessos + 1, ultimo_uso = NOW() WHERE id = ?`,
    Number(l.id)).catch(() => {})
  return { id: Number(l.id), nome: String(l.nome) }
}

export async function precificacaoPublicaRoutes(app: FastifyInstance) {
  /**
   * Tudo que a tela pública precisa, numa chamada: os custos padrão e a tabela de migração.
   * Nenhum dado de cliente sai por aqui.
   */
  app.get('/parametros/:token', { schema: { tags: ['Precificação pública'] } }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const link = await validarToken(token)
    if (!link) return reply.status(403).send({ error: 'Link inválido ou desativado.' })

    const [p] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM configuracao_precificacao ORDER BY id LIMIT 1`).catch(() => [null])

    const migracoes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, sistema, tipo, descricao, valor FROM migracao_tabela
        WHERE ativo = 1 ORDER BY sistema, tipo`).catch(() => [])

    return {
      revenda: link.nome,
      parametros: {
        custoKm: Number(p?.custo_km ?? 0),
        custoHoraTecnica: Number(p?.custo_hora_tecnica ?? 0),
        custoHospedagem: Number(p?.custo_hospedagem ?? 0),
        custoAlimentacao: Number(p?.custo_alimentacao ?? 0),
        refeicoesDia: Number(p?.refeicoes_dia ?? 0),
        horasTreinamento: Number(p?.horas_treinamento ?? 0),
        margemAlvo: Number(p?.margem_alvo ?? 0),
        impostosPerc: Number(p?.impostos_perc ?? 0),
        comissaoPerc: Number(p?.comissao_perc ?? 0),
        migracaoRepassePerc: Number(p?.migracao_repasse_perc ?? 30),
      },
      migracoes: migracoes.map((m) => ({
        id: Number(m.id),
        sistema: m.sistema,
        tipo: m.tipo,
        descricao: m.descricao ?? null,
        valor: Number(m.valor ?? 0),
        ativo: true,
      })),
    }
  })

  // ── Administração dos links (usuário logado) ──
  app.get('/links', { preHandler: authMiddleware, schema: { tags: ['Precificação pública'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome, token, ativo, acessos, ultimo_uso, criado_em
         FROM precificacao_link ORDER BY ativo DESC, nome`)
    return linhas.map((l) => ({
      id: Number(l.id),
      nome: l.nome,
      // O token é o próprio link: diferente de uma senha, precisa poder ser copiado de novo.
      token: l.token,
      ativo: !!l.ativo,
      acessos: Number(l.acessos ?? 0),
      ultimoUso: l.ultimo_uso ?? null,
      criadoEm: l.criado_em,
    }))
  })

  app.post('/links', { preHandler: authMiddleware, schema: { tags: ['Precificação pública'] } }, async (request, reply) => {
    const b = request.body as { nome?: string }
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome da revenda.' })
    const token = crypto.randomBytes(16).toString('hex')
    await prisma.$executeRawUnsafe(
      `INSERT INTO precificacao_link (nome, token, criado_por) VALUES (?,?,?)`,
      nome, token, Number((request.user as { id: number } | undefined)?.id ?? 0) || null,
    )
    return reply.status(201).send({ token })
  })

  app.put('/links/:id', { preHandler: authMiddleware, schema: { tags: ['Precificação pública'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const b = request.body as { nome?: string; ativo?: boolean }
    await prisma.$executeRawUnsafe(
      `UPDATE precificacao_link SET nome = COALESCE(?, nome), ativo = ? WHERE id = ?`,
      String(b.nome ?? '').trim() || null, b.ativo === false ? 0 : 1, Number(id),
    )
    return { ok: true }
  })

  app.delete('/links/:id', { preHandler: authMiddleware, schema: { tags: ['Precificação pública'] } }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM precificacao_link WHERE id = ?`, Number(id))
    return { ok: true }
  })
}
