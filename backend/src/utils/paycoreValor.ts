import { Prisma } from '@prisma/client'

/**
 * Valor MENSAL de uma assinatura do PayCore, em SQL.
 *
 * A coluna `mensal` vem do campo `monthly` da API, mas nos planos anuais ela guarda o
 * contrato inteiro, não a parcela do mês: o mesmo "Plano Controle" custa R$ 154,60 no
 * mensal e R$ 2.109,60 no anual — doze vezes R$ 175,80. Somada crua, uma única venda anual
 * entrava na meta valendo doze meses, e em novembro/2026 três delas respondiam por 55% da
 * meta do mês inteiro, levando o Boletim a 118% quando o ritmo real era 57%.
 *
 * Tudo que mede receita recorrente — meta geral, Boletim, base de comissão, saúde da
 * carteira — precisa usar esta expressão, e não as colunas direto. As periodicidades além
 * de mensal e anual estão aqui por precaução: se o PayCore passar a vender semestral, a
 * conta já nasce certa em vez de inflar de novo.
 */
export function sqlValorMensalAssinatura(alias = 'a'): string {
  return `((${alias}.mensal + ${alias}.valor_modulos) / CASE LOWER(COALESCE(${alias}.periodicidade, 'mensal'))
      WHEN 'anual' THEN 12
      WHEN 'semestral' THEN 6
      WHEN 'trimestral' THEN 3
      WHEN 'bimestral' THEN 2
      ELSE 1
    END)`
}

/** A mesma expressão para as consultas que usam template tag em vez de SQL em texto. */
export const valorMensalAssinatura = (alias = 'a') =>
  Prisma.raw(sqlValorMensalAssinatura(alias))
