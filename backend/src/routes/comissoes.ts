import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { listarPlanos, apurar, fechar, reabrir } from '../utils/comissoes'

/** Plano de remuneração comercial: planos, faixas, vendedores e apuração mensal. */
export async function comissoesRoutes(app: FastifyInstance) {
  app.get('/planos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () =>
    listarPlanos())

  app.put('/planos/:id', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>
    const nome = String(b.nome ?? '').trim()
    if (!nome) return reply.status(400).send({ error: 'Informe o nome do plano.' })
    if (!['vencimento', 'processo'].includes(String(b.baseCalculo))) {
      return reply.status(400).send({ error: 'Base de cálculo inválida.' })
    }
    await prisma.$executeRawUnsafe(
      `UPDATE comissao_plano SET nome=?, descricao=?, base_calculo=?, fixo_inicial=?,
         fixo_efetivo=?, meses_fase_inicial=?, meta_referencia=?, ativo=? WHERE id=?`,
      nome, String(b.descricao ?? '') || null, String(b.baseCalculo),
      Number(b.fixoInicial) || 0, Number(b.fixoEfetivo) || 0,
      Number(b.mesesFaseInicial) || 0, Number(b.metaReferencia) || 0,
      b.ativo === false ? 0 : 1, Number(id),
    )

    // As faixas vêm inteiras: substituir é mais previsível do que casar linha a linha.
    if (Array.isArray(b.faixas)) {
      const validas = b.faixas
        .map((f: any) => ({ valorDe: Number(f.valorDe), percentual: Number(f.percentual) }))
        .filter((f: any) => Number.isFinite(f.valorDe) && Number.isFinite(f.percentual) && f.valorDe >= 0)
      await prisma.$executeRawUnsafe(`DELETE FROM comissao_faixa WHERE plano_id = ?`, Number(id))
      for (const f of validas) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO comissao_faixa (plano_id, valor_de, percentual) VALUES (?,?,?)`,
          Number(id), f.valorDe, f.percentual,
        )
      }
    }
    return { ok: true }
  })

  app.get('/vendedores', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT v.*, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, p.nome AS plano_nome
         FROM comissao_vendedor v
         LEFT JOIN usuario u ON u.COD_USU = v.usuario_id
         LEFT JOIN comissao_plano p ON p.id = v.plano_id
        ORDER BY v.ativo DESC, nome`)
    return linhas.map((v) => ({
      id: Number(v.id),
      usuarioId: Number(v.usuario_id),
      nome: v.nome ?? `Usuário ${v.usuario_id}`,
      planoId: Number(v.plano_id),
      planoNome: v.plano_nome ?? null,
      dataAdmissao: v.data_admissao ? String(v.data_admissao).slice(0, 10) : null,
      fixoPersonalizado: v.fixo_personalizado == null ? null : Number(v.fixo_personalizado),
      metaIndividual: v.meta_individual == null ? null : Number(v.meta_individual),
      ativo: !!v.ativo,
    }))
  })

  app.post('/vendedores', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const usuarioId = Number(b.usuarioId)
    const planoId = Number(b.planoId)
    if (!usuarioId || !planoId) return reply.status(400).send({ error: 'Informe o usuário e o plano.' })
    await prisma.$executeRawUnsafe(
      `INSERT INTO comissao_vendedor
         (usuario_id, plano_id, data_admissao, fixo_personalizado, meta_individual, ativo)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE plano_id=VALUES(plano_id), data_admissao=VALUES(data_admissao),
         fixo_personalizado=VALUES(fixo_personalizado), meta_individual=VALUES(meta_individual),
         ativo=VALUES(ativo)`,
      usuarioId, planoId, b.dataAdmissao || null,
      b.fixoPersonalizado === '' || b.fixoPersonalizado == null ? null : Number(b.fixoPersonalizado),
      b.metaIndividual === '' || b.metaIndividual == null ? null : Number(b.metaIndividual),
      b.ativo === false ? 0 : 1,
    )
    return reply.status(201).send({ ok: true })
  })

  app.delete('/vendedores/:usuarioId', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const { usuarioId } = request.params as { usuarioId: string }
    await prisma.$executeRawUnsafe(`DELETE FROM comissao_vendedor WHERE usuario_id = ?`, Number(usuarioId))
    return { ok: true }
  })

  // Candidatos: quem já aparece como vendedor em processos de implantação.
  app.get('/candidatos', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.COD_USU AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome,
              COUNT(c.id_processo) AS processos
         FROM usuario u
         LEFT JOIN processo_implantacao_comercial c ON c.id_usu_vendedor = u.COD_USU
        GROUP BY u.COD_USU, nome
        HAVING processos > 0
        ORDER BY processos DESC`)
    return linhas.map((u) => ({
      id: Number(u.id), nome: u.nome, processos: Number(u.processos ?? 0),
    }))
  })

  app.get('/apuracao', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { competencia } = request.query as { competencia?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    try {
      const linhas = await apurar(comp)
      return {
        competencia: comp,
        linhas,
        totais: {
          base: linhas.reduce((s, l) => s + l.base, 0),
          variavel: linhas.reduce((s, l) => s + l.variavel, 0),
          fixo: linhas.reduce((s, l) => s + l.fixo, 0),
          total: linhas.reduce((s, l) => s + l.total, 0),
        },
      }
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
  })

  app.post('/apuracao/fechar', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const b = request.body as { competencia: string; usuarioId?: number }
    const quem = (request as any).user?.id ?? null
    return fechar(b.competencia, b.usuarioId ?? null, quem ? Number(quem) : null)
  })

  app.post('/apuracao/reabrir', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const b = request.body as { competencia: string; usuarioId: number }
    return reabrir(b.competencia, Number(b.usuarioId))
  })
}
