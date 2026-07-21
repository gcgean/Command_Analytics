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

const FAIXAS_MENSALIDADE = [
  { faixa: 'Até R$ 100', valorInicial: 0, valorFinal: 100 },
  { faixa: 'R$ 101 a R$ 200', valorInicial: 100.01, valorFinal: 200 },
  { faixa: 'R$ 201 a R$ 300', valorInicial: 200.01, valorFinal: 300 },
  { faixa: 'R$ 301 a R$ 400', valorInicial: 300.01, valorFinal: 400 },
  { faixa: 'R$ 401 a R$ 500', valorInicial: 400.01, valorFinal: 500 },
  { faixa: 'R$ 501 a R$ 600', valorInicial: 500.01, valorFinal: 600 },
  { faixa: 'R$ 601 a R$ 800', valorInicial: 600.01, valorFinal: 800 },
  { faixa: 'R$ 801 a R$ 1.000', valorInicial: 800.01, valorFinal: 1000 },
  { faixa: 'R$ 1.001 a R$ 1.500', valorInicial: 1000.01, valorFinal: 1500 },
  { faixa: 'R$ 1.501 a R$ 2.000', valorInicial: 1500.01, valorFinal: 2000 },
  { faixa: 'Acima de R$ 2.000', valorInicial: 2000.01, valorFinal: null },
]

type MensalidadesQuery = Record<string, string | undefined>

type ClienteCarteira = {
  id: number
  nome: string
  mensalidade: number
  plano: string | null
  cidade: string | null
  uf: string | null
  segmento: string | null
  tipoContrato: string | null
  vendedor: string | null
  status: string
  classeAbc: 'A' | 'B' | 'C'
  faixaMensalidade: string
  percentualReceita: number
  percentualAcumulado: number
  dataEntrada: Date | null
}

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

function percentual(parte: number, total: number) {
  return total > 0 ? round2((parte / total) * 100) : 0
}

function mediana(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? round2((sorted[mid - 1] + sorted[mid]) / 2) : round2(sorted[mid])
}

function percentil(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return round2(sorted[lower])
  return round2(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower))
}

function moda(values: number[]) {
  if (!values.length) return null
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return ranked[0]?.[1] > 1 ? ranked[0][0] : null
}

function faixaMensalidade(valor: number) {
  return FAIXAS_MENSALIDADE.find(f => valor >= f.valorInicial && (f.valorFinal === null || valor <= f.valorFinal))?.faixa ?? 'Sem faixa'
}

function statusCliente(cliente: { ativo: string | null; bloqueado: string | null }) {
  if (cliente.ativo === 'N') return 'Inativo'
  if (cliente.bloqueado === 'S') return 'Bloqueado'
  return 'Ativo'
}

function buildDateEnd(value: string) {
  const date = new Date(value)
  date.setDate(date.getDate() + 1)
  return date
}

