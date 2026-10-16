import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  ClipboardList, Loader2, Plus, Search, AlertTriangle, ExternalLink, Clock,
  CheckCircle2, Link2, Users, Camera, MailCheck, Ban, Trash2, RotateCcw,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { AtendimentoTriagem, ModeloTriagem } from '../../types'

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: 'Rascunho', classe: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  em_triagem: { rotulo: 'Em triagem', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  aguardando_cliente: { rotulo: 'Aguardando cliente', classe: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  respondido: { rotulo: 'Cliente respondeu', classe: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  cancelado: { rotulo: 'Cancelada', classe: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  concluido: { rotulo: 'Processo aberto', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
}

const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '—')
const formatarDoc = (d?: string | null) => {
  const n = String(d ?? '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d || '—'
}

export function Triagem() {
  const { toast } = useToast()
  const navegar = useNavigate()
  const [modelos, setModelos] = useState<ModeloTriagem[]>([])
  const [atendimentos, setAtendimentos] = useState<AtendimentoTriagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')
  const [filtroModelo, setFiltroModelo] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const [gerando, setGerando] = useState<number | null>(null)
  const [encerrar, setEncerrar] = useState<
    { atendimento: AtendimentoTriagem; modo: 'cancelar' | 'excluir' } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [encerrando, setEncerrando] = useState(false)
  const [novo, setNovo] = useState<
    { modelo: string; clienteId: string; clienteNome: string; contato: string; telefone: string } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [m, a] = await Promise.all([
        api.getModelosTriagem(),
        api.getAtendimentosTriagem({
          situacao: filtroSituacao || undefined,
          modelo: filtroModelo || undefined,
          busca: busca.trim() || undefined,
        }),
      ])
      setModelos(m)
      setAtendimentos(a)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar as triagens.')
    } finally {
      setCarregando(false)
    }
  }, [toast, filtroSituacao, filtroModelo, busca])

  useEffect(() => { void carregar() }, [carregar])

  const indicadores = useMemo(() => {
    const conta = (s: string) => atendimentos.filter((a) => a.situacao === s).length
    return [
      { rotulo: 'Em triagem', valor: conta('em_triagem'), icone: ClipboardList, cor: 'text-blue-600 dark:text-blue-400' },
      { rotulo: 'Aguardando cliente', valor: conta('aguardando_cliente'), icone: Clock, cor: 'text-amber-600 dark:text-amber-400' },
      { rotulo: 'Cliente respondeu', valor: conta('respondido'), icone: MailCheck, cor: 'text-violet-600 dark:text-violet-400' },
      {
        rotulo: 'Prontas p/ processo',
        valor: atendimentos.filter((a) => a.prontoParaProcesso).length,
        icone: CheckCircle2, cor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        rotulo: 'Prioridade alta',
        valor: atendimentos.filter((a) => a.prioridade === 'alta' && a.situacao !== 'concluido').length,
        icone: AlertTriangle, cor: 'text-red-600 dark:text-red-400',
      },
    ]
  }, [atendimentos])

  async function abrirTriagem() {
    if (!novo?.modelo) return toast.error('Escolha o tipo de triagem.')
    if (!novo.clienteId) return toast.error('Escolha o cliente na base.')
    setAbrindo(true)
    try {
      const r = await api.criarAtendimentoTriagem({
        modelo: novo.modelo,
        clienteId: Number(novo.clienteId),
        clienteNome: novo.clienteNome.trim() || undefined,
        contato: novo.contato.trim() || undefined,
        telefone: novo.telefone.trim() || undefined,
      })
      navegar(`/triagem/${r.id}`)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir a triagem.')
    } finally {
      setAbrindo(false)
    }
  }

  async function abrirProcesso(a: AtendimentoTriagem) {
    setGerando(a.id)
    try {
      const r = await api.concluirTriagem(a.id)
      toast.success(`Processo #${r.processoId} aberto — ${r.cenario}.`)
      if (r.efeito) toast.info(r.efeito)
      // Leva direto para a edição do processo: o que a triagem definiu é ponto de partida,
      // etapa, responsável, prazo e checklist ainda são decisão de quem vai tocar.
      navegar(`/implantacao?editar=${r.processoId}`)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir o processo.')
    } finally {
      setGerando(null)
    }
  }

  async function confirmarEncerramento() {
    if (!encerrar) return
    setEncerrando(true)
    try {
      if (encerrar.modo === 'cancelar') {
        await api.cancelarTriagem(encerrar.atendimento.id, motivo.trim() || undefined)
        toast.success('Triagem cancelada.')
      } else {
        const r = await api.excluirTriagem(encerrar.atendimento.id)
        toast.success(r.arquivosRemovidos > 0
          ? `Triagem excluída, com ${r.arquivosRemovidos} arquivo(s).`
          : 'Triagem excluída.')
      }
      setEncerrar(null)
      setMotivo('')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível concluir a ação.')
    } finally {
      setEncerrando(false)
    }
  }

  async function reabrir(a: AtendimentoTriagem) {
    try {
      await api.reabrirTriagem(a.id)
      toast.success('Triagem reaberta.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível reabrir.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white"><ClipboardList size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Triagem Guiada</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Atendimento padronizado. Ao concluir, abre o processo no Pipeline.
            </p>
          </div>
        </div>
        <Button onClick={() => setNovo({ modelo: modelos[0]?.slug ?? '', clienteId: '', clienteNome: '', contato: '', telefone: '' })}>
          <Plus className="w-4 h-4" /> Nova triagem
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {indicadores.map((k) => (
          <div key={k.rotulo} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">{k.rotulo}</p>
                <p className={clsx('text-2xl font-bold mt-0.5', k.cor)}>{k.valor}</p>
              </div>
              <k.icone className={clsx('w-4 h-4 mt-1', k.cor)} />
            </div>
          </div>
        ))}
      </div>

      {novo && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Nova triagem</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo de triagem</label>
              <select className="input-field w-full" value={novo.modelo}
                onChange={(e) => setNovo({ ...novo, modelo: e.target.value })}>
                <option value="">Selecione...</option>
                {modelos.map((m) => <option key={m.slug} value={m.slug}>{m.nome}</option>)}
              </select>
            </div>
            <ClienteSearch label="Cliente" value={novo.clienteId}
              onChange={(id, c) => setNovo({ ...novo, clienteId: id, clienteNome: c?.nome || c?.nomeRazao || '' })} />
            <div>
              <label className="block text-xs text-slate-500 mb-1">Quem está falando</label>
              <input className="input-field w-full" placeholder="Nome de quem entrou em contato"
                value={novo.contato} onChange={(e) => setNovo({ ...novo, contato: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">WhatsApp do contato</label>
              <div className="flex gap-2">
                <input className="input-field w-full" placeholder="(00) 00000-0000"
                  value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
                <Button disabled={abrindo} onClick={abrirTriagem}>
                  {abrindo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Abrir'}
                </Button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            CNPJ, razão social, nome fantasia e e-mail vêm do cadastro do cliente. Só o nome de
            quem ligou e o WhatsApp dele precisam ser digitados.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input-field pl-9" placeholder="Buscar por cliente, CNPJ ou contato..."
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input-field w-full sm:w-52" value={filtroSituacao}
          onChange={(e) => setFiltroSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          {Object.entries(SITUACAO).map(([v, s]) => <option key={v} value={v}>{s.rotulo}</option>)}
        </select>
        <select className="input-field w-full sm:w-56" value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {modelos.map((m) => <option key={m.slug} value={m.slug}>{m.nome}</option>)}
        </select>
      </div>

      {carregando && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}

      {!carregando && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-left text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Triagem</th>
                  <th className="px-4 py-2.5 font-medium">Cenário</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Atualizado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {atendimentos.map((a) => (
                  <tr key={a.id}
                    className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                    onClick={() => navegar(`/triagem/${a.id}`)}>
                    <td className="px-4 py-2.5">
                      <p className="text-slate-800 dark:text-slate-200">{a.clienteNome || 'Sem nome'}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatarDoc(a.cnpj)}
                        {a.contato ? ` · ${a.contato}` : ''}
                        {!a.clienteId && <span className="text-amber-500"> · sem cadastro</span>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{a.modelo}</td>
                    <td className="px-4 py-2.5">
                      {a.cenario ? (
                        <span className="text-xs text-slate-700 dark:text-slate-300">
                          {a.prioridade === 'alta' && (
                            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-500" />
                          )}
                          {a.cenario}
                        </span>
                      ) : <span className="text-xs text-slate-400">a identificar</span>}
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {(a.fotos ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 mr-2 text-slate-500">
                            <Camera className="w-3 h-3" /> {a.fotos}
                          </span>
                        )}
                        {(a.pendentes ?? 0) > 0 && `${a.pendentes} obrigatória(s) em aberto`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-xs px-2 py-1 rounded-full font-medium',
                        SITUACAO[a.situacao]?.classe ?? SITUACAO.rascunho.classe)}>
                        {SITUACAO[a.situacao]?.rotulo ?? a.situacao}
                      </span>
                      {a.token && a.situacao === 'aguardando_cliente' && (
                        <Link2 className="w-3.5 h-3.5 inline ml-1.5 text-amber-500" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {dataHora(a.atualizadoEm)}
                      {a.atendente && <span className="block text-[10px] text-slate-400">{a.atendente}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {a.processoId ? (
                        <a href={`/implantacao?processo=${a.processoId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">
                          Processo #{a.processoId} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {a.prontoParaProcesso && (
                            <Button size="sm" disabled={gerando === a.id}
                              onClick={(e) => { e.stopPropagation(); void abrirProcesso(a) }}>
                              {gerando === a.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Abrir processo
                            </Button>
                          )}
                          {a.situacao === 'cancelado' ? (
                            <button title="Reabrir triagem"
                              onClick={(e) => { e.stopPropagation(); void reabrir(a) }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button title="Cancelar triagem"
                              onClick={(e) => { e.stopPropagation(); setMotivo(''); setEncerrar({ atendimento: a, modo: 'cancelar' }) }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button title="Excluir triagem"
                            onClick={(e) => { e.stopPropagation(); setMotivo(''); setEncerrar({ atendimento: a, modo: 'excluir' }) }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {atendimentos.length === 0 && (
                  <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    <Users className="w-5 h-5 mx-auto mb-2 text-slate-300" />
                    Nenhuma triagem com esses filtros.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={!!encerrar} onClose={() => !encerrando && setEncerrar(null)}
        title={encerrar?.modo === 'excluir' ? 'Excluir triagem' : 'Cancelar triagem'} size="sm">
        {encerrar && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {encerrar.atendimento.clienteNome || 'Cliente sem nome'} ·{' '}
              {encerrar.atendimento.modelo}
            </p>
            {encerrar.modo === 'excluir' ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                A triagem e os arquivos enviados são apagados definitivamente. Não dá para
                desfazer. Se a intenção é só tirar da lista, cancele em vez de excluir.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  A triagem sai da lista e o link do cliente deixa de valer. O registro
                  continua no sistema e pode ser reaberto.
                </p>
                <textarea className="input-field w-full min-h-[4rem]" value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (opcional): desistiu, duplicada, trote..." />
              </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEncerrar(null)} disabled={encerrando}>
                Voltar
              </Button>
              <Button variant={encerrar.modo === 'excluir' ? 'danger' : 'primary'}
                onClick={confirmarEncerramento} disabled={encerrando}>
                {encerrando && <Loader2 className="w-4 h-4 animate-spin" />}
                {encerrar.modo === 'excluir' ? 'Excluir definitivamente' : 'Cancelar triagem'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
