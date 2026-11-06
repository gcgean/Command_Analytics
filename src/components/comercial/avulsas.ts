import type { TipoAvulsa } from '../../types'

/**
 * Vocabulário dos lançamentos avulsos.
 *
 * Fica fora das páginas porque o mesmo rótulo aparece em dois lugares — quem lança, na
 * Remuneração Comercial, e quem recebe, no Meu Desempenho. Duas listas separadas
 * acabariam divergindo na primeira vez que um tipo novo fosse criado.
 */
export const TIPOS_AVULSA: Array<{ valor: TipoAvulsa; rotulo: string; classe: string }> = [
  {
    valor: 'premio',
    rotulo: 'Prêmio',
    classe: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  {
    valor: 'treinamento',
    rotulo: 'Treinamento',
    classe: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  {
    valor: 'pagamento-cliente',
    rotulo: 'Pagamento do cliente',
    classe: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
]

/** Lançamento antigo, ou tipo que o banco não conhece, conta como prêmio. */
export const tipoInfo = (t: TipoAvulsa | null | undefined) =>
  TIPOS_AVULSA.find((x) => x.valor === t) ?? TIPOS_AVULSA[0]
