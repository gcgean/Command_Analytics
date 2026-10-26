import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Send, Loader2, Users, Search, CheckCircle2, AlertTriangle, History, Megaphone, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { ComunicadoHistorico, DestinatarioComunicado, EntregaComunicado } from '../../types'

const MAX = 4000

export function Comunicados() {
  const { toast } = useToast()
  const [destinatarios, setDestinatarios] = useState<DestinatarioComunicado[]>([])
  const [historico, setHistorico] = useState<ComunicadoHistorico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [detalhe, setDetalhe] = useState<{ id: number; linhas: EntregaComunicado[] } | null>(null)
  const [reenviando, setReenviando] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [d, h] = await Promise.all([
        api.getDestinatariosComunicado(),
        api.getHistoricoComunicados().catch(() => []),
      ])
      setDestinatarios(d)
      // Começa com todos os ativos marcados: o caso comum é falar com a equipe inteira.
      setSelecionados(d.filter((x) => x.ativo).map((x) => x.id))
      setHistorico(h)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os destinatários.')
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => { void carregar() }, [carregar])

  // Reenvio é manual de propósito: o erro que aparece no histórico é timeout do relay, e
  // timeout não diz se a mensagem chegou — repetir sozinho duplicaria para quem já recebeu.
  async function reenviar(id: number) {
    setReenviando(id)
    try {
      const r = await api.reenviarComunicado(id)
      if (r.falhas > 0) toast.error(`${r.entregues} entregue(s), ${r.falhas} ainda falhando.`)
      else toast.success(`${r.entregues} entregue(s) no reenvio.`)
      const h = await api.getHistoricoComunicados().catch(() => [])
      setHistorico(h)
      if (detalhe?.id === id) {
        setDetalhe({ id, linhas: await api.getEntregasComunicado(id).catch(() => []) })
      }
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível reenviar.')
    } finally {
      setReenviando(null)
    }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return destinatarios
    return destinatarios.filter((d) => d.nome.toLowerCase().includes(termo)
      || (d.login ?? '').toLowerCase().includes(termo))
  }, [destinatarios, busca])

  const ativos = destinatarios.filter((d) => d.ativo)

  async function enviar() {
    if (!mensagem.trim()) return toast.error('Escreva a mensagem.')
    if (selecionados.length === 0) return toast.error('Escolha pelo menos um destinatário.')
    const todos = selecionados.length === ativos.length
    const aviso = todos
      ? `Enviar para TODOS os ${selecionados.length} usuários vinculados?`
      : `Enviar para ${selecionados.length} usuário(s)?`
    if (!confirm(`${aviso}\n\nA mensagem não pode ser apagada depois de enviada.`)) return

    setEnviando(true)
    try {
      const r = await api.enviarComunicado({
        titulo: titulo.trim() || undefined,
        mensagem: mensagem.trim(),
        usuarios: selecionados,
      })
      if (r.falhas > 0) {
        toast.error(`${r.entregues} entregue(s), ${r.falhas} falha(s). Veja o histórico.`)
      } else {
        toast.success(`Comunicado entregue a ${r.entregues} usuário(s).`)
      }
      setTitulo('')
      setMensagem('')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar o comunicado.')
    } finally {
      setEnviando(false)
    }
  }

  async function verEntregas(id: number) {
    if (detalhe?.id === id) return setDetalhe(null)
    try {
      setDetalhe({ id, linhas: await api.getEntregasComunicado(id) })
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar as entregas.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-sky-600 text-white"><Megaphone size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Comunicados</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Uma mensagem pelo Telegram para vários usuários de uma vez.
          </p>
        </div>
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>}

      {!carregando && destinatarios.length === 0 && (
        <Card><p className="text-sm text-slate-500 py-8 text-center">
          Nenhum usuário tem o Telegram vinculado ainda. Cada pessoa precisa vincular a própria
          conta antes de poder receber comunicados.
        </p></Card>
      )}

      {!carregando && destinatarios.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* Mensagem */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
                    Título (opcional)
                  </label>
                  <input className="input-field" placeholder="Ex.: Manutenção programada no sábado"
                    value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">Mensagem</label>
                    <span className={clsx('text-[11px]',
                      mensagem.length > MAX ? 'text-red-500' : 'text-slate-400')}>
                      {mensagem.length} / {MAX}
                    </span>
                  </div>
                  <textarea className="input-field font-mono text-sm" rows={9}
                    placeholder="Escreva o comunicado..."
                    value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                  <p className="text-[11px] text-slate-400 mt-1">
                    O Telegram aceita formatação: *negrito*, _itálico_, `código`.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-500">
                    {selecionados.length === 0
                      ? 'Nenhum destinatário selecionado'
                      : selecionados.length === ativos.length
                        ? `Todos os ${selecionados.length} usuários vinculados`
                        : `${selecionados.length} de ${ativos.length} usuários`}
                  </span>
                  <Button disabled={enviando || !mensagem.trim() || mensagem.length > MAX
                    || selecionados.length === 0} onClick={enviar}>
                    {enviando
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                      : <><Send className="w-4 h-4" /> Enviar comunicado</>}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Histórico */}
            <Card padding="none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <History className="w-4 h-4" /> Comunicados enviados
                </h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[28rem] overflow-y-auto">
                {historico.map((c) => (
                  <div key={c.id}>
                    <button onClick={() => verEntregas(c.id)}
                      className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {c.titulo && (
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.titulo}</p>
                          )}
                          <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">{c.mensagem}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {new Date(c.criadoEm).toLocaleString('pt-BR')}
                            {c.autor ? ` · ${c.autor}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {c.entregues}
                          </span>
                          {c.falhas > 0 && (
                            <span className="block text-xs text-red-500 mt-0.5">{c.falhas} falha(s)</span>
                          )}
                          {c.falhas > 0 && (
                            <span role="button" tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); void reenviar(c.id) }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void reenviar(c.id) } }}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer">
                              {reenviando === c.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />}
                              Reenviar aos que falharam
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    {detalhe?.id === c.id && (
                      <div className="px-4 pb-3 bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          {detalhe.linhas.map((l) => (
                            <span key={l.usuarioId} title={l.erro ?? undefined}
                              className={clsx('text-[11px] px-2 py-0.5 rounded-full',
                                l.entregue
                                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300')}>
                              {l.nome}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {historico.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">Nenhum comunicado enviado ainda.</p>
                )}
              </div>
            </Card>
          </div>

          {/* Destinatários */}
          <div className="lg:col-span-2">
            <Card padding="none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Destinatários
                  </h2>
                  <div className="flex gap-2 text-xs">
                    <button className="text-sky-600 dark:text-sky-400 hover:underline"
                      onClick={() => setSelecionados(ativos.map((d) => d.id))}>todos</button>
                    <button className="text-slate-500 hover:underline"
                      onClick={() => setSelecionados([])}>nenhum</button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input-field pl-9" placeholder="Buscar pessoa..."
                    value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[32rem] overflow-y-auto">
                {visiveis.map((d) => (
                  <label key={d.id}
                    className={clsx('flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40',
                      !d.ativo && 'opacity-60')}>
                    <input type="checkbox" className="accent-sky-600" checked={selecionados.includes(d.id)}
                      onChange={(e) => setSelecionados((atual) => e.target.checked
                        ? [...atual, d.id]
                        : atual.filter((x) => x !== d.id))} />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800 dark:text-slate-200 truncate">{d.nome}</span>
                      <span className="block text-[11px] text-slate-400">
                        {d.login}{!d.ativo && ' · usuário inativo'}
                      </span>
                    </span>
                  </label>
                ))}
                {visiveis.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">Ninguém encontrado.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
