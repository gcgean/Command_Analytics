import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'
import { sincronizarCrm, obterConfigCrm, vendedorDoDocumento } from '../utils/crmSync'

/** Consulta e configuração da integração com o CRM Cilos. */
export async function crmIntegracaoRoutes(app: FastifyInstance) {
  app.get('/config', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async () => {
    const config = await obterConfigCrm()
    const [tot] = await prisma.$queryRawUnsafe<any[]>(`
      SELECT (SELECT COUNT(*) FROM crm_cliente) AS clientes,
             (SELECT COUNT(*) FROM crm_negocio) AS negocios,
             (SELECT COUNT(*) FROM crm_negocio WHERE status = 'won') AS ganhos,
             (SELECT COUNT(DISTINCT vendedor_nome) FROM crm_negocio WHERE vendedor_nome IS NOT NULL) AS vendedores`)
    const [l] = await prisma.$queryRawUnsafe<any[]>(`SELECT ultima_sync, ultimo_erro FROM crm_config ORDER BY id LIMIT 1`)
    return {
      baseUrl: config?.baseUrl ?? '',
      email: config?.email ?? '',
      // Senha e token nunca voltam pra tela.
      temSenha: !!config?.senha,
      companyId: config?.companyId ?? null,
      ativo: config?.ativo ?? false,
      ultimaSync: l?.ultima_sync ?? null,
      ultimoErro: l?.ultimo_erro ?? null,
      totais: {
        clientes: Number(tot?.clientes ?? 0),
        negocios: Number(tot?.negocios ?? 0),
        ganhos: Number(tot?.ganhos ?? 0),
        vendedores: Number(tot?.vendedores ?? 0),
      },
    }
  })

  app.put('/config', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const b = request.body as Record<string, any>
    const baseUrl = String(b.baseUrl ?? '').trim().replace(/\/$/, '')
    if (!/^https?:\/\//.test(baseUrl)) return reply.status(400).send({ error: 'Informe a URL do CRM.' })

    const senha = String(b.senha ?? '').trim()
    // Senha em branco mantém a atual. Trocar e-mail ou senha invalida o token guardado.
    if (senha) {
      await prisma.$executeRawUnsafe(
        `UPDATE crm_config SET base_url=?, email=?, senha=?, ativo=?, token=NULL, token_expira=NULL ORDER BY id LIMIT 1`,
        baseUrl, String(b.email ?? '').trim() || null, senha, b.ativo === false ? 0 : 1,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE crm_config SET base_url=?, email=?, ativo=? ORDER BY id LIMIT 1`,
        baseUrl, String(b.email ?? '').trim() || null, b.ativo === false ? 0 : 1,
      )
    }
    return { ok: true }
  })

  app.post('/sincronizar', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { completa } = request.body as { completa?: boolean }
    // Carga completa busca 10 anos; a incremental, os últimos 60 dias.
    return sincronizarCrm({ diasJanela: completa ? 3650 : 60 })
  })

  // GET /crm/vendedor?documento= — consulta usada pelas outras telas
  app.get('/vendedor', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { documento } = request.query as { documento?: string }
    const r = await vendedorDoDocumento(String(documento ?? ''))
    if (!r) return reply.status(404).send({ error: 'Nenhum vendedor encontrado para esse documento.' })
    return r
  })

  // GET /crm/negocios — consulta dos negócios, com filtro
  app.get('/negocios', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { busca, status, vendedor, limite } = request.query as Record<string, string>
    const condicoes: string[] = []
    const valores: any[] = []
    if (busca) {
      condicoes.push('(n.lead_nome LIKE ? OR n.titulo LIKE ? OR n.documento LIKE ?)')
      const t = `%${busca}%`
      valores.push(t, t, t.replace(/\D/g, '') ? `%${busca.replace(/\D/g, '')}%` : t)
    }
    if (status) { condicoes.push('n.status = ?'); valores.push(status) }
    if (vendedor) { condicoes.push('n.vendedor_nome = ?'); valores.push(vendedor) }

    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT n.*, (SELECT COUNT(*) FROM crm_negocio_item i WHERE i.negocio_id = n.id) AS itens
         FROM crm_negocio n
        ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
        ORDER BY COALESCE(n.finalizado_em, n.criado_em) DESC, n.id DESC
        LIMIT ${Math.min(Number(limite || 300), 1000)}`,
      ...valores,
    )
    return linhas.map((l) => ({
      id: Number(l.id),
      titulo: l.titulo,
      valor: Number(l.valor ?? 0),
      data: l.data,
      status: l.status,
      finalizadoEm: l.finalizado_em,
      leadNome: l.lead_nome,
      documento: l.documento,
      vendedorNome: l.vendedor_nome,
      etapa: l.etapa,
      motivoGanho: l.motivo_ganho,
      motivoPerda: l.motivo_perda,
      itens: Number(l.itens ?? 0),
      codCli: null,
    }))
  })

  // Resumo por vendedor — quem vendeu o quê, segundo o CRM
  app.get('/vendedores', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async () => {
    const linhas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT vendedor_nome AS vendedor,
             COUNT(*) AS negocios,
             SUM(status = 'won') AS ganhos,
             SUM(status = 'lost') AS perdidos,
             COALESCE(SUM(CASE WHEN status = 'won' THEN valor ELSE 0 END), 0) AS valor_ganho
        FROM crm_negocio WHERE vendedor_nome IS NOT NULL
       GROUP BY vendedor_nome ORDER BY valor_ganho DESC`)
    return linhas.map((l) => ({
      vendedor: l.vendedor,
      negocios: Number(l.negocios ?? 0),
      ganhos: Number(l.ganhos ?? 0),
      perdidos: Number(l.perdidos ?? 0),
      valorGanho: Number(l.valor_ganho ?? 0),
    }))
  })
}
