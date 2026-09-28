import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { registrarAuditoria } from '../utils/auditoria'

/**
 * Metas de tarefas por período — o objetivo de longo prazo que o dia a dia de solicitação
 * urgente faz esquecer. É uma lista de itens marcáveis com data de início e fim, separada das
 * solicitações de propósito: meta não é chamado, não tem cliente e não pode competir com a fila.
 */
export async function initMetasDev(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_desenvolvimento (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      titulo          VARCHAR(200) NOT NULL,
      detalhe         VARCHAR(1000) NULL,
      desenvolvedor_id INT NULL,
      projeto_id      INT NULL,
      periodo_inicio  DATE NOT NULL,
      periodo_fim     DATE NOT NULL,
      concluida       TINYINT(1) NOT NULL DEFAULT 0,
      concluida_em    DATETIME NULL,
      concluida_por   INT NULL,
      criada_por      INT NULL,
      criada_em       DATETIME NOT NULL DEFAULT NOW(),
      INDEX idx_meta_periodo (periodo_inicio, periodo_fim)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

interface LinhaMeta {
  id: number
  titulo: string
  detalhe: string | null
  desenvolvedor_id: number | null
  desenvolvedor_nome: string | null
  projeto_id: number | null
  projeto_nome: string | null
  periodo_inicio: Date
  periodo_fim: Date
  concluida: number
  concluida_em: Date | null
  concluida_por_nome: string | null
}

const paraMeta = (l: LinhaMeta) => ({
  id: Number(l.id),
  titulo: l.titulo,
  detalhe: l.detalhe,
  desenvolvedorId: l.desenvolvedor_id ? Number(l.desenvolvedor_id) : null,
  desenvolvedorNome: l.desenvolvedor_nome,
  projetoId: l.projeto_id ? Number(l.projeto_id) : null,
  projetoNome: l.projeto_nome,
  periodoInicio: l.periodo_inicio,
  periodoFim: l.periodo_fim,
  concluida: Number(l.concluida) === 1,
  concluidaEm: l.concluida_em,
  concluidaPorNome: l.concluida_por_nome,
})

export async function metasDevRoutes(app: FastifyInstance) {
  // GET /metas-dev?inicio=&fim=&desenvolvedorId=&projetoId=
  app.get('/', { preHandler: authMiddleware, schema: { tags: ['Metas do Dev'] } }, async (request) => {
    const { inicio, fim, desenvolvedorId, projetoId } = request.query as Record<string, string>

    const condicoes: string[] = []
    const valores: any[] = []
    // Sobreposição de período: uma meta de trimestre aparece em todos os meses que ela cruza.
    if (inicio) { condicoes.push('m.periodo_fim >= ?'); valores.push(inicio) }
    if (fim) { condicoes.push('m.periodo_inicio <= ?'); valores.push(fim) }
    if (desenvolvedorId) { condicoes.push('m.desenvolvedor_id = ?'); valores.push(Number(desenvolvedorId)) }
    if (projetoId) { condicoes.push('m.projeto_id = ?'); valores.push(Number(projetoId)) }

    const linhas = await prisma.$queryRawUnsafe<LinhaMeta[]>(
      `SELECT m.id, m.titulo, m.detalhe, m.desenvolvedor_id, m.projeto_id, m.periodo_inicio, m.periodo_fim,
              m.concluida, m.concluida_em,
              COALESCE(d.NOME_USUARIO_COMPLETO, d.NOME_USU) AS desenvolvedor_nome,
              p.nome AS projeto_nome,
              COALESCE(c.NOME_USUARIO_COMPLETO, c.NOME_USU) AS concluida_por_nome
         FROM meta_desenvolvimento m
         LEFT JOIN usuario d ON d.COD_USU = m.desenvolvedor_id
         LEFT JOIN usuario c ON c.COD_USU = m.concluida_por
         LEFT JOIN cadastro_projetos p ON p.id = m.projeto_id
        ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
        ORDER BY m.concluida, m.periodo_fim, m.id`,
      ...valores,
    )

    const metas = linhas.map(paraMeta)
    const concluidas = metas.filter((m) => m.concluida).length
    return {
      data: metas,
      resumo: {
        total: metas.length,
        concluidas,
        pendentes: metas.length - concluidas,
        // Percentual atingido no período — sem meta nenhuma o número não existe, e mostrar 0%
        // faria parecer que a equipe falhou quando na verdade ninguém definiu objetivo.
        percentual: metas.length ? Math.round((concluidas / metas.length) * 100) : null,
      },
    }
  })

  app.post('/', { preHandler: authMiddleware, schema: { tags: ['Metas do Dev'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0)
    const titulo = String(b.titulo ?? '').trim().slice(0, 200)
    if (!titulo) return reply.status(400).send({ error: 'Descreva a meta.' })
    if (!b.periodoInicio || !b.periodoFim) return reply.status(400).send({ error: 'Informe o período da meta.' })
    if (String(b.periodoFim) < String(b.periodoInicio)) {
      return reply.status(400).send({ error: 'O fim do período não pode ser antes do início.' })
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO meta_desenvolvimento (titulo, detalhe, desenvolvedor_id, projeto_id, periodo_inicio, periodo_fim, criada_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      titulo,
      String(b.detalhe ?? '').trim().slice(0, 1000) || null,
      b.desenvolvedorId ? Number(b.desenvolvedorId) : null,
      b.projetoId ? Number(b.projetoId) : null,
      String(b.periodoInicio),
      String(b.periodoFim),
      usuarioId || null,
    )
    const novo = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT LAST_INSERT_ID() AS id`)
    const id = Number(novo[0]?.id ?? 0)

    await registrarAuditoria({
      tabela: 'meta_desenvolvimento',
      registroId: id,
      acao: 'CRIACAO',
      usuarioId,
      dadosDepois: { titulo, periodoInicio: b.periodoInicio, periodoFim: b.periodoFim, desenvolvedorId: b.desenvolvedorId ?? null },
    })
    return reply.status(201).send({ ok: true, id })
  })

  app.put('/:id', { preHandler: authMiddleware, schema: { tags: ['Metas do Dev'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const usuarioId = Number((request.user as any)?.id || 0)
    const titulo = String(b.titulo ?? '').trim().slice(0, 200)
    if (!titulo) return reply.status(400).send({ error: 'Descreva a meta.' })

    const antes = await prisma.$queryRawUnsafe<LinhaMeta[]>(
      `SELECT * FROM meta_desenvolvimento WHERE id = ?`, Number(id),
    )
    if (!antes.length) return reply.status(404).send({ error: 'Meta não encontrada.' })

    await prisma.$executeRawUnsafe(
      `UPDATE meta_desenvolvimento SET titulo=?, detalhe=?, desenvolvedor_id=?, projeto_id=?, periodo_inicio=?, periodo_fim=? WHERE id=?`,
      titulo,
      String(b.detalhe ?? '').trim().slice(0, 1000) || null,
      b.desenvolvedorId ? Number(b.desenvolvedorId) : null,
      b.projetoId ? Number(b.projetoId) : null,
      String(b.periodoInicio),
      String(b.periodoFim),
      Number(id),
    )
    await registrarAuditoria({
      tabela: 'meta_desenvolvimento',
      registroId: Number(id),
      acao: 'ALTERACAO',
      usuarioId,
      dadosAntes: { titulo: antes[0].titulo },
      dadosDepois: { titulo },
    })
    return { ok: true }
  })

  // PATCH /metas-dev/:id/concluir — marcar e desmarcar o item da lista
  app.patch('/:id/concluir', { preHandler: authMiddleware, schema: { tags: ['Metas do Dev'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { concluida } = request.body as { concluida?: boolean }
    const usuarioId = Number((request.user as any)?.id || 0)

    const atual = await prisma.$queryRawUnsafe<Array<{ concluida: number; titulo: string }>>(
      `SELECT concluida, titulo FROM meta_desenvolvimento WHERE id = ?`, Number(id),
    )
    if (!atual.length) return reply.status(404).send({ error: 'Meta não encontrada.' })

    const marcar = !!concluida
    await prisma.$executeRawUnsafe(
      `UPDATE meta_desenvolvimento SET concluida=?, concluida_em=?, concluida_por=? WHERE id=?`,
      marcar ? 1 : 0,
      marcar ? new Date() : null,
      marcar ? usuarioId || null : null,
      Number(id),
    )
    await registrarAuditoria({
      tabela: 'meta_desenvolvimento',
      registroId: Number(id),
      acao: 'STATUS',
      usuarioId,
      dadosAntes: { concluida: Number(atual[0].concluida) === 1 },
      dadosDepois: { concluida: marcar, titulo: atual[0].titulo },
    })
    return { ok: true, concluida: marcar }
  })

  app.delete('/:id', { preHandler: authMiddleware, schema: { tags: ['Metas do Dev'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuarioId = Number((request.user as any)?.id || 0)
    const atual = await prisma.$queryRawUnsafe<Array<{ titulo: string }>>(
      `SELECT titulo FROM meta_desenvolvimento WHERE id = ?`, Number(id),
    )
    if (!atual.length) return reply.status(404).send({ error: 'Meta não encontrada.' })

    await prisma.$executeRawUnsafe(`DELETE FROM meta_desenvolvimento WHERE id = ?`, Number(id))
    await registrarAuditoria({
      tabela: 'meta_desenvolvimento',
      registroId: Number(id),
      acao: 'EXCLUSAO',
      usuarioId,
      dadosAntes: { titulo: atual[0].titulo },
    })
    return { ok: true }
  })
}
