/**
 * As colunas de texto do Delphi (`atendimentos.Obs_Atendimento`, `solucao`,
 * `Motivo_Cancelamento` e `log_atendimento.obs_atendimento`) são latin1. Com o MySQL em modo
 * estrito, um único caractere fora dessa tabela — um emoji colado do WhatsApp, por exemplo —
 * derruba a gravação inteira com o erro 1366, que chega na tela como "Falha ao gravar no banco de
 * dados (P2010)". Converter as colunas para utf8mb4 quebraria o Delphi, que lê as mesmas tabelas,
 * então o texto é ajustado aqui na entrada.
 *
 * Acentos, cedilha e til são latin1 e passam intactos; só o que não existe em latin1 é traduzido
 * ou descartado.
 */
const SUBSTITUICOES: Array<[RegExp, string]> = [
  [/[‘’‚‛]/g, "'"],   // aspas simples curvas
  [/[“”„‟]/g, '"'],   // aspas duplas curvas
  [/[–—―]/g, '-'],         // travessões
  [/[•‣●◦]/g, '-'],   // marcadores de lista
  [/…/g, '...'],                      // reticências
  [/[   ]/g, ' '],         // espaços especiais
  [/[‹›]/g, "'"],
  [/₿/g, 'BTC'],
  [/[−]/g, '-'],
]

export function paraLatin1(texto: string): string {
  let saida = texto
  for (const [de, para] of SUBSTITUICOES) saida = saida.replace(de, para)

  // Emoji e qualquer outro caractere sem representação em latin1 saem de vez. Usa Array.from pra
  // não partir pares substitutos no meio (emoji ocupa duas posições numa string JS).
  return Array.from(saida)
    .filter((c) => {
      const code = c.codePointAt(0) ?? 0
      // Controles ficam de fora, menos quebra de linha e tabulação, que são úteis no texto.
      if (code < 32) return c === '\n' || c === '\r' || c === '\t'
      return code <= 255
    })
    .join('')
}
