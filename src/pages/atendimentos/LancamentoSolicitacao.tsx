import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import type { Solicitacao, Usuario } from '../../types'

type AbaForm = 'atendimento' | 'procedimentos' | 'finalizacao'

// Status oferecidos na abertura, iguais aos radios do lançamento legado.
const STATUS_ABERTURA: Array<[number, string]> = [
  [1, 'Em Fila'],
  [2, 'Em Atendimento'],
  [3, 'Aguardando Cliente'],
  [4, 'Aguardando Análise do Desenvolvimento'],
  [6, 'Aguardando Procedimento do Suporte'],
  [9, 'Aguardando Testes do desenvolvimento'],
]

const TIPOS_CONTATO: Array<[number, string]> = [
  [0, 'WhatsApp'],
  [1, 'Telefone'],
  [2, 'E-mail'],
  [3, 'Presencial'],
  [4, 'Outras mídias'],
]

interface Props {
  aberto: boolean
  /** null = novo atendimento; preenchido = alterar. */
  solicitacao: Solicitacao | null
  usuarios: Usuario[]
  onClose: () => void
  onSalvo: () => void
}

export function LancamentoSolicitacao({ aberto, solicitacao, usuarios, onClose, onSalvo }: Props) {
  const { toast } = useToast()
  const editando = !!solicitacao

  const [aba, setAba] = useState<AbaForm>('atendimento')
  const [salvando, setSalvando] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState(2)
  const [tipoContato, setTipoContato] = useState(0)
  const [tecnicoId, setTecnicoId] = useState('')
  const [desenvolvedorId, setDesenvolvedorId] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [foraHorario, setForaHorario] = useState(false)
  const [bugSistema, setBugSistema] = useState(false)
  const [solucao, setSolucao] = useState('')

  const [catalogo, setCatalogo] = useState<Array<{ id: number; descricao: string; pontuacao: number }>>([])
  const [efetuados, setEfetuados] = useState<Array<{ id: number; descricao: string; pontuacao: number; data: string }>>([])
  const [procSelecionado, setProcSelecionado] = useState('')

  // Recarrega o formulário toda vez que abre, pra não vazar dados do registro anterior.
  useEffect(() => {
    if (!aberto) return
    setAba('atendimento')
    setClienteId(solicitacao?.clienteId ? String(solicitacao.clienteId) : '')
    setObservacoes(solicitacao?.observacoes ?? '')
    setStatus(solicitacao?.status ?? 2)
    setTipoContato(0)
    setTecnicoId(solicitacao?.tecnicoId ? String(solicitacao.tecnicoId) : '')
    setDesenvolvedorId(solicitacao?.desenvolvedorId ? String(solicitacao.desenvolvedorId) : '')
    setUrgente(solicitacao?.prioritario === 'S')
    setForaHorario(false)
    setBugSistema(false)
    setSolucao(solicitacao?.solucao ?? '')
    setProcSelecionado('')
    setEfetuados([])
  }, [aberto, solicitacao])

  useEffect(() => {
    if (!aberto) return
    api.getCatalogoProcedimentos().then((r) => setCatalogo(r.data)).catch(() => setCatalogo([]))
  }, [aberto])

  const carregarEfetuados = () => {
    if (!solicitacao) return
    api.getProcedimentosSolicitacao(solicitacao.id).then((r) => setEfetuados(r.data)).catch(() => setEfetuados([]))
  }

  useEffect(() => {
    if (aberto && solicitacao && aba === 'procedimentos') carregarEfetuados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, solicitacao, aba])

  const salvar = async () => {
    if (!clienteId) return toast.error('Selecione o cliente.')
    if (!observacoes.trim()) return toast.error('Descreva os dados do atendimento.')

    setSalvando(true)
    try {
      if (editando) {
        await api.atualizarSolicitacao(solicitacao!.id, {
          clienteId: Number(clienteId),
          observacoes,
          solucao,
          tipoContato,
          tecnicoId: tecnicoId ? Number(tecnicoId) : null,
          desenvolvedorId: desenvolvedorId ? Number(desenvolvedorId) : null,
          urgente,
          foraHorario,
          bugSistema,
        })
        toast.success(`Solicitação #${solicitacao!.id} atualizada`)
      } else {
        const r = await api.criarSolicitacao({
          clienteId: Number(clienteId),
          observacoes,
          status,
          tipoContato,
          tecnicoId: tecnicoId ? Number(tecnicoId) : null,
          desenvolvedorId: desenvolvedorId ? Number(desenvolvedorId) : null,
          urgente,
          foraHorario,
          bugSistema,
        })
        toast.success(`Solicitação #${r.id} criada`)
      }
      onSalvo()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const finalizar = async () => {
    if (!solucao.trim()) return toast.error('Descreva a solução antes de finalizar.')
    setSalvando(true)
    try {
      await api.finalizarSolicitacao(solicitacao!.id, solucao)
      toast.success(`Solicitação #${solicitacao!.id} finalizada`)
      onSalvo()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível finalizar.')
    } finally {
      setSalvando(false)
    }
  }

  const abas: Array<[AbaForm, string]> = [
    ['atendimento', editando ? 'Alterar atendimento' : 'Salvar atendimento'],
    ['procedimentos', 'Procedimentos efetuados'],
    ['finalizacao', 'Finalização'],
  ]

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title={editando ? `Alterar atendimento #${solicitacao!.id}` : 'Novo atendimento'}
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {abas.map(([id, label]) => {
            // Procedimentos e finalização só fazem sentido sobre um atendimento que já existe.
            const bloqueada = !editando && id !== 'atendimento'
            return (
              <button
                key={id}
                type="button"
                disabled={bloqueada}
                title={bloqueada ? 'Salve o atendimento primeiro' : undefined}
                onClick={() => setAba(id)}
                className={clsx(
                  'px-3 py-2 text-xs font-medium border-b-2 -mb-px',
                  bloqueada && 'opacity-40 cursor-not-allowed',
                  aba === id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {aba === 'atendimento' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <ClienteSearch label="Cliente" value={clienteId} onChange={(id) => setClienteId(id)} required />
              <div>
                <label className="block text-xs text-slate-500 mb-1">Dados do Atendimento</label>
                <textarea
                  className="input w-full h-56 resize-none"
                  placeholder="O que o cliente está pedindo..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              {!editando && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status do Atendimento</label>
                  <select className="input w-full" value={status} onChange={(e) => setStatus(Number(e.target.value))}>
                    {STATUS_ABERTURA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Contato via</label>
                <select className="input w-full" value={tipoContato} onChange={(e) => setTipoContato(Number(e.target.value))}>
                  {TIPOS_CONTATO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Técnico</label>
                <select className="input w-full" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                  <option value="">(quem está lançando)</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome || u.nomeUsu}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Desenvolvedor</label>
                <select className="input w-full" value={desenvolvedorId} onChange={(e) => setDesenvolvedorId(e.target.value)}>
                  <option value="">(nenhum)</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome || u.nomeUsu}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
                Marcar como urgente
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={foraHorario} onChange={(e) => setForaHorario(e.target.checked)} />
                Atendimento fora do horário
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={bugSistema} onChange={(e) => setBugSistema(e.target.checked)} />
                Bug do sistema <span className="text-slate-400">(entra como prioridade A)</span>
              </label>
            </div>
          </div>
        )}

        {aba === 'procedimentos' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select className="input flex-1" value={procSelecionado} onChange={(e) => setProcSelecionado(e.target.value)}>
                <option value="">Selecione o procedimento...</option>
                {catalogo.map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
              </select>
              <button
                type="button"
                className="btn-primary flex items-center gap-1"
                disabled={!procSelecionado || salvando}
                onClick={async () => {
                  try {
                    await api.addProcedimentoSolicitacao(solicitacao!.id, Number(procSelecionado))
                    setProcSelecionado('')
                    carregarEfetuados()
                    toast.success('Procedimento registrado')
                  } catch (e: any) {
                    toast.error(e?.message || 'Falha ao registrar.')
                  }
                }}
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>

            {efetuados.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Nenhum procedimento registrado.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {efetuados.map((p) => (
                  <div key={`${p.id}-${p.data}`} className="flex items-center justify-between py-2 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">{p.descricao}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">{p.pontuacao} pts</span>
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-600"
                        onClick={async () => {
                          try {
                            await api.removeProcedimentoSolicitacao(solicitacao!.id, p.id)
                            carregarEfetuados()
                          } catch (e: any) {
                            toast.error(e?.message || 'Falha ao remover.')
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === 'finalizacao' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Solução aplicada</label>
              <textarea
                className="input w-full h-40 resize-none"
                placeholder="Descreva o que foi feito para resolver..."
                value={solucao}
                onChange={(e) => setSolucao(e.target.value)}
              />
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Finalizar marca a solicitação como concluída e carimba a data de finalização.
            </p>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={!solucao.trim() || salvando} onClick={finalizar}>
                {salvando ? <Loader2 size={14} className="animate-spin" /> : null} Finalizar atendimento
              </button>
            </div>
          </div>
        )}

        {aba === 'atendimento' && (
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button className="btn-secondary" onClick={onClose} disabled={salvando}>Sair</button>
            <button className="btn-primary flex items-center gap-1" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : null}
              {editando ? 'Salvar alterações' : 'Salvar atendimento'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