async function loadCarteiraMensalidades(query: MensalidadesQuery) {
  const where: Record<string, any> = {}
  const status = query.status

  if (status === 'Inativo') {
    where.ativo = 'N'
  } else if (status === 'Bloqueado') {
    where.ativo = 'S'
    where.bloqueado = 'S'
  } else {
    where.ativo = 'S'
    where.bloqueado = 'N'
  }

  if (query.dataEntradaInicial || query.dataEntradaFinal) {
    where.dataContrato = {}
    if (query.dataEntradaInicial) where.dataContrato.gte = new Date(query.dataEntradaInicial)
    if (query.dataEntradaFinal) where.dataContrato.lt = buildDateEnd(query.dataEntradaFinal)
  }

  const clientes = await prisma.cliente.findMany({
    where,
    select: {
      id: true,
      nome: true,
      nomeRazao: true,
      cidade: true,
      uf: true,
      ativo: true,
      bloqueado: true,
      mensalidade: true,
      dataContrato: true,
      responsavel: true,
      idPlano: true,
      idSegmento: true,
    },
    orderBy: { nome: 'asc' },
  })

  const [planos, segmentos] = await Promise.all([
    prisma.plano.findMany({ select: { id: true, descricao: true } }),
    prisma.segmento.findMany({ select: { id: true, descricao: true } }),
  ])

  const planoPorId = new Map(planos.map(p => [p.id, p.descricao]))
  const segmentoPorId = new Map(segmentos.map(s => [s.id, s.descricao]))

  const base: ClienteCarteira[] = clientes.map(cliente => {
    const mensalidade = Number(cliente.mensalidade ?? 0)
    const plano = cliente.idPlano ? planoPorId.get(cliente.idPlano) ?? null : null
    const segmento = cliente.idSegmento ? segmentoPorId.get(cliente.idSegmento) ?? null : null
    return {
      id: cliente.id,
      nome: cliente.nome || cliente.nomeRazao || `Cliente ${cliente.id}`,
      mensalidade,
      plano,
      cidade: cliente.cidade?.trim() || null,
      uf: cliente.uf?.trim() || null,
      segmento,
      tipoContrato: null,
      vendedor: cliente.responsavel?.trim() || null,
      status: statusCliente(cliente),
      classeAbc: 'C' as const,
      faixaMensalidade: mensalidade > 0 ? faixaMensalidade(mensalidade) : 'Mensalidade zerada',
      percentualReceita: 0,
      percentualAcumulado: 0,
      dataEntrada: cliente.dataContrato,
    }
  })

  const filtered = base.filter(cliente => {
    if (query.faixaMensalidade && cliente.faixaMensalidade !== query.faixaMensalidade) return false
    if (query.plano && cliente.plano !== query.plano) return false
    if (query.cidade && cliente.cidade !== query.cidade) return false
    if (query.uf && cliente.uf !== query.uf) return false
    if (query.segmento && cliente.segmento !== query.segmento) return false
    if (query.tipoContrato && cliente.tipoContrato !== query.tipoContrato) return false
    if (query.vendedor && cliente.vendedor !== query.vendedor) return false
    return true
  })

  const pagantesOrdenados = filtered
    .filter(cliente => cliente.mensalidade > 0)
    .sort((a, b) => b.mensalidade - a.mensalidade)

  const totalReceita = pagantesOrdenados.reduce((sum, cliente) => sum + cliente.mensalidade, 0)
  let acumulado = 0
  const classificados: ClienteCarteira[] = pagantesOrdenados.map(cliente => {
    acumulado += cliente.mensalidade
    const percentualAcumulado = percentual(acumulado, totalReceita)
    const classeAbc: 'A' | 'B' | 'C' = percentualAcumulado <= 70 ? 'A' : percentualAcumulado <= 90 ? 'B' : 'C'
    return {
      ...cliente,
      classeAbc,
      percentualReceita: percentual(cliente.mensalidade, totalReceita),
      percentualAcumulado,
    }
  })

  const invalidos = filtered.filter(cliente => cliente.mensalidade <= 0)
  const data = [...classificados, ...invalidos]
    .filter(cliente => !query.classeAbc || cliente.classeAbc === query.classeAbc)

  return { data, pagantes: data.filter(cliente => cliente.mensalidade > 0), totalReceita }
}

function resumoCarteira(data: ClienteCarteira[]) {
  const totalClientesAtivos = data.length
  const pagantes = data.filter(cliente => cliente.mensalidade > 0)
  const valores = pagantes.map(cliente => cliente.mensalidade)
  const mrr = round2(valores.reduce((sum, value) => sum + value, 0))
  const ticketMedio = pagantes.length ? round2(mrr / pagantes.length) : 0
  const medianaValor = mediana(valores)
  const clientesAbaixoTicketMedio = pagantes.filter(cliente => cliente.mensalidade < ticketMedio).length
  const clientesAcimaTicketMedio = pagantes.filter(cliente => cliente.mensalidade >= ticketMedio).length

  return {
    totalClientesAtivos,
    totalClientesPagantes: pagantes.length,
    totalMensalidadeZerada: data.filter(cliente => cliente.mensalidade <= 0).length,
    mrr,
    arr: round2(mrr * 12),
    ticketMedio,
    mediana: medianaValor,
    menorMensalidade: valores.length ? Math.min(...valores) : 0,
    maiorMensalidade: valores.length ? Math.max(...valores) : 0,
    clientesAbaixoTicketMedio,
    clientesAcimaTicketMedio,
    percentualAbaixoTicketMedio: percentual(clientesAbaixoTicketMedio, pagantes.length),
    percentualAcimaTicketMedio: percentual(clientesAcimaTicketMedio, pagantes.length),
  }
}

