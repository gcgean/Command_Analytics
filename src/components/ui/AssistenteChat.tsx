import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Send, Loader2, CalendarPlus, Clock3 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../services/api'
import clsx from 'clsx'

function MensagemFormatada({ texto, corUser }: { texto: string; corUser: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className={clsx('underline', corUser ? 'text-white' : 'text-blue-500')}>
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className={clsx('px-1 py-0.5 rounded text-[11px]', corUser ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-800')}>
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-1.5 rounded-lg border border-slate-200 dark:border-slate-600">
            <table className="w-full text-[11px] border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className={clsx(corUser ? 'bg-white/10' : 'bg-slate-200 dark:bg-slate-800')}>{children}</thead>,
        th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border-b border-slate-300 dark:border-slate-600">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 border-b border-slate-200/60 dark:border-slate-700/60 align-top">{children}</td>,
      }}
    >
      {texto}
    </ReactMarkdown>
  )
}

interface MensagemChat {
  papel: 'user' | 'assistant'
  conteudo: string
  proposta?: { ferramenta: string; dados: Record<string, any> } | null
}

const SUGESTOES = [
  'Qual o saldo de horas do João?',
  'Quais os agendamentos de hoje?',
  'Últimos atendimentos do cliente X',
]

export function AssistenteChat() {
  const navigate = useNavigate()
  const [disponivel, setDisponivel] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    api.getAssistenteStatus().then(r => setDisponivel(r.disponivel)).catch(() => setDisponivel(false))
  }, [])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto])

  if (!disponivel) return null

  async function enviar(mensagem?: string) {
    const conteudo = (mensagem ?? texto).trim()
    if (!conteudo || enviando) return
    const novoHistorico: MensagemChat[] = [...mensagens, { papel: 'user', conteudo }]
    setMensagens(novoHistorico)
    setTexto('')
    setEnviando(true)
    try {
      const resposta = await api.conversarAssistente(
        novoHistorico.map(m => ({ papel: m.papel, conteudo: m.conteudo }))
      )
      setMensagens(prev => [...prev, { papel: 'assistant', conteudo: resposta.texto, proposta: resposta.proposta }])
    } catch (e: any) {
      setMensagens(prev => [...prev, { papel: 'assistant', conteudo: e?.message || 'Falha ao falar com o assistente.' }])
    } finally {
      setEnviando(false)
    }
  }

  function confirmarProposta(proposta: { ferramenta: string; dados: Record<string, any> }) {
    setAberto(false)
    if (proposta.ferramenta === 'criar_agendamento') {
      navigate('/agenda', {
        state: {
          criarAgendamentoPrefill: {
            clienteId: proposta.dados.clienteId,
            clienteNome: proposta.dados.clienteNome,
            tecnicoId: proposta.dados.tecnicoId,
            tipo: proposta.dados.tipo,
            data: proposta.dados.data,
            horaInicio: proposta.dados.horaInicio,
            horaFim: proposta.dados.horaFim,
            observacao: proposta.dados.observacoes,
          },
        },
      })
    } else if (proposta.ferramenta === 'lancar_horas') {
      navigate('/banco-horas', {
        state: {
          lancarHorasPrefill: {
            funcionarioId: proposta.dados.funcionarioId,
            tipo: proposta.dados.tipo,
            horas: proposta.dados.horas,
            dataInicio: proposta.dados.dataInicio,
            dataFim: proposta.dados.dataFim,
            observacao: proposta.dados.observacao,
          },
        },
      })
    } else if (proposta.ferramenta === 'acao_conexao') {
      navigate('/conexoes', {
        state: {
          acaoConexaoPrefill: {
            servidorId: proposta.dados.servidorId,
            connectionId: proposta.dados.connectionId,
            connectionName: proposta.dados.connectionName,
            acao: proposta.dados.acao,
          },
        },
      })
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #0668E1 0%, #0084FF 55%, #00C6FF 100%)' }}
        title="Assistente de IA"
      >
        {aberto ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {/* Painel do chat */}
      {aberto && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-8rem))] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          <div
            className="px-4 py-3 flex items-center gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, #0668E1 0%, #0084FF 55%, #00C6FF 100%)' }}
          >
            <Sparkles size={18} />
            <div>
              <p className="text-sm font-semibold leading-tight">Assistente Command Analytics</p>
              <p className="text-[11px] text-white/80 leading-tight">Consulta dados e prepara ações pra você confirmar</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {mensagens.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Experimente perguntar:</p>
                {SUGESTOES.map(s => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className={clsx('flex', m.papel === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                    m.papel === 'user'
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm'
                  )}
                >
                  <MensagemFormatada texto={m.conteudo} corUser={m.papel === 'user'} />
                  {m.proposta && (
                    <button
                      type="button"
                      onClick={() => confirmarProposta(m.proposta!)}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-slate-900"
                    >
                      {m.proposta.ferramenta === 'lancar_horas' ? <Clock3 size={13} /> : <CalendarPlus size={13} />}
                      Abrir e conferir
                    </button>
                  )}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-700 rounded-xl rounded-bl-sm px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-slate-500" />
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <div className="p-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Digite sua pergunta..."
              className="flex-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => enviar()}
              disabled={enviando || !texto.trim()}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
