// Barreiras do assistente de IA — ficam FORA de cada ferramenta, aplicadas pelo orquestrador
// (assistente.ts), pra continuarem valendo quando uma décima ferramenta for adicionada e alguém
// esquecer de se proteger dentro dela.

const CAMPOS_PROIBIDOS = /senha|password|token|secret|api_key|hash|authorization|credential/i

/**
 * Remove recursivamente qualquer campo sensível do resultado de uma ferramenta antes de esse
 * resultado ser colocado no histórico enviado ao modelo. Nada sensível chega à IA, venha de
 * onde vier (mesmo que uma ferramenta nova, no futuro, esqueça de filtrar sozinha).
 */
export function sanitizarParaIA(valor: any): any {
  if (Array.isArray(valor)) return valor.map(sanitizarParaIA)
  if (valor && typeof valor === 'object') {
    const limpo: Record<string, any> = {}
    for (const [chave, v] of Object.entries(valor)) {
      limpo[chave] = CAMPOS_PROIBIDOS.test(chave) ? '[protegido]' : sanitizarParaIA(v)
    }
    return limpo
  }
  return valor
}

/**
 * Command Analytics não é multi-empresa (é uso interno da Cilos) — a barreira de escopo aqui não
 * é "id_empresa" como no playbook original, é "o usuário autenticado". Nenhuma ferramenta deve
 * aceitar um usuarioId/funcionarioId "de quem está pedindo" vindo do modelo: o id de quem está
 * conversando sempre vem do contexto (JWT), nunca de um argumento que a IA escreveu.
 */
export interface ContextoIA {
  usuarioId: number
  usuarioNome: string
  permissoes: string[]
}

export function possuiPermissao(ctx: ContextoIA, recurso: string): boolean {
  return ctx.permissoes.includes('*') || ctx.permissoes.includes(recurso)
}
