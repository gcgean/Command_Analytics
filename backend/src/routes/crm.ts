import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

const nomeUsuario = (u: any) => u?.nomeCompleto || u?.nomeUsu || 'Usuário'

export async function crmRoutes(app: FastifyInstance) {
  // ── Negócios ──────────────────────────────────────────────

  // Ordem real do funil. A coluna `etapa` tem o nome, mas `id_etapa` nem sempre
  // vem preenchido nos registros antigos — por isso o fallback pelo nome.
  const ORDEM_ETAPA: Record<string, number> = {
    'SEM CONTATO': 1, 'CONTATO FEITO': 2, 'ENVIO DE PROPOSTA': 3,
    'EM NEGOCIAÇÃO': 4, 'FECHAMENTO': 5, 'FECHADO': 6, 'PERDIDO': 7,
  }
  const ordemDe = (etapa: string | null, idEtapa: number | null) =>
    ORDEM_ETAPA[String(etapa ?? '').toUpperCase()] ?? idEtapa ?? 99

  /**
   * Filtros comuns do CRM. O que vale é a coluna `status`
   * (0 = em aberto, 1 = ganho, 2 = perdido) — a `etapa` não é confiável:
   * existem negócios ganhos parados em "SEM CONTATO".
   */
  function filtros(q: Record<string, string>) {
    const cond: string[] = []
    const val: any[] = []
    if (q.funil) { cond.push('funil = ?'); val.push(q.funil) }
    if (q.vendedor) { cond.push('usuario = ?'); val.push(q.vendedor) }
    if (q.etapa) { cond.push('etapa = ?'); val.push(q.etapa) }
    if (q.situacao === 'aberto') cond.push('status = 0')
    if (q.situacao === 'ganho') cond.push('status = 1')
    if (q.situacao === 'perdido') cond.push('status = 2')
    if (q.inicio) { cond.push('DATE(data_hora_inicio) >= ?'); val.push(q.inicio) }
    if (q.fim) { cond.push('DATE(data_hora_inicio) <= ?'); val.push(q.fim) }
    if (q.busca) {
      cond.push('(titulo LIKE ? OR usuario LIKE ? OR descricao LIKE ?)')
      const termo = `%${q.busca}%`
      val.push(termo, termo, termo)
    }
    return { onde: cond.length ? `WHERE ${cond.join(' AND ')}` : '', val }
  }

  // GET /crm/painel — tudo que o gestor vê de cara, já somado no banco
  app.get('/painel', { preHandler: authMiddleware, schema: { tags: ['CRM'], summary: 'Painel gerencial do funil' } }, async (request) => {
    const q = request.query as Record<string, string>
    const { onde, val } = filtros(q)

    const [resumo] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) total, SUM(status = 0) abertos, SUM(status = 1) ganhos, SUM(status = 2) perdidos
         FROM negocios ${onde}`, ...val)

    const etapas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT etapa, MIN(id_etapa) id_etapa, COUNT(*) q
         FROM negocios ${onde ? `${onde} AND status = 0` : 'WHERE status = 0'}
        GROUP BY etapa`, ...val)

    const vendedores = await prisma.$queryRawUnsafe<any[]>(
      `SELECT usuario vendedor, COUNT(*) q, SUM(status = 1) ganhos, SUM(status = 2) perdidos, SUM(status = 0) abertos
         FROM negocios ${onde ? `${onde} AND usuario <> ''` : "WHERE usuario <> ''"}
        GROUP BY usuario ORDER BY ganhos DESC, q DESC`, ...val)

    // Últimos 12 meses pela data de fechamento, para enxergar a tendência.
    const evolucao = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE_FORMAT(COALESCE(data_hora_ganho, data_hora_perdido), '%Y-%m') mes,
              SUM(status = 1) ganhos, SUM(status = 2) perdidos
         FROM negocios
        ${onde ? `${onde} AND` : 'WHERE'} status IN (1, 2)
          AND COALESCE(data_hora_ganho, data_hora_perdido) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY mes ORDER BY mes`, ...val)

    const motivosPerda = await prisma.$queryRawUnsafe<any[]>(
      `SELECT motivo_perda motivo, COUNT(*) q
         FROM negocios ${onde ? `${onde} AND` : 'WHERE'} status = 2 AND motivo_perda <> ''
        GROUP BY motivo_perda ORDER BY q DESC LIMIT 10`, ...val)

    const funis = await prisma.$queryRawUnsafe<any[]>(
      `SELECT funil, COUNT(*) q FROM negocios WHERE funil <> '' GROUP BY funil ORDER BY q DESC`)
    const listaVendedores = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT usuario FROM negocios WHERE usuario <> '' ORDER BY usuario`)

    const ganhos = Number(resumo?.ganhos ?? 0)
    const perdidos = Number(resumo?.perdidos ?? 0)
    const fechados = ganhos + perdidos

    return {
      resumo: {
        total: Number(resumo?.total ?? 0),
        abertos: Number(resumo?.abertos ?? 0),
        ganhos,
        perdidos,
        // Só faz sentido medir sobre o que já foi decidido.
        taxaConversao: fechados ? (ganhos / fechados) * 100 : null,
      },
      etapas: etapas
        .map((e) => ({ etapa: e.etapa || 'Sem etapa', quantidade: Number(e.q ?? 0), ordem: ordemDe(e.etapa, e.id_etapa) }))
        .sort((a, b) => a.ordem - b.ordem),
      vendedores: vendedores.map((v) => ({
        vendedor: v.vendedor,
        negocios: Number(v.q ?? 0),
        abertos: Number(v.abertos ?? 0),
        ganhos: Number(v.ganhos ?? 0),
        perdidos: Number(v.perdidos ?? 0),
      })),
      evolucao: evolucao.map((e) => ({
        mes: e.mes, ganhos: Number(e.ganhos ?? 0), perdidos: Number(e.perdidos ?? 0),
      })),
      motivosPerda: motivosPerda.map((m) => ({ motivo: m.motivo, quantidade: Number(m.q ?? 0) })),
      opcoes: {
        funis: funis.map((f) => ({ funil: f.funil, quantidade: Number(f.q ?? 0) })),
        vendedores: listaVendedores.map((v) => v.usuario as string),
        etapas: Object.keys(ORDEM_ETAPA),
      },
    }
  })

  // GET /crm/negocios — lista filtrada e paginada
  app.get('/negocios', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const q = request.query as Record<string, string>
    const { onde, val } = filtros(q)
    const limite = Math.min(Number(q.limite || 100), 500)
    const pagina = Math.max(Number(q.pagina || 1), 1)

    const [cont] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) q FROM negocios ${onde}`, ...val)
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, titulo, usuario, etapa, id_etapa, funil, status, descricao, motivo_perda,
              id_cli, data_hora_inicio, data_hora_ganho, data_hora_perdido
         FROM negocios ${onde}
        ORDER BY COALESCE(data_hora_ganho, data_hora_perdido, data_hora_inicio) DESC, id DESC
        LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, ...val)

    return {
      total: Number(cont?.q ?? 0),
      pagina,
      limite,
      itens: linhas.map((l) => ({
        id: Number(l.id),
        titulo: l.titulo || `Negócio #${l.id}`,
        vendedor: l.usuario || null,
        etapa: l.etapa || null,
        funil: l.funil || null,
        status: Number(l.status ?? 0),
        descricao: l.descricao || null,
        motivoPerda: l.motivo_perda || null,
        clienteId: l.id_cli ?? null,
        criadoEm: l.data_hora_inicio,
        ganhoEm: l.data_hora_ganho,
        perdidoEm: l.data_hora_perdido,
      })),
    }
  })

  // GET /crm/negocios/:id
  app.get('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const negocio = await prisma.negocio.findUnique({
      where: { id: Number(id) },
      include: {
        responsavel: { select: { id: true, nomeUsu: true, nomeCompleto: true } },
      },
    })
    if (!negocio) return reply.status(404).send({ error: 'Negócio não encontrado.' })
    const { responsavel, ...rest } = negocio
    return { ...rest, responsavelNome: nomeUsuario(responsavel) }
  })

  // POST /crm/negocios
  app.post('/negocios', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataCriacao) body.dataCriacao = new Date()
    const item = await prisma.negocio.create({ data: body as never })
    return reply.status(201).send(item)
  })

  // PUT /crm/negocios/:id
  app.put('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.negocio.update({ where: { id: Number(id) }, data: body as never })
  })

  // PATCH /crm/negocios/:id/status
  app.patch('/negocios/:id/status', { preHandler: authMiddleware, schema: { tags: ['CRM'], summary: 'Atualizar status do negócio' } }, async (request) => {
    const { id } = request.params as { id: string }
    const { status, dataFechamento } = request.body as { status: number; dataFechamento?: string }
    const data: Record<string, any> = { status }
    if (dataFechamento) data.dataFechamento = new Date(dataFechamento)
    return prisma.negocio.update({ where: { id: Number(id) }, data })
  })

  // DELETE /crm/negocios/:id
  app.delete('/negocios/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.negocio.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── Leads ─────────────────────────────────────────────────

  // GET /crm/leads
  app.get('/leads', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { segmento, cidade, search } = request.query as Record<string, string>

    return prisma.lead.findMany({
      where: {
        ...(segmento && { segmento }),
        ...(cidade && { cidade }),
        ...(search && {
          OR: [
            { nome: { contains: search } },
            { empresa: { contains: search } },
          ],
        }),
      },
      orderBy: { dataCadastro: 'desc' },
    })
  })

  // GET /crm/leads/:id
  app.get('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const lead = await prisma.lead.findUnique({ where: { id: Number(id) } })
    if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' })
    return lead
  })

  // POST /crm/leads
  app.post('/leads', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (!body.dataCadastro) body.dataCadastro = new Date()
    const lead = await prisma.lead.create({ data: body as never })
    return reply.status(201).send(lead)
  })

  // PUT /crm/leads/:id
  app.put('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    return prisma.lead.update({ where: { id: Number(id) }, data: body as never })
  })

  // DELETE /crm/leads/:id
  app.delete('/leads/:id', { preHandler: authMiddleware, schema: { tags: ['CRM'] } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.lead.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })

  // ── KPIs CRM ──────────────────────────────────────────────

  // GET /crm/resumo
  app.get('/resumo', { preHandler: authMiddleware, schema: { tags: ['CRM'], summary: 'Resumo CRM' } }, async () => {
    const [totalNegocios, totalLeads, negociosAbertos, negociosFechados] = await Promise.all([
      prisma.negocio.count(),
      prisma.lead.count(),
      prisma.negocio.count({ where: { status: { notIn: [2, 3] } } }), // assumindo 2=ganho, 3=perdido
      prisma.negocio.count({ where: { status: { in: [2, 3] } } }),
    ])
    return { totalNegocios, totalLeads, negociosAbertos, negociosFechados }
  })
}
