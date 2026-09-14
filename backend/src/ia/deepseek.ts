import type { ProvedorIA, MensagemIA, FerramentaDeclarada, RespostaIA, ChamadaFerramenta } from './provider'

const MODELO_PADRAO = 'deepseek-chat'
// O DeepSeek, em horário de pico, segura a requisição na fila mandando só keep-alive — já foi
// medido passar de 2 minutos até pra uma resposta de uma palavra. 90s cobre a lentidão normal
// sem deixar a tela pendurada indefinidamente quando o serviço está travado.
const TIMEOUT_MS = 90_000
export const MSG_IA_LENTA = 'A IA (DeepSeek) está sobrecarregada e não respondeu a tempo. Tente de novo em alguns minutos.'

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
    } catch (e: any) {
      if (e?.name === 'AbortError' || String(e?.message ?? '').toLowerCase().includes('aborted')) {
        throw new Error(MSG_IA_LENTA)
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}
