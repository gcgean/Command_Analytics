import { prisma } from '../database/client'

/**
 * Meta geral da empresa no mes, em receita recorrente nova.
 *
 * Mora aqui, e nao na rota do boletim, porque tres lugares dependem do MESMO numero: o
 * Boletim Comercial, o card de meta no Meu Desempenho e o bonus por meta batida. Se cada um
 * fizesse a sua conta, a pessoa veria um percentual na tela e receberia sobre outro.
 */
export const META_GERAL = 8333

/**
 * Quanto de receita recorrente NOVA o periodo somou: upgrades + clientes novos + reativados
 * + assinaturas PayCore. E a mesma conta do boletim, isolada aqui porque duas telas dependem
 * dela - se cada uma fizesse a sua, uma mostraria um percentual e a outra, outro.
 */
export async function receitaNovaDoPeriodo(dataIni: string, dataFim: string) {
  const [upg, novos, reativ, paycore] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(co.Valor_operacao), 0) AS valor
         FROM comissoes_funcionario co
         INNER JOIN cliente c ON c.cod_cli = co.cod_cli
        WHERE CAST(co.data_venda AS DATE) BETWEEN ? AND ?
          AND c.cod_cli NOT IN (1,6,7,8) AND c.cod_cla <> 30`, dataIni, dataFim)
      .catch(() => [{ valor: 0 }]),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(c.cod_cli) AS qtd, COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
          AND c.ATIVO = 'S' AND c.DATACADASTRO_CLI BETWEEN ? AND ?
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8`, dataIni, dataFim)
      .catch(() => [{ qtd: 0, valor: 0 }]),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(c.cod_cli) AS qtd, COALESCE(SUM(c.valor_mensalidade), 0) AS valor
         FROM cliente c
        WHERE c.cod_cli NOT IN (1,6,7,8) AND c.cod_cli < 10000000
          AND c.ATIVO = 'S' AND c.DATA_DESATIVACAO BETWEEN ? AND ?
          AND NOT (c.DATACADASTRO_CLI BETWEEN ? AND ?)
          AND c.cod_cla <> 30 AND COALESCE(c.STATUS_INSTAL, 0) <> 8`,
      dataIni, dataFim, dataIni, dataFim).catch(() => [{ qtd: 0, valor: 0 }]),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(a.mensal + a.valor_modulos), 0) AS valor
         FROM paycore_assinatura a
         LEFT JOIN paycore_cliente pc
           ON pc.servidor_id = a.servidor_id AND pc.customer_id = a.customer_id
         LEFT JOIN cliente c ON c.cod_cli = pc.cod_cli
        WHERE DATE(a.inicio) BETWEEN ? AND ?
          AND (c.cod_cli IS NULL OR DATE(c.DATACADASTRO_CLI) NOT BETWEEN ? AND ?)`,
      dataIni, dataFim, dataIni, dataFim).catch(() => [{ qtd: 0, valor: 0 }]),
  ])
  const valor = (r: any[]) => Number(r[0]?.valor ?? 0)
  const total = valor(upg) + valor(novos) + valor(reativ) + valor(paycore)
  return { total, upgrades: valor(upg), novos: valor(novos), reativados: valor(reativ), paycore: valor(paycore) }
}

/** Primeiro e ultimo dia da competencia YYYY-MM. */
export function limitesDaCompetencia(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return {
    ano, mes, ultimoDia,
    inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
    fim: `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`,
  }
}

/** Percentual da meta geral batido no periodo. Sem teto: 105% e 105%. */
export async function percentualMetaGeral(inicio: string, fim: string): Promise<number> {
  const { total } = await receitaNovaDoPeriodo(inicio, fim)
  return META_GERAL > 0 ? (total / META_GERAL) * 100 : 0
}