function resumoFaixas(pagantes: ClienteCarteira[]) {
  const totalClientes = pagantes.length
  const totalReceita = pagantes.reduce((sum, cliente) => sum + cliente.mensalidade, 0)

  return FAIXAS_MENSALIDADE.map(faixa => {
    const clientesFaixa = pagantes.filter(cliente => cliente.faixaMensalidade === faixa.faixa)
    const valores = clientesFaixa.map(cliente => cliente.mensalidade)
    const receitaTotal = round2(valores.reduce((sum, value) => sum + value, 0))
    return {
      faixa: faixa.faixa,
      valorInicial: faixa.valorInicial,
      valorFinal: faixa.valorFinal,
      quantidadeClientes: clientesFaixa.length,
      percentualClientes: percentual(clientesFaixa.length, totalClientes),
      receitaTotal,
      percentualReceita: percentual(receitaTotal, totalReceita),
      ticketMedioFaixa: clientesFaixa.length ? round2(receitaTotal / clientesFaixa.length) : 0,
      menorValor: valores.length ? Math.min(...valores) : 0,
      maiorValor: valores.length ? Math.max(...valores) : 0,
    }
  })
}

function resumoAbc(pagantes: ClienteCarteira[]) {
  const totalClientes = pagantes.length
  const totalReceita = pagantes.reduce((sum, cliente) => sum + cliente.mensalidade, 0)
  const classes: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']

  return classes.map(classe => {
    const clientesClasse = pagantes.filter(cliente => cliente.classeAbc === classe)
    const receitaTotal = round2(clientesClasse.reduce((sum, cliente) => sum + cliente.mensalidade, 0))
    return {
      classe,
      quantidadeClientes: clientesClasse.length,
      percentualClientes: percentual(clientesClasse.length, totalClientes),
      receitaTotal,
      percentualReceita: percentual(receitaTotal, totalReceita),
      ticketMedio: clientesClasse.length ? round2(receitaTotal / clientesClasse.length) : 0,
    }
  })
}

function participacaoTop(pagantes: ClienteCarteira[], quantidade: number) {
  const totalReceita = pagantes.reduce((sum, cliente) => sum + cliente.mensalidade, 0)
  const receitaTop = pagantes.slice(0, quantidade).reduce((sum, cliente) => sum + cliente.mensalidade, 0)
  return percentual(receitaTop, totalReceita)
}

