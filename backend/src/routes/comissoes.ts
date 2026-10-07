import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { listarPlanos, apurar, fechar, reabrir } from '../utils/comissoes'
import { getUserPermissions } from './grupos'

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

  /**
   * "Meu desempenho": o que o próprio vendedor vê. Usa sempre o usuário do token — ninguém
   * consulta a comissão de outra pessoa por aqui, nem trocando o parâmetro.
   */
  app.get('/meu-desempenho', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request, reply) => {
    const { competencia, usuarioId } = request.query as { competencia?: string; usuarioId?: string }
    const comp = competencia || new Date().toISOString().slice(0, 7)
    const logado = Number((request.user as { id: number } | undefined)?.id ?? 0)
    if (!logado) return reply.status(401).send({ error: 'Sessão inválida.' })

    // Só quem administra a remuneração pode abrir o desempenho de outra pessoa. Para todos os
    // demais vale o usuário do token, mesmo que mandem usuarioId na query.
    const permissoes = await getUserPermissions(logado).catch(() => [] as string[])
    const gestor = permissoes.includes('*') || permissoes.includes('remuneracao-comercial')
    const pedido = Number(usuarioId ?? 0)
    if (pedido && pedido !== logado && !gestor) {
      return reply.status(403).send({ error: 'Você só pode ver o seu próprio desempenho.' })
    }
    const eu = gestor && pedido ? pedido : logado

    let linhas
    try {
      linhas = await apurar(comp)
    } catch (e: any) {
      return reply.status(400).send({ error: String(e?.message ?? e) })
    }
    const minha = linhas.find((l) => l.usuarioId === eu) ?? null

    // Os últimos 6 meses, para a pessoa ver a própria evolução e não só a foto do mês.
    const historico: Array<{ competencia: string; base: number; percentual: number; variavel: number; total: number }> = []
    const [ano, mes] = comp.split('-').map(Number)
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ano, mes - 1 - i, 1)
      const c = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const l = (await apurar(c)).find((x) => x.usuarioId === eu)
      historico.push({
        competencia: c,
        base: l?.base ?? 0,
        percentual: l?.percentual ?? 0,
        variavel: l?.variavel ?? 0,
        total: l?.total ?? 0,
      })
    }

    // Onde a pessoa está no ranking do mês, sem expor o número dos colegas.
    const ordenado = [...linhas].sort((a, b) => b.base - a.base)
    const posicao = ordenado.findIndex((l) => l.usuarioId === eu)

    const planos = await listarPlanos()
    const plano = planos.find((p) => p.id === minha?.planoId) ?? planos[0] ?? null

    // Para o gestor poder trocar de pessoa sem sair da tela.
    const equipe = gestor
      ? linhas.map((l) => ({ usuarioId: l.usuarioId, nome: l.nome }))
      : []

    return {
      competencia: comp,
      gestor,
      usuarioId: eu,
      equipe,
      vendedor: minha,
      // Sem vínculo com plano não há comissão a mostrar — a tela diz isso em vez de zerar tudo.
      semPlano: !minha,
      escada: plano?.faixas ?? [],
      ranking: posicao >= 0 ? { posicao: posicao + 1, total: ordenado.length } : null,
      historico,
    }
  })

  app.post('/apuracao/reabrir', { preHandler: authMiddleware, schema: { tags: ['Comissões'] } }, async (request) => {
    const b = request.body as { competencia: string; usuarioId: number }
    return reabrir(b.competencia, Number(b.usuarioId))
  })
}
