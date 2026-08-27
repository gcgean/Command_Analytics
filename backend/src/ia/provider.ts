// Contrato do provedor de IA — sem nada específico de nenhum fornecedor. Trocar de IA é trocar
// só a implementação (ia/deepseek.ts), sem tocar no resto (tools, loop, rotas).

export type PapelMensagem = 'system' | 'user' | 'assistant' | 'tool'

export interface MensagemIA {
  papel: PapelMensagem
  conteudo: string
  // Presente quando papel === 'assistant' e o modelo pediu uma ou mais ferramentas.
  chamadas?: ChamadaFerramenta[]
  // Presente quando papel === 'tool': a qual chamada essa mensagem responde.
  chamadaId?: string
}

export interface ChamadaFerramenta {
  id: string
  nome: string
  argumentos: Record<string, any>
}

export interface FerramentaDeclarada {
  nome: string
  descricao: string
  schemaParametros: Record<string, any> // JSON Schema
}

export interface RespostaIA {
  texto: string
  chamadas: ChamadaFerramenta[]
}

export interface ProvedorIA {
  readonly nome: string
  readonly modelo: string
  conversar(mensagens: MensagemIA[], ferramentas: FerramentaDeclarada[]): Promise<RespostaIA>
}
