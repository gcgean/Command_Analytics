import { prisma } from '../database/client'

/**
 * Comissão do agente sobre certificados digitais emitidos.
 *
 * Regra herdada do sistema legado: o percentual pago sobre o total emitido sobe com o volume
 * da EQUIPE em cada certificadora, e cada pessoa participa pela fatia que emitiu. A fatia tem
 * teto de 60% — o que passa disso é redistribuído igualmente entre todos, para uma pessoa só
 * não levar o bolo inteiro quando emite quase tudo.
 *
 * Mora aqui, e não na rota, porque duas telas dependem do mesmo número: a aba Comissões de
 * Certificado e o Meu Desempenho. Se cada uma fizesse a sua conta, a pessoa veria um valor
 * numa tela e receberia outro.
 */

export interface LinhaAgente {
  usuarioId: number
  usuario: string
  certificadoraId: number
  certificadora: string | null
  qtdIndividual: number
  qtdEquipe: number
  valorIndividual: number
  valorEquipe: number
  percentualAplicado: number
  participacaoInicial: number
  participacaoFinal: number
  baseCalculo: number
  comissao: number
}

export interface CertificadoEmitido {
  id: number
  data: string | null
  cliente: string
  certificadora: string | null
  valor: number
  comissaoContador: number
}

/** Faixa por volume da equipe na certificadora, igual ao legado. */
export function percentualPorVolume(qtd: number): number {
  if (qtd <= 10) return 0
  if (qtd <= 20) return 0.01
  if (qtd <= 30) return 0.02
  if (qtd <= 40) return 0.03
  if (qtd <= 50) return 0.04
  return 0.05
}

const num = (v: any) => (v == null ? 0 : Number(v))

/** Uma linha por pessoa e certificadora no período. */
export async function comissaoAgente(inicio: string, fim: string): Promise<LinhaAgente[]> {
  const porPessoa = await prisma.$queryRawUnsafe<any[]>(
    `SELECT u.COD_USU AS usuarioId, COALESCE(u.NOME_USUARIO_COMPLETO, u.NOME_USU) AS usuario,
            i.id_certificadora AS certificadoraId,
            ce.descricao_certificadora AS certificadora,
            COUNT(i.id) AS qtdIndividual,
            SUM(i.valor) AS valorIndividual
       FROM indicacao_contador i
       INNER JOIN usuario u ON u.COD_USU = i.id_usu_lanc
       LEFT JOIN certificadora ce ON ce.id_certificadora = i.id_certificadora
      WHERE i.data_indicacao BETWEEN ? AND ?
        AND COALESCE(i.id_certificadora, 0) > 0
      GROUP BY u.COD_USU, usuario, i.id_certificadora, ce.descricao_certificadora`,
    inicio, fim).catch(() => [])

  const porCertificadora = await prisma.$queryRawUnsafe<any[]>(
    `SELECT i.id_certificadora AS certificadoraId,
            COUNT(i.id) AS qtdEquipe,
            SUM(i.valor) AS valorEquipe
       FROM indicacao_contador i
      WHERE i.data_indicacao BETWEEN ? AND ?
        AND COALESCE(i.id_certificadora, 0) > 0
      GROUP BY i.id_certificadora`, inicio, fim).catch(() => [])

  const equipe = new Map(porCertificadora.map((r) => [Number(r.certificadoraId), {
    qtd: Number(r.qtdEquipe ?? 0), valor: num(r.valorEquipe),
  }]))

  // Excedente acima de 60% por certificadora, para redistribuir entre todos.
  const excedente = new Map<number, { total: number; pessoas: number }>()
  for (const r of porPessoa) {
    const cid = Number(r.certificadoraId)
    const eq = equipe.get(cid)
    const participacao = eq && eq.qtd > 0 ? Number(r.qtdIndividual) / eq.qtd : 0
    const atual = excedente.get(cid) ?? { total: 0, pessoas: 0 }
    atual.total += participacao > 0.6 ? participacao - 0.6 : 0
    atual.pessoas += 1
    excedente.set(cid, atual)
  }

  return porPessoa.map((r) => {
    const cid = Number(r.certificadoraId)
    const eq = equipe.get(cid) ?? { qtd: 0, valor: 0 }
    const ex = excedente.get(cid) ?? { total: 0, pessoas: 0 }
    const participacaoInicial = eq.qtd > 0 ? Number(r.qtdIndividual) / eq.qtd : 0
    const sobra = ex.pessoas > 0 ? ex.total / ex.pessoas : 0

    const participacao = eq.qtd === 0 ? 0
      : ex.total === 0 ? participacaoInicial
        : participacaoInicial > 0.6 ? 0.6 + sobra
          : participacaoInicial + sobra

    const percAplicado = percentualPorVolume(eq.qtd)
    return {
      usuarioId: Number(r.usuarioId),
      usuario: String(r.usuario ?? '').trim(),
      certificadoraId: cid,
      certificadora: r.certificadora ?? null,
      qtdIndividual: Number(r.qtdIndividual ?? 0),
      qtdEquipe: eq.qtd,
      valorIndividual: num(r.valorIndividual),
      valorEquipe: eq.valor,
      percentualAplicado: Number((percAplicado * 100).toFixed(2)),
      participacaoInicial: Number((participacaoInicial * 100).toFixed(2)),
      participacaoFinal: Number((participacao * 100).toFixed(2)),
      baseCalculo: Number((eq.valor * participacao).toFixed(2)),
      comissao: Number((eq.valor * percAplicado * participacao).toFixed(2)),
    }
  }).sort((a, b) => a.certificadoraId - b.certificadoraId || b.comissao - a.comissao)
}

/** Os certificados que a pessoa emitiu no período, para ela poder conferir um a um. */
export async function certificadosEmitidos(
  usuarioId: number, inicio: string, fim: string,
): Promise<CertificadoEmitido[]> {
  const linhas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT i.id, DATE_FORMAT(i.data_indicacao, '%Y-%m-%d') AS data,
            COALESCE(c.NOME_FANTASIA, c.NOME_CLI) AS cliente,
            ce.descricao_certificadora AS certificadora,
            i.valor, i.comissao_valor
       FROM indicacao_contador i
       LEFT JOIN cliente c ON c.cod_cli = i.id_cliente
       LEFT JOIN certificadora ce ON ce.id_certificadora = i.id_certificadora
      WHERE i.id_usu_lanc = ? AND i.data_indicacao BETWEEN ? AND ?
      ORDER BY i.data_indicacao DESC, i.id DESC`,
    usuarioId, inicio, fim).catch(() => [])

  return linhas.map((r) => ({
    id: Number(r.id),
    data: r.data ?? null,
    cliente: String(r.cliente ?? '').trim() || 'Cliente sem nome',
    certificadora: r.certificadora ?? null,
    valor: num(r.valor),
    comissaoContador: num(r.comissao_valor),
  }))
}
