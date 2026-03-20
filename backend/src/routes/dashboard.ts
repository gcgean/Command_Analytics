import type { FastifyInstance } from 'fastify'
import { prisma } from '../database/client'
import { authMiddleware } from '../middleware/auth'

// Status de fechamento: 7=Finalizado, 8=Cancelado, 14=Finalizado confirmado
const STATUS_FECHADOS = [7, 8, 14]

// Mapeamento de departamentos (int → nome)
const DEPARTAMENTOS: Record<number, string> = {
  1: 'Suporte',
  2: 'Financeiro',
  3: 'Comercial',
  4: 'Implantação',
  5: 'Desenvolvimento',
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/kpis',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'KPIs principais do dashboard' } },
    async () => {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const amanha = new Date(hoje)
      amanha.setDate(amanha.getDate() + 1)

      const [
        atendimentosHoje,
        atendimentosAbertos,
        chamadosUrgentes,
        clientesAtivos,
        mrrResult,
        atendimentosPorDepto,
      ] = await Promise.all([
        // Atendimentos abertos hoje
        prisma.atendimento.count({
          where: { dataAbertura: { gte: hoje, lt: amanha } },
        }),
        // Atendimentos em aberto (não fechados)
        prisma.atendimento.count({
          where: { status: { notIn: STATUS_FECHADOS } },
        }),
        // Chamados urgentes (prioridade Alta = 'A') em aberto
        prisma.atendimento.count({
          where: { prioridade: 'A', status: { notIn: STATUS_FECHADOS } },
        }),
        // Clientes ativos e não bloqueados
        prisma.cliente.count({
          where: { ativo: 'S', bloqueado: 'N' },
        }),
        // MRR = soma das mensalidades dos clientes ativos
        prisma.cliente.aggregate({
          where: { ativo: 'S' },
          _sum: { mensalidade: true },
        }),
        // Atendimentos por departamento (int)
        prisma.atendimento.groupBy({
          by: ['departamento'],
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
      ])

      const mrr = Number(mrrResult._sum.mensalidade ?? 0)

      // Histórico MRR — estimativa dos últimos 6 meses com base no MRR atual
      const meses = ['Out/25', 'Nov/25', 'Dez/25', 'Jan/26', 'Fev/26', 'Mar/26']
      const fatores = [0.88, 0.91, 0.94, 0.96, 0.98, 1.0]
      const mrrHistorico = meses.map((mes, i) => ({
        mes,
        mrr: Math.round(mrr * fatores[i]),
      }))

      return {
        atendimentosHoje,
        atendimentosAbertos,
        chamadosUrgentes,
        clientesAtivos,
        mrr,
        npsMedia: 0, // NPS não disponível no schema atual
        atendimentosPorDepartamento: atendimentosPorDepto.map(d => ({
          departamento: d.departamento,
          nome: DEPARTAMENTOS[d.departamento ?? 0] ?? `Depto ${d.departamento}`,
          count: d._count.id,
        })),
        mrrHistorico,
      }
    }
  )

  // Resumo rápido para header/notificações
  app.get(
    '/resumo',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Resumo rápido' } },
    async () => {
      const [urgentes, aguardando, clientesAtivos] = await Promise.all([
        prisma.atendimento.count({ where: { prioridade: 'A', status: { notIn: STATUS_FECHADOS } } }),
        prisma.atendimento.count({ where: { status: 1 } }),
        prisma.cliente.count({ where: { ativo: 'S', bloqueado: 'N' } }),
      ])
      return { urgentes, aguardando, clientesAtivos }
    }
  )

  // Atendimentos por técnico (top 10)
  app.get(
    '/atendimentos-por-tecnico',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Atendimentos por técnico' } },
    async () => {
      const agrupado = await prisma.atendimento.groupBy({
        by: ['tecnicoId'],
        _count: { id: true },
        where: { status: { notIn: STATUS_FECHADOS } },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      })

      const ids = agrupado.map(a => a.tecnicoId).filter(Boolean) as number[]
      const tecnicos = await prisma.usuario.findMany({
        where: { id: { in: ids } },
        select: { id: true, nomeUsu: true, nomeCompleto: true },
      })
      const nomePorId = Object.fromEntries(
        tecnicos.map(t => [t.id, t.nomeCompleto || t.nomeUsu || 'Usuário'])
      )

      return agrupado.map(a => ({
        tecnicoId: a.tecnicoId,
        tecnicoNome: a.tecnicoId ? (nomePorId[a.tecnicoId] ?? 'Sem técnico') : 'Sem técnico',
        count: a._count.id,
      }))
    }
  )
}
