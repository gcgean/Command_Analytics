import clsx from 'clsx'
import type { PerguntaTriagem } from '../../types'

/**
 * Renderiza uma pergunta a partir do cadastro. O atendente e o cliente usam o mesmo
 * componente — o que muda é só o conjunto de perguntas que cada um recebe do servidor.
 */
export function CampoTriagem({ pergunta, valor, pendente, onChange }: {
  pergunta: PerguntaTriagem
  valor: any
  pendente?: boolean
  onChange: (valor: any) => void
}) {
  const p = pergunta
  const texto = valor == null ? '' : String(valor)
  const classe = clsx('input-field w-full', pendente && 'border-red-400 dark:border-red-500')

  const campo = () => {
    switch (p.tipo) {
      case 'sim_nao':
      case 'opcao': {
        const opcoes = p.tipo === 'sim_nao' && p.opcoes.length === 0 ? ['Sim', 'Não'] : p.opcoes
        if (opcoes.length <= 4) {
          return (
            <div className="flex flex-wrap gap-2">
              {opcoes.map((o) => (
                <button key={o} type="button" onClick={() => onChange(texto === o ? '' : o)}
                  className={clsx('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                    texto === o
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-400')}>
                  {o}
                </button>
              ))}
            </div>
          )
        }
        return (
          <select className={classe} value={texto} onChange={(e) => onChange(e.target.value)}>
            <option value="">Selecione...</option>
            {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      }

      case 'multipla': {
        const marcados: string[] = Array.isArray(valor) ? valor : (texto ? texto.split('|') : [])
        const alternar = (o: string) =>
          onChange(marcados.includes(o) ? marcados.filter((x) => x !== o) : [...marcados, o])
        return (
          <div className="flex flex-wrap gap-2">
            {p.opcoes.map((o) => (
              <button key={o} type="button" onClick={() => alternar(o)}
                className={clsx('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                  marcados.includes(o)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-400')}>
                {o}
              </button>
            ))}
          </div>
        )
      }

      case 'longo':
        return <textarea className={clsx(classe, 'min-h-[5rem]')} value={texto}
          onChange={(e) => onChange(e.target.value)} />

      case 'numero':
        return <input type="number" className={classe} value={texto}
          onChange={(e) => onChange(e.target.value)} />

      case 'data':
        return <input type="date" className={classe} value={texto}
          onChange={(e) => onChange(e.target.value)} />

      default:
        return <input className={classe} value={texto} onChange={(e) => onChange(e.target.value)} />
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
        {p.texto}
        {p.obrigatoria && <span className="text-red-500 ml-1">*</span>}
      </label>
      {p.ajuda && <p className="text-xs text-slate-500 mb-1.5">{p.ajuda}</p>}
      {campo()}
    </div>
  )
}

/** Agrupa as perguntas visíveis pelo grupo do cadastro, mantendo a ordem. */
export function agruparPerguntas(perguntas: PerguntaTriagem[]): Array<[string, PerguntaTriagem[]]> {
  const grupos: Array<[string, PerguntaTriagem[]]> = []
  for (const p of perguntas) {
    const nome = p.grupo || 'Informações'
    const existente = grupos.find(([g]) => g === nome)
    if (existente) existente[1].push(p)
    else grupos.push([nome, [p]])
  }
  return grupos
}
