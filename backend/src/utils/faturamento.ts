import { prisma } from '../database/client'

/**
 * Normaliza a descrição bruta da adquirente/maquininha (vem de cada sincronização de POS,
 * então a mesma operadora aparece com dezenas de grafias diferentes — "CIELO", "CIELO S.A",
 * "CIELO S.A - INSTITUICAO DE PAGAMENTO"...) para o mesmo catálogo canônico usado no cadastro
 * de Maquininhas (src/utils/maquininhas.ts), assim os relatórios agrupam certo.
 */
export function normalizarOperadora(descricaoBruta: string | null | undefined): string {
  const d = String(descricaoBruta || '').toUpperCase()
  if (!d.trim()) return 'Não identificada'
  if (d.includes('CIELO')) return 'Cielo'
  if (d.includes('REDECARD') || d === 'REDE' || d.includes(' REDE ') || d.startsWith('REDE')) return 'Rede'
  if (d.includes('GETNET')) return 'GetNet'
  if (d.includes('STONE')) return 'Stone'
  if (d === 'TON' || d.includes(' TON ')) return 'Ton'
  if (d.includes('PAGSEGURO') || d.includes('PAGBANK') || d.includes('PAG SEGURO')) return 'PagBank (PagSeguro)'
  if (d.includes('MERCADO PAGO') || d.includes('MERCADOPAGO')) return 'Mercado Pago'
  if (d.includes('INFINITEPAY') || d.includes('INFINITE PAY') || d.includes('INFINITY PAY') || d.includes('CLOUDWALK')) return 'InfinitePay'
  if (d.includes('SUMUP')) return 'SumUp'
  if (d.includes('CORA')) return 'Turbo (Cora)'
  if (d.includes('AME DIGITAL') || d === 'AME') return 'Ame Digital'
  if (d.includes('PICPAY')) return 'PicPay'
  if (d.includes('SAFRAPAY') || d.includes('SAFRA PAY')) return 'SafraPay'
  if (d.includes('SICREDI')) return 'Sicredi'
  if (d.includes('SICOOB')) return 'Sicoob'
  if (d.includes('BANRISUL') || d.includes('VERO')) return 'Banrisul (Vero)'
  if (d.includes('BRADESCO') || d.includes('GLOBAL PAYMENTS')) return 'Bradesco (Global Payments)'
  if (d.includes('CAIXA ECONOMICA') || d.includes('CAIXA ECONÔMICA')) return 'Caixa Econômica'
  if (d.includes('BANCO DO BRASIL') || d === 'BB') return 'Banco do Brasil'
  if (d.includes('BIN') && !d.includes('BINANCE')) return 'Bin'
  if (d.includes('MODERNINHA')) return 'Stone' // "Moderninha" é a maquininha da Stone
  if (d.includes('AZULZINHA')) return 'Outra'
  if (d.includes('NOME DA OPERADORA')) return 'Não identificada' // valor placeholder do sistema legado
  return 'Outra'
}

function labelFormaPagamento(tipoFormaPagto: string, tipoCartao: string): string {
  // CD (legado) e CA+D (formato novo) representam a mesma coisa: cartão de débito.
  if (tipoFormaPagto === 'CD' || (tipoFormaPagto === 'CA' && tipoCartao === 'D')) return 'Cartão Débito'
  if (tipoFormaPagto === 'CA' && tipoCartao === 'C') return 'Cartão Crédito'
  return `${tipoFormaPagto}${tipoCartao ? ` (${tipoCartao})` : ''}`
}

export interface PeriodoFaturamento {
  mesInicio: number
  anoInicio: number
  mesFim: number
  anoFim: number
}

