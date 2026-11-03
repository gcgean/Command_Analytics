import { prisma } from '../database/client'

/**
 * Treinamentos avaliados de um colaborador no período.
 *
 * As avaliações vivem em DUAS tabelas: `agenda` e `agendamento_programado` — é assim que a
 * tela Histórico de Treinamentos monta a lista, e a maior parte das notas está na segunda.
 * Contar só a primeira, como a consulta antiga fazia, pagava bônus a menos.
 *
 * O tipo do agendamento programado não está em coluna própria: vem do prefixo
 * `[TIPO_AGENDA:...]` gravado na descrição e, quando não há prefixo, do nome do procedimento.
 */

export interface TreinamentoAvaliado {
  id: number
  origem: 'agenda' | 'programado'
  colaboradorId: number | null
  clienteId: number | null
  clienteNome: string
  data: string | null
  nota: number
}

/** União das duas origens. Recebe (notaMinima, inicio, fim) duas vezes, uma por origem. */
const UNIAO = `
  SELECT a.cod_agenda AS id, 'agenda' AS origem, a.cod_colaborador AS colaborador,
         a.cod_cli AS clienteId,
         COALESCE(cli.NOME_FANTASIA, cli.NOME_CLI) AS clienteNome,
         DATE_FORMAT(a.data_agendamento, '%Y-%m-%d') AS data,
         a.Nota AS nota
    FROM agenda a
    LEFT JOIN cliente cli ON cli.COD_CLI = a.cod_cli
   WHERE a.cod_agenda > 0
     AND UPPER(COALESCE(a.Tipo, '')) LIKE '%TREIN%'
     AND COALESCE(a.Nota, 0) >= ?
     AND a.data_agendamento BETWEEN ? AND ?
  UNION ALL
  SELECT p.id, 'programado', p.cod_tecnico,
         p.cod_cli,
         COALESCE(cliP.NOME_FANTASIA, cliP.NOME_CLI),
         DATE_FORMAT(p.data_agendamento, '%Y-%m-%d'),
         p.nota
    FROM agendamento_programado p
    LEFT JOIN cliente cliP ON cliP.COD_CLI = p.cod_cli
    LEFT JOIN cadastro_procedimentos cp ON cp.id = p.procedimento_id
   WHERE COALESCE(p.nota, 0) >= ?
     AND p.data_agendamento BETWEEN ? AND ?
     -- descricao é utf8mb4_bin: sem o COLLATE o LIKE quebra com "illegal mix of collations".
     AND (CASE WHEN p.descricao LIKE '[TIPO_AGENDA:%'
               THEN UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(p.descricao, '[TIPO_AGENDA:', -1), ']', 1))
               ELSE UPPER(COALESCE(cp.nome, '')) END)
         COLLATE utf8mb4_general_ci LIKE '%TREIN%'`

/** Os treinamentos de uma pessoa, do mais recente para o mais antigo. */
export async function treinamentosAvaliados(
  colaboradorId: number, inicio: string, fim: string, notaMinima: number,
): Promise<TreinamentoAvaliado[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM (${UNIAO}) t
      WHERE t.colaborador = ?
      ORDER BY t.data DESC, t.id DESC`,
    notaMinima, inicio, fim, notaMinima, inicio, fim, colaboradorId,
  ).catch(() => [])
  return linhas.map((r) => ({
    id: Number(r.id),
    origem: r.origem === 'programado' ? 'programado' as const : 'agenda' as const,
    colaboradorId: r.colaborador == null ? null : Number(r.colaborador),
    clienteId: r.clienteId == null ? null : Number(r.clienteId),
    clienteNome: String(r.clienteNome ?? '').trim() || 'Cliente sem nome',
    data: r.data ?? null,
    nota: Number(r.nota ?? 0),
  }))
}

/** Nota média e quantidade por colaborador no período — alimenta o ranking. */
export async function rankingTreinamentos(
  inicio: string, fim: string, notaMinima: number,
): Promise<Array<{ colaboradorId: number | null; quantidade: number; mediaNota: number }>> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT t.colaborador, COUNT(*) AS qtd, AVG(t.nota) AS media
       FROM (${UNIAO}) t
      GROUP BY t.colaborador
      ORDER BY qtd DESC, media DESC`,
    notaMinima, inicio, fim, notaMinima, inicio, fim,
  ).catch(() => [])
  return linhas.map((r) => ({
    colaboradorId: r.colaborador == null ? null : Number(r.colaborador),
    quantidade: Number(r.qtd ?? 0),
    mediaNota: Number(Number(r.media ?? 0).toFixed(2)),
  }))
}
