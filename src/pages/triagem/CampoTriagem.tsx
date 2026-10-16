import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Camera, Loader2, Paperclip, X } from 'lucide-react'
import type { AnexoTriagem, PerguntaTriagem } from '../../types'

/**
 * Renderiza uma pergunta a partir do cadastro. O atendente e o cliente usam o mesmo
 * componente — o que muda é só o conjunto de perguntas que cada um recebe do servidor.
 */
export function CampoTriagem({ pergunta, valor, pendente, onChange, anexos, onEnviar, onRemover }: {
  pergunta: PerguntaTriagem
  valor: any
  pendente?: boolean
  onChange: (valor: any) => void
  /** Arquivos já enviados para esta pergunta; só usado pelos tipos foto e arquivo. */
  anexos?: AnexoTriagem[]
  onEnviar?: (arquivos: FileList) => Promise<void>
  onRemover?: (anexoId: number) => Promise<void>
}) {
  const p = pergunta
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const texto = valor == null ? '' : String(valor)
  const classe = clsx('input-field w-full', pendente && 'border-red-400 dark:border-red-500')

  async function enviar(lista: FileList | null) {
    if (!lista || lista.length === 0 || !onEnviar) return
    setEnviando(true)
    try { await onEnviar(lista) } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const campo = () => {
    switch (p.tipo) {
      case 'foto':
      case 'arquivo': {
        const fotos = p.tipo === 'foto'
        return (
          <div>
            <input ref={entrada} type="file" multiple className="hidden"
              accept={fotos ? 'image/*,application/pdf' : 'image/*,application/pdf'}
              // No celular isso abre a câmera direto, que é como a foto da etiqueta é tirada.
              capture={fotos ? 'environment' : undefined}
              onChange={(e) => void enviar(e.target.files)} />
            <button type="button" disabled={enviando || !onEnviar}
              onClick={() => entrada.current?.click()}
              className={clsx('w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed text-sm transition-colors',
                pendente ? 'border-red-400 text-red-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400',
                'disabled:opacity-50')}>
              {enviando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> enviando...</>
                : <>{fotos ? <Camera className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                    {fotos ? 'Tirar ou escolher foto' : 'Escolher arquivo'}</>}
            </button>
            {(anexos ?? []).length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {(anexos ?? []).map((a) => (
                  <li key={a.id}
                    className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-700/40 rounded-lg px-2 py-1.5">
                    {a.url && a.mimeType.startsWith('image/') ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={a.url} alt={a.nome} className="w-10 h-10 object-cover rounded" />
                      </a>
                    ) : <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.nome}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {a.enviadoPor === 'cliente' ? 'cliente' : 'equipe'}
                    </span>
                    {onRemover && (
                      <button type="button" onClick={() => void onRemover(a.id)}
                        className="text-slate-400 hover:text-red-500 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
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
