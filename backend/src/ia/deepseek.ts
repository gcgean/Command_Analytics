import type { ProvedorIA, MensagemIA, FerramentaDeclarada, RespostaIA, ChamadaFerramenta } from './provider'

const MODELO_PADRAO = 'deepseek-chat'
const TIMEOUT_MS = 30_000

function paraFormatoOpenAI(mensagens: MensagemIA[]): any[] {
  return mensagens.map((m) => {
    if (m.papel === 'assistant' && m.chamadas?.length) {
      return {
        role: 'assistant',
        content: m.conteudo || null,
        tool_calls: m.chamadas.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.nome, arguments: JSON.stringify(c.argumentos) },
        })),
      }
    }
    if (m.papel === 'tool') {
      return { role: 'tool', tool_call_id: m.chamadaId, content: m.conteudo }
    }
    return { role: m.papel, content: m.conteudo }
  })
}

export class ProvedorDeepSeek implements ProvedorIA {
  readonly nome = 'deepseek'
  readonly modelo: string

  constructor(private readonly apiKey: string, modelo?: string) {
    this.modelo = modelo ?? process.env.IA_MODELO ?? MODELO_PADRAO
  }

  async conversar(mensagens: MensagemIA[], ferramentas: FerramentaDeclarada[]): Promise<RespostaIA> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelo,
          messages: paraFormatoOpenAI(mensagens),
          tools: ferramentas.length
            ? ferramentas.map((f) => ({
                type: 'function',
                function: { name: f.nome, description: f.descricao, parameters: f.schemaParametros },
              }))
            : undefined,
        }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const corpo = await resp.text().catch(() => '')
        throw new Error(`DeepSeek respondeu ${resp.status}: ${corpo.slice(0, 300)}`)
      }

      const data = await resp.json()
      const escolha = data?.choices?.[0]?.message
      if (!escolha) throw new Error('Resposta do DeepSeek sem conteúdo.')

      const chamadas: ChamadaFerramenta[] = Array.isArray(escolha.tool_calls)
        ? escolha.tool_calls.map((tc: any) => {
            let argumentos: Record<string, any> = {}
            try { argumentos = JSON.parse(tc.function?.arguments || '{}') } catch { /* argumentos inválidos viram objeto vazio */ }
            return { id: tc.id, nome: tc.function?.name, argumentos }
          })
        : []

      return { texto: escolha.content || '', chamadas }
    } finally {
      clearTimeout(timer)
    }
  }
}