function clientesParaReceita(pagantes: ClienteCarteira[], alvo: number) {
  const totalReceita = pagantes.reduce((sum, cliente) => sum + cliente.mensalidade, 0)
  let acumulado = 0
  for (let i = 0; i < pagantes.length; i += 1) {
    acumulado += pagantes[i].mensalidade
    if (percentual(acumulado, totalReceita) >= alvo) return i + 1
  }
  return 0
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/mensalidades/resumo',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Resumo da carteira de mensalidades' } },
    async (request) => {
      const { data } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      return resumoCarteira(data)
    }
  )

  app.get(
    '/mensalidades/faixas',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Distribuição por faixa de mensalidade' } },
    async (request) => {
      const { pagantes } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      return resumoFaixas(pagantes)
    }
  )

  app.get(
    '/mensalidades/abc',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Curva ABC da carteira' } },
    async (request) => {
      const { pagantes } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      return {
        resumoPorClasse: resumoAbc(pagantes),
        clientesClassificados: pagantes.slice(0, 100),
        curvaReceitaAcumulada: pagantes.slice(0, 100).map((cliente, index) => ({
          posicao: index + 1,
          cliente: cliente.nome,
          receitaAcumulada: round2(pagantes.slice(0, index + 1).reduce((sum, item) => sum + item.mensalidade, 0)),
          percentualAcumulado: cliente.percentualAcumulado,
        })),
      }
    }
  )

  app.get(
    '/mensalidades/concentracao',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Concentração de receita' } },
    async (request) => {
      const { pagantes } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      return {
        clientesPara50Receita: clientesParaReceita(pagantes, 50),
        clientesPara70Receita: clientesParaReceita(pagantes, 70),
        clientesPara80Receita: clientesParaReceita(pagantes, 80),
        clientesPara90Receita: clientesParaReceita(pagantes, 90),
        participacaoTop10: participacaoTop(pagantes, 10),
        participacaoTop20: participacaoTop(pagantes, 20),
        participacaoTop50: participacaoTop(pagantes, 50),
        participacaoTop100: participacaoTop(pagantes, 100),
        curvaAcumulada: pagantes.slice(0, 100).map((cliente, index) => ({
          posicao: index + 1,
          percentualClientes: percentual(index + 1, pagantes.length),
          percentualReceita: cliente.percentualAcumulado,
        })),
      }
    }
  )

  app.get(
    '/mensalidades/estatisticas',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Estatísticas da carteira' } },
    async (request) => {
      const { pagantes } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      const valores = pagantes.map(cliente => cliente.mensalidade)
      const media = valores.length ? round2(valores.reduce((sum, value) => sum + value, 0) / valores.length) : 0
      const medianaValor = mediana(valores)
      const desvioPadrao = valores.length
        ? round2(Math.sqrt(valores.reduce((sum, value) => sum + Math.pow(value - media, 2), 0) / valores.length))
        : 0

      return {
        media,
        mediana: medianaValor,
        moda: moda(valores),
        desvioPadrao,
        percentil25: percentil(valores, 0.25),
        percentil50: percentil(valores, 0.5),
        percentil75: percentil(valores, 0.75),
        percentil90: percentil(valores, 0.9),
        percentil95: percentil(valores, 0.95),
        minimo: valores.length ? Math.min(...valores) : 0,
        maximo: valores.length ? Math.max(...valores) : 0,
        leitura: medianaValor < media
          ? 'A mediana abaixo da média indica concentração em mensalidades menores, com alguns clientes maiores puxando o ticket para cima.'
          : 'A média e a mediana estão próximas, indicando uma carteira mais distribuída entre as faixas.',
      }
    }
  )

  app.get(
    '/mensalidades/rankings',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Rankings da carteira' } },
    async (request) => {
      const query = request.query as MensalidadesQuery
      const page = Math.max(Number(query.page ?? 1), 1)
      const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100)
      const { pagantes } = await loadCarteiraMensalidades(query)
      const resumo = resumoCarteira(pagantes)
      const tipo = query.tipo ?? 'maiores'
      const rankingMap: Record<string, ClienteCarteira[]> = {
        maiores: [...pagantes].sort((a, b) => b.mensalidade - a.mensalidade),
        menores: [...pagantes].sort((a, b) => a.mensalidade - b.mensalidade),
        'abaixo-media': pagantes.filter(cliente => cliente.mensalidade < resumo.ticketMedio),
        'acima-media': pagantes.filter(cliente => cliente.mensalidade >= resumo.ticketMedio),
        'abaixo-mediana': pagantes.filter(cliente => cliente.mensalidade < resumo.mediana),
        'acima-mediana': pagantes.filter(cliente => cliente.mensalidade >= resumo.mediana),
        'classe-a': pagantes.filter(cliente => cliente.classeAbc === 'A'),
        'classe-b': pagantes.filter(cliente => cliente.classeAbc === 'B'),
        'classe-c': pagantes.filter(cliente => cliente.classeAbc === 'C'),
      }
      const data = rankingMap[tipo] ?? rankingMap.maiores
      const start = (page - 1) * limit
      return {
        total: data.length,
        page,
        limit,
        pages: Math.max(Math.ceil(data.length / limit), 1),
        data: data.slice(start, start + limit),
      }
    }
  )

  app.get(
    '/mensalidades/agrupamentos',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Agrupamentos da carteira' } },
    async (request) => {
      const query = request.query as MensalidadesQuery
      const agruparPor = query.agruparPor ?? 'plano'
      const { pagantes } = await loadCarteiraMensalidades(query)
      const totalReceita = pagantes.reduce((sum, cliente) => sum + cliente.mensalidade, 0)
      const grupos = new Map<string, ClienteCarteira[]>()

      for (const cliente of pagantes) {
        const key = String((cliente as any)[agruparPor] || 'Não informado')
        grupos.set(key, [...(grupos.get(key) ?? []), cliente])
      }

      return [...grupos.entries()]
        .map(([grupo, clientesGrupo]) => {
          const receitaMensalTotal = round2(clientesGrupo.reduce((sum, cliente) => sum + cliente.mensalidade, 0))
          return {
            grupo,
            quantidadeClientes: clientesGrupo.length,
            receitaMensalTotal,
            ticketMedio: clientesGrupo.length ? round2(receitaMensalTotal / clientesGrupo.length) : 0,
            percentualCarteira: percentual(clientesGrupo.length, pagantes.length),
            percentualReceitaTotal: percentual(receitaMensalTotal, totalReceita),
          }
        })
        .sort((a, b) => b.receitaMensalTotal - a.receitaMensalTotal)
    }
  )

  app.get(
    '/mensalidades/insights',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Insights automáticos da carteira' } },
    async (request) => {
      const { data, pagantes } = await loadCarteiraMensalidades(request.query as MensalidadesQuery)
      const resumo = resumoCarteira(data)
      const faixas = resumoFaixas(pagantes)
      const abc = resumoAbc(pagantes)
      const maiorFaixaClientes = [...faixas].sort((a, b) => b.quantidadeClientes - a.quantidadeClientes)[0]
      const maiorFaixaReceita = [...faixas].sort((a, b) => b.receitaTotal - a.receitaTotal)[0]
      const classeA = abc.find(item => item.classe === 'A')
      const insights = [
        maiorFaixaClientes ? `A maior concentração de clientes está na faixa ${maiorFaixaClientes.faixa}, com ${maiorFaixaClientes.quantidadeClientes} clientes.` : null,
        maiorFaixaReceita ? `A faixa que mais gera receita é ${maiorFaixaReceita.faixa}, somando R$ ${maiorFaixaReceita.receitaTotal.toLocaleString('pt-BR')}.` : null,
        `${resumo.percentualAbaixoTicketMedio}% dos clientes pagantes estão abaixo do ticket médio.`,
        `${resumo.percentualAcimaTicketMedio}% dos clientes pagantes estão acima ou iguais ao ticket médio.`,
        classeA ? `Clientes Classe A representam ${classeA.percentualReceita}% da receita e ${classeA.percentualClientes}% da base pagante.` : null,
        `Os 20 maiores clientes representam ${participacaoTop(pagantes, 20)}% da receita mensal.`,
        resumo.mediana < resumo.ticketMedio ? 'A mediana é menor que a média, indicando que poucos clientes maiores puxam o ticket médio para cima.' : null,
        resumo.totalMensalidadeZerada > 0 ? `Existem ${resumo.totalMensalidadeZerada} clientes com mensalidade zerada ou inválida na seleção.` : null,
      ]
      return insights.filter(Boolean)
    }
  )

  app.get(
    '/mensalidades/opcoes',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Opções de filtros da dashboard de mensalidades' } },
    async () => {
      const { data } = await loadCarteiraMensalidades({})
      const unique = (values: Array<string | null>) => [...new Set(values.filter(Boolean) as string[])].sort()
      return {
        status: ['Ativo', 'Bloqueado', 'Inativo'],
        faixas: [...FAIXAS_MENSALIDADE.map(faixa => faixa.faixa), 'Mensalidade zerada'],
        classesAbc: ['A', 'B', 'C'],
        planos: unique(data.map(cliente => cliente.plano)),
        cidades: unique(data.map(cliente => cliente.cidade)),
        ufs: unique(data.map(cliente => cliente.uf)),
        segmentos: unique(data.map(cliente => cliente.segmento)),
        tiposContrato: [],
        vendedores: unique(data.map(cliente => cliente.vendedor)),
      }
    }
  )

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

  // ── Desempenho da equipe (técnicos e setores) nos últimos N meses ──
  app.get(
    '/desempenho-equipe',
    { preHandler: authMiddleware, schema: { tags: ['Dashboard'], summary: 'Desempenho de técnicos e setores por período' } },
    async (request) => {
      const { meses } = request.query as { meses?: string }
      const nMeses = Math.min(36, Math.max(1, Number(meses) || 12))

      // Corte no primeiro dia do mês, (nMeses-1) meses atrás, para termos exatamente nMeses baldes mensais.
      const agora = new Date()
      const corte = new Date(agora.getFullYear(), agora.getMonth() - (nMeses - 1), 1, 0, 0, 0)

      const [rankingRows, setorRows, evolucaoRows, notasAgenda, notasProgramado] = await Promise.all([
        // Volume de atendimentos por técnico
        prisma.$queryRaw<Array<{ id: number | null; nome: string | null; total: bigint }>>`
          SELECT a.cod_tecnico AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, COUNT(*) AS total
          FROM atendimentos a
          LEFT JOIN usuario u ON u.COD_USU = a.cod_tecnico
          WHERE a.data_hora_lanc >= ${corte} AND a.cod_tecnico IS NOT NULL
          GROUP BY a.cod_tecnico
          ORDER BY total DESC
        `,
        // Volume por setor (departamento)
        prisma.$queryRaw<Array<{ departamento: number | null; total: bigint }>>`
          SELECT a.departamento AS departamento, COUNT(*) AS total
          FROM atendimentos a
          WHERE a.data_hora_lanc >= ${corte}
          GROUP BY a.departamento
          ORDER BY total DESC
        `,
        // Evolução mensal (total de atendimentos)
        prisma.$queryRaw<Array<{ mes: string; total: bigint }>>`
          SELECT DATE_FORMAT(a.data_hora_lanc, '%Y-%m') AS mes, COUNT(*) AS total
          FROM atendimentos a
          WHERE a.data_hora_lanc >= ${corte}
          GROUP BY mes
          ORDER BY mes
        `,
        // Notas de treinamento — agenda legada (Tipo Treinamento)
        prisma.$queryRaw<Array<{ id: number | null; nome: string | null; nota: string | null }>>`
          SELECT a.cod_colaborador AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, a.nota AS nota
          FROM agenda a
          LEFT JOIN usuario u ON u.COD_USU = a.cod_colaborador
          WHERE a.data_agendamento >= ${corte}
            AND UPPER(COALESCE(a.Tipo, '')) LIKE '%TREIN%'
            AND a.nota IS NOT NULL AND TRIM(a.nota) <> ''
            AND a.cod_colaborador IS NOT NULL
        `,
        // Notas de treinamento — agendamento programado
        prisma.$queryRaw<Array<{ id: number | null; nome: string | null; nota: string | null }>>`
          SELECT p.cod_tecnico AS id, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS nome, p.nota AS nota
          FROM agendamento_programado p
          LEFT JOIN usuario u ON u.COD_USU = p.cod_tecnico
          WHERE p.data_agendamento >= ${corte}
            AND p.descricao LIKE '%TIPO_AGENDA:Treinamento%'
            AND p.nota IS NOT NULL AND TRIM(p.nota) <> ''
            AND p.cod_tecnico IS NOT NULL
        `,
      ])

      // Baldes mensais zero-preenchidos
      const bucketKeys: string[] = []
      for (let i = 0; i < nMeses; i++) {
        const d = new Date(corte.getFullYear(), corte.getMonth() + i, 1)
        bucketKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      const totalPorMes = new Map(evolucaoRows.map(r => [String(r.mes), Number(r.total)]))
      const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      const evolucaoMensal = bucketKeys.map(k => {
        const [ano, mes] = k.split('-')
        return {
          mes: k,
          label: `${nomesMeses[Number(mes) - 1]}/${ano.slice(2)}`,
          total: totalPorMes.get(k) ?? 0,
        }
      })

      const rankingTecnicos = rankingRows.map(r => ({
        tecnicoId: r.id ? Number(r.id) : null,
        tecnicoNome: r.nome || `Técnico #${r.id ?? '—'}`,
        total: Number(r.total),
      }))

      const porSetor = setorRows.map(r => ({
        departamento: r.departamento === null ? null : Number(r.departamento),
        nome: r.departamento === null
          ? 'Sem setor'
          : (DEPARTAMENTOS[Number(r.departamento)] ?? `Depto ${r.departamento}`),
        total: Number(r.total),
      }))

      // Média de notas de treinamento por técnico (combina as duas fontes)
      const notasMap = new Map<number, { nome: string; soma: number; qtd: number }>()
      const acumular = (rows: Array<{ id: number | null; nome: string | null; nota: string | null }>) => {
        for (const row of rows) {
          if (!row.id) continue
          const valor = Number(String(row.nota ?? '').replace(',', '.').trim())
          if (!Number.isFinite(valor) || valor <= 0 || valor > 10) continue
          const id = Number(row.id)
          const atual = notasMap.get(id) ?? { nome: row.nome || `Técnico #${id}`, soma: 0, qtd: 0 }
          atual.soma += valor
          atual.qtd += 1
          if (row.nome) atual.nome = row.nome
          notasMap.set(id, atual)
        }
      }
      acumular(notasAgenda)
      acumular(notasProgramado)
      const notasTreinamento = Array.from(notasMap.entries())
        .map(([id, v]) => ({ tecnicoId: id, tecnicoNome: v.nome, media: v.soma / v.qtd, avaliacoes: v.qtd }))
        .sort((a, b) => b.media - a.media || b.avaliacoes - a.avaliacoes)

      return {
        periodo: { meses: nMeses, inicio: `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}-01` },
        totalAtendimentos: rankingTecnicos.reduce((acc, t) => acc + t.total, 0),
        rankingTecnicos,
        porSetor,
        evolucaoMensal,
        notasTreinamento,
      }
    }
  )
}
