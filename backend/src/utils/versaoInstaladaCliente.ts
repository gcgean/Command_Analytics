import { prisma } from '../database/client'

export type VersoesInstaladas = { RETAGUARDA: string; PDV: string; CONNECTION: string }

/**
 * Versão instalada de cada cliente: em cada sistema, a MAIOR versão entre todas as pastas dele.
 *
 * Um cliente pode ter várias pastas em dados_gerais_clientes (cópias de teste, builds antigas,
 * instalações abandonadas). Com qualquer pasta velha contando, o cliente continuava em "Clientes a
 * atualizar" mesmo depois de o técnico atualizar a pasta real. Basta uma pasta estar na versão
 * nova pro cliente ser considerado atualizado naquele sistema.
 */
export async function versoesMaisNovasDoCliente(clienteIds: number[]): Promise<Map<number, VersoesInstaladas>> {
  const resultado = new Map<number, VersoesInstaladas>()
  if (!clienteIds.length) return resultado

  const linhas = await prisma.$queryRawUnsafe<
    Array<{ clienteId: number; RETAGUARDA: string | null; PDV: string | null; CONNECTION: string | null }>
  >(
    `SELECT cod_cli AS clienteId,
            versao_exe_retaguarda AS RETAGUARDA, versao_exe_pdv AS PDV, versao_exe_connection AS CONNECTION
       FROM dados_gerais_clientes
      WHERE cod_cli IN (${clienteIds.map(() => '?').join(',')})`,
    ...clienteIds,
  )

  for (const l of linhas) {
    const id = Number(l.clienteId)
    const atual = resultado.get(id) ?? { RETAGUARDA: '', PDV: '', CONNECTION: '' }
    for (const sistema of ['RETAGUARDA', 'PDV', 'CONNECTION'] as const) {
      const v = String(l[sistema] ?? '').trim()
      if (v && (!atual[sistema] || compararVersao(v, atual[sistema]) > 0)) atual[sistema] = v
    }
    resultado.set(id, atual)
  }
  return resultado
}

/** Compara "6.57.3.0" numericamente — como texto, "6.9" sairia maior que "6.57". */
export function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}
