import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { api } from '../../services/api'
import { CampoTriagem, agruparPerguntas, perguntasEmAberto } from '../triagem/CampoTriagem'
import type { AnexoTriagem, PerguntaTriagem } from '../../types'

/**
 * Formulário que o cliente abre pelo link do atendente. Sem login e sem acesso a nada além
 * do próprio atendimento: o servidor devolve só as perguntas liberadas e só aceita escrita
 * nelas.
 */
export function TriagemCliente() {
  const { token } = useParams<{ token: string }>()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState<string | null>(null)
  const [cliente, setCliente] = useState<string | null>(null)
  const [perguntas, setPerguntas] = useState<PerguntaTriagem[]>([])
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  const [anexos, setAnexos] = useState<AnexoTriagem[]>([])
  // Prévia local do que a pessoa acabou de enviar: a leitura do arquivo no servidor é
  // autenticada, e o cliente não tem (nem deve ter) credencial.
  const [previas, setPrevias] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [pendentes, setPendentes] = useState<string[]>([])
  const [enviado, setEnviado] = useState(false)

  const carregar = useCallback(async () => {
    if (!token) return
    try {
      const d = await api.getTriagemPublica(token)
      setTitulo(d.titulo)
      setDescricao(d.descricao)
      setCliente(d.cliente)
      setPerguntas(d.perguntas)
      setRespostas(d.respostas ?? {})
      setAnexos(d.anexos ?? [])
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível abrir este formulário.')
    } finally {
      setCarregando(false)
    }
  }, [token])

  useEffect(() => { void carregar() }, [carregar])

  // As perguntas são condicionais: responder uma pode revelar outra, então cada mudança
  // vai ao servidor, que devolve a lista atualizada.
  async function responder(chave: string, valor: any) {
    const novas = { ...respostas, [chave]: valor }
    setRespostas(novas)
    if (pendentes.includes(chave)) {
      const faltando = perguntasEmAberto(perguntas, novas)
      setPendentes(faltando.map((p) => p.chave))
      if (faltando.length === 0) setErro('')
    }
    if (!token) return
    try {
      const r = await api.salvarTriagemPublica(token, { [chave]: valor })
      setPerguntas(r.perguntas)
    } catch {
      /* mantém o que a pessoa digitou; o envio final tenta de novo */
    }
  }

  async function enviarArquivos(chave: string, lista: FileList) {
    if (!token) return
    try {
      const r = await api.enviarAnexoTriagemPublica(token, chave, Array.from(lista))
      setAnexos(r.anexos)
      if (r.recusados?.length) setErro(r.recusados.join(' · '))
      else setErro('')
      for (const f of Array.from(lista)) {
        if (f.type.startsWith('image/')) {
          const nome = f.name.replace(/[^a-zA-Z0-9._\-\s]/g, '').trim().replace(/\s+/g, ' ')
          setPrevias((p) => ({ ...p, [nome]: URL.createObjectURL(f) }))
        }
      }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível enviar a foto.')
    }
  }

  async function removerArquivo(anexoId: number) {
    if (!token) return
    await api.removerAnexoTriagemPublica(token, anexoId).catch(() => {})
    setAnexos((lista) => lista.filter((a) => a.id !== anexoId))
  }

  // Dizer "responda os obrigatórios" sem dizer quais obriga a pessoa a caçar na tela.
  function avisarPendentes(faltando: PerguntaTriagem[]) {
    setPendentes(faltando.map((p) => p.chave))
    const nomes = faltando.map((p) => p.texto.replace(/[?:]$/, ''))
    const lista = nomes.length > 3
      ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`
      : nomes.join(', ')
    setErro(faltando.length === 1
      ? `Falta responder: ${lista}.`
      : `Faltam ${faltando.length} respostas: ${lista}.`)
    document.getElementById(`campo-${faltando[0].chave}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function enviar() {
    if (!token) return
    // Confere antes de mandar: o servidor também confere, mas aqui dá para apontar o campo.
    const faltando = perguntasEmAberto(perguntas, respostas)
    if (faltando.length > 0) return avisarPendentes(faltando)

    setEnviando(true)
    setErro('')
    try {
      await api.salvarTriagemPublica(token, respostas, true)
      setEnviado(true)
    } catch (e: any) {
      const aindaFaltando = perguntasEmAberto(perguntas, respostas)
      if (aindaFaltando.length > 0) avisarPendentes(aindaFaltando)
      else setErro(e?.message || 'Não foi possível enviar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const grupos = useMemo(() => agruparPerguntas(perguntas), [perguntas])
  const faltando = useMemo(() => new Set(pendentes), [pendentes])

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (erro && perguntas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-800 dark:text-slate-100 font-medium">{erro}</p>
          <p className="text-sm text-slate-500 mt-2">
            Entre em contato com o atendente que enviou o link.
          </p>
        </div>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-800 dark:text-slate-100 font-medium">Respostas enviadas.</p>
          <p className="text-sm text-slate-500 mt-2">
            O atendente já recebeu as informações e vai dar sequência ao atendimento.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{titulo}</h1>
          {cliente && <p className="text-sm text-slate-500 mt-0.5">{cliente}</p>}
          {descricao && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{descricao}</p>}
          <p className="text-xs text-slate-400 mt-3">
            Suas respostas ficam salvas conforme você preenche. O link tem prazo de validade —
            se expirar, peça um novo ao atendente.
          </p>
        </div>

        {grupos.map(([grupo, lista]) => (
          <div key={grupo} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">{grupo}</h2>
            <div className="space-y-5">
              {lista.map((p) => (
                <CampoTriagem key={p.chave} pergunta={p} valor={respostas[p.chave]}
                  pendente={faltando.has(p.chave)}
                  anexos={anexos.filter((a) => a.chave === p.chave)
                    .map((a) => ({ ...a, url: previas[a.nome] }))}
                  onEnviar={(l) => enviarArquivos(p.chave, l)}
                  onRemover={removerArquivo}
                  onChange={(v) => void responder(p.chave, v)} />
              ))}
            </div>
          </div>
        ))}

        {erro && (
          <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-200">{erro}</p>
          </div>
        )}

        <button onClick={enviar} disabled={enviando}
          className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl py-3">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar respostas
        </button>
      </div>
    </div>
  )
}