/** Último mês com dado sincronizado — usado como "fim" do período por padrão. */
export async function obterUltimoPeriodoDisponivel(): Promise<{ mes: number; ano: number }> {
  const rows = await prisma.$queryRaw<Array<{ ano: string; mes: string }>>`
    SELECT ano, mes FROM faturamento_cliente
    WHERE ano REGEXP '^[0-9]+$' AND mes REGEXP '^[0-9]+$'
    ORDER BY ano DESC, mes DESC LIMIT 1
  `
  if (!rows.length) {
    const agora = new Date()
    return { mes: agora.getMonth() + 1, ano: agora.getFullYear() }
  }
  return { mes: Number(rows[0].mes), ano: Number(rows[0].ano) }
}

export function calcularPeriodo(meses: number, fim: { mes: number; ano: number }): PeriodoFaturamento {
  const totalMesesFim = fim.ano * 12 + (fim.mes - 1)
  const totalMesesInicio = totalMesesFim - (meses - 1)
  return {
    mesInicio: (totalMesesInicio % 12) + 1,
    anoInicio: Math.floor(totalMesesInicio / 12),
    mesFim: fim.mes,
    anoFim: fim.ano,
  }
}

export interface AnaliseFaturamento {
  periodo: PeriodoFaturamento & { meses: number }
  geral: {
    faturamentoTotal: number
    clientesComFaturamento: number
    faturamentoMedioMensalPorCliente: number
    faturamentoMedioPorClienteNoPeriodo: number
    evolucaoMensal: Array<{ mes: string; total: number }>
  }
  porFormaPagamento: Array<{ forma: string; total: number; clientes: number; faturamentoMedioPorCliente: number; quantidade: number }>
  porMaquininha: Array<{ operadora: string; total: number; clientes: number; faturamentoMedioPorCliente: number }>
}

