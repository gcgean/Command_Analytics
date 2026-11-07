import { prisma } from '../database/client'
import { sqlSemProcedimentoIrrelevante } from './procedimentosIrrelevantes'

/**
 * Ranking de atendimentos, para premiar o melhor atendente do mês.
 *
 * Só contam as filas de atendimento de verdade — Suporte, Fiscal, Instalação, Treinamento,
 * Técnico e Migração. Comercial, Financeiro, CS, Certificado Digital e Desenvolvimento
 * ficam de fora: são outros trabalhos, com outra régua.
 *
 * Classifica pela nota média, e o desempate é o volume: entre duas médias iguais, ganha
 * quem atendeu mais. Quem não alcança o mínimo de atendimentos não entra — média de poucas
 * avaliações não diz nada sobre consistência.
 *
 * Procedimentos que não são atendimento ficam fora da conta inteira, inclusive do mínimo
 * de elegibilidade: ver `procedimentosIrrelevantes`.
 */

/** Filas que entram no ranking. Ids de `departamento`. */
export const DEPARTAMENTOS_ATENDIMENTO = [1, 6, 7, 8, 9, 11]

/** Atendimento finalizado — o mesmo corte do Relatório de Atendimentos. */
const STATUS_FINALIZADO = 7

export interface LinhaRankingAtendimento {
  posicao: number
  tecnicoId: number
  tecnico: string
  atendimentos: number
  avaliados: number
  notaMedia: number
  tmaMinutos: number | null
  /** Falso para quem não alcançou o mínimo: aparece fora da disputa. */
  elegivel: boolean
}

const num = (v: any) => (v == null ? 0 : Number(v))

export async function rankingAtendimentos(
  inicio: string, fim: string, minimoAtendimentos: number,
): Promise<LinhaRankingAtendimento[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.cod_tecnico AS id,
            COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS tecnico,
            COUNT(*) AS atendimentos,
            SUM(COALESCE(a.nota, 0) > 0) AS avaliados,
            AVG(NULLIF(a.nota, 0)) AS nota_media,
            AVG(NULLIF(a.Tempo_atendimento, 0)) AS tma
       FROM atendimentos a
       LEFT JOIN usuario u ON u.COD_USU = a.cod_tecnico
      WHERE a.Status_Atendimento = ${STATUS_FINALIZADO}
        AND a.departamento IN (${DEPARTAMENTOS_ATENDIMENTO.join(',')})
        AND DATE(COALESCE(a.Data_hora_finalizacao, a.data_hora_lanc)) BETWEEN ? AND ?
        AND a.cod_tecnico IS NOT NULL
        AND ${sqlSemProcedimentoIrrelevante('a')}
      GROUP BY a.cod_tecnico, tecnico`, inicio, fim).catch(() => [])

  return linhas
    .map((r) => ({
      tecnicoId: Number(r.id),
      tecnico: String(r.tecnico ?? '').trim() || `Usuário ${r.id}`,
      atendimentos: Number(r.atendimentos ?? 0),
      avaliados: Number(r.avaliados ?? 0),
      notaMedia: Number(num(r.nota_media).toFixed(2)),
      tmaMinutos: r.tma == null ? null : Math.round(num(r.tma)),
      elegivel: Number(r.atendimentos ?? 0) >= minimoAtendimentos,
    }))
    // Elegíveis primeiro; dentro deles, nota e depois volume como desempate.
    .sort((a, b) => Number(b.elegivel) - Number(a.elegivel)
      || b.notaMedia - a.notaMedia
      || b.atendimentos - a.atendimentos)
    .map((r, i) => ({ ...r, posicao: i + 1 }))
}

/** Quem leva o prêmio: o primeiro elegível. Empate de nota E volume paga aos dois. */
export function melhoresAtendentes(linhas: LinhaRankingAtendimento[]): number[] {
  const elegiveis = linhas.filter((l) => l.elegivel)
  if (elegiveis.length === 0) return []
  const topo = elegiveis[0]
  return elegiveis
    .filter((l) => l.notaMedia === topo.notaMedia && l.atendimentos === topo.atendimentos)
    .map((l) => l.tecnicoId)
}