export async function gerarAnaliseFaturamento(meses: number): Promise<AnaliseFaturamento> {
  const ultimo = await obterUltimoPeriodoDisponivel()
  const periodo = calcularPeriodo(meses, ultimo)
  const chaveInicio = periodo.anoInicio * 100 + periodo.mesInicio
  const chaveFim = periodo.anoFim * 100 + periodo.mesFim

  // ── Geral (faturamento_cliente) ──────────────────────────────
  const geralRows = await prisma.$queryRaw<Array<{
    ano: string; mes: string; cod_cli: number; faturamento: number
  }>>`
    SELECT ano, mes, cod_cli, faturamento
    FROM faturamento_cliente
    WHERE ano REGEXP '^[0-9]+$' AND mes REGEXP '^[0-9]+$'
      AND (CAST(ano AS UNSIGNED) * 100 + CAST(mes AS UNSIGNED)) BETWEEN ${chaveInicio} AND ${chaveFim}
  `

  let faturamentoTotal = 0
  const clientesSet = new Set<number>()
  const porMes = new Map<string, number>()
  for (const r of geralRows) {
    const valor = Number(r.faturamento || 0)
    faturamentoTotal += valor
    clientesSet.add(Number(r.cod_cli))
    const chave = `${String(r.ano).padStart(4, '0')}-${String(r.mes).padStart(2, '0')}`
    porMes.set(chave, (porMes.get(chave) ?? 0) + valor)
  }
  const evolucaoMensal = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, total]) => {
      const [ano, mes] = chave.split('-')
      return { mes: `${mes}/${ano.slice(2)}`, total: Math.round(total * 100) / 100 }
    })

  const clientesComFaturamento = clientesSet.size
  const faturamentoMedioMensalPorCliente = geralRows.length > 0
    ? faturamentoTotal / new Set(geralRows.map(r => `${r.cod_cli}:${r.ano}:${r.mes}`)).size
    : 0
  const faturamentoMedioPorClienteNoPeriodo = clientesComFaturamento > 0
    ? faturamentoTotal / clientesComFaturamento
    : 0

  // ── Por forma de pagamento (cliente_faturamento_forma_pagto) ─
  const formaPagtoRows = await prisma.$queryRaw<Array<{
    tipo_forma_pagto: string; tipo_cartao: string; cod_cli: number; faturamento: number; quantidade: number
  }>>`
    SELECT tipo_forma_pagto, tipo_cartao, cod_cli, faturamento, quantidade
    FROM cliente_faturamento_forma_pagto
    WHERE (ano * 100 + mes) BETWEEN ${chaveInicio} AND ${chaveFim}
  `
  const agrupFormaPagto = new Map<string, { total: number; clientes: Set<number>; quantidade: number }>()
  for (const r of formaPagtoRows) {
    const label = labelFormaPagamento(r.tipo_forma_pagto, r.tipo_cartao)
    const atual = agrupFormaPagto.get(label) ?? { total: 0, clientes: new Set<number>(), quantidade: 0 }
    atual.total += Number(r.faturamento || 0)
    atual.clientes.add(Number(r.cod_cli))
    atual.quantidade += Number(r.quantidade || 0)
    agrupFormaPagto.set(label, atual)
  }

  // PIX entra na mesma listagem de forma de pagamento, vindo da tabela própria.
  const pixRows = await prisma.$queryRaw<Array<{ cod_cli: number; faturamento: number; quantidade: number }>>`
    SELECT cod_cli, faturamento, quantidade
    FROM cliente_faturamento_pix
    WHERE (ano * 100 + mes) BETWEEN ${chaveInicio} AND ${chaveFim}
  `
  if (pixRows.length) {
    const atual = agrupFormaPagto.get('PIX') ?? { total: 0, clientes: new Set<number>(), quantidade: 0 }
    for (const r of pixRows) {
      atual.total += Number(r.faturamento || 0)
      atual.clientes.add(Number(r.cod_cli))
      atual.quantidade += Number(r.quantidade || 0)
    }
    agrupFormaPagto.set('PIX', atual)
  }

  const porFormaPagamento = Array.from(agrupFormaPagto.entries())
    .map(([forma, v]) => ({
      forma,
      total: Math.round(v.total * 100) / 100,
      clientes: v.clientes.size,
      faturamentoMedioPorCliente: v.clientes.size > 0 ? Math.round((v.total / v.clientes.size) * 100) / 100 : 0,
      quantidade: v.quantidade,
    }))
    .sort((a, b) => b.total - a.total)

  // ── Por maquininha/adquirente (cliente_faturamento_adm_cartao) ─
  const admRows = await prisma.$queryRaw<Array<{
    descricao_adm_cartao: string; cod_cli: number; faturamento: number
  }>>`
    SELECT descricao_adm_cartao, cod_cli, faturamento
    FROM cliente_faturamento_adm_cartao
    WHERE (ano * 100 + mes) BETWEEN ${chaveInicio} AND ${chaveFim}
  `
  const agrupMaquininha = new Map<string, { total: number; clientes: Set<number> }>()
  for (const r of admRows) {
    const operadora = normalizarOperadora(r.descricao_adm_cartao)
    const atual = agrupMaquininha.get(operadora) ?? { total: 0, clientes: new Set<number>() }
    atual.total += Number(r.faturamento || 0)
    atual.clientes.add(Number(r.cod_cli))
    agrupMaquininha.set(operadora, atual)
  }
  const porMaquininha = Array.from(agrupMaquininha.entries())
    .map(([operadora, v]) => ({
      operadora,
      total: Math.round(v.total * 100) / 100,
      clientes: v.clientes.size,
      faturamentoMedioPorCliente: v.clientes.size > 0 ? Math.round((v.total / v.clientes.size) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    periodo: { ...periodo, meses },
    geral: {
      faturamentoTotal: Math.round(faturamentoTotal * 100) / 100,
      clientesComFaturamento,
      faturamentoMedioMensalPorCliente: Math.round(faturamentoMedioMensalPorCliente * 100) / 100,
      faturamentoMedioPorClienteNoPeriodo: Math.round(faturamentoMedioPorClienteNoPeriodo * 100) / 100,
      evolucaoMensal,
    },
    porFormaPagamento,
    porMaquininha,
  }
}
