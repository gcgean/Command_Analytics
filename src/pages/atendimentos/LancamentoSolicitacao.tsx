import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { ClienteSearch } from '../../components/ui/ClienteSearch'
import { Anexos } from '../../components/ui/Anexos'
import { AnexosDraft } from '../../components/ui/AnexosDraft'
import type { Projeto, Solicitacao, Usuario } from '../../types'

type AbaForm = 'atendimento' | 'procedimentos' | 'finalizacao'

// Status oferecidos na abertura, iguais aos radios do lançamento legado.
const STATUS_ABERTURA: Array<[number, string]> = [
  [1, 'Em Fila'],
  [2, 'Aguardando Desenvolvimento'],
  [3, 'Aguardando Cliente'],
  [4, 'Aguardando Análise do Desenvolvimento'],
  [6, 'Aguardando Procedimento do Suporte'],
  [9, 'Aguardando Testes do desenvolvimento'],
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
  // Removidos da UI, mas o backend ainda espera esses campos — mantidos com valor padrão fixo.
  const tipoContato = 0
  const foraHorario = false
  const [tecnicoId, setTecnicoId] = useState('')
  const [desenvolvedorId, setDesenvolvedorId] = useState('')
  const [projetoId, setProjetoId] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [bugSistema, setBugSistema] = useState(false)
  const [solucao, setSolucao] = useState('')

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [catalogo, setCatalogo] = useState<Array<{ id: number; descricao: string; pontuacao: number }>>([])
  const [efetuados, setEfetuados] = useState<Array<{ id: number; descricao: string; pontuacao: number; data: string }>>([])
  const [procSelecionado, setProcSelecionado] = useState('')
  const [anexosNovos, setAnexosNovos] = useState<File[]>([])

  // Recarrega o formulário toda vez que abre, pra não vazar dados do registro anterior.
  useEffect(() => {
    if (!aberto) return
    setAba('atendimento')
    setClienteId(solicitacao?.clienteId ? String(solicitacao.clienteId) : '')
    setObservacoes(solicitacao?.observacoes ?? '')
    setStatus(solicitacao?.status ?? 2)
    setTecnicoId(solicitacao?.tecnicoId ? String(solicitacao.tecnicoId) : '')
    setDesenvolvedorId(solicitacao?.desenvolvedorId ? String(solicitacao.desenvolvedorId) : '')
    setProjetoId(solicitacao?.projetoId ? String(solicitacao.projetoId) : '')
    setUrgente(solicitacao?.prioritario === 'S')
    setBugSistema(false)
    setSolucao(solicitacao?.solucao ?? '')
    setProcSelecionado('')
    setEfetuados([])
    setAnexosNovos([])
  }, [aberto, solicitacao])

  useEffect(() => {
    if (!aberto) return
    api.getCatalogoProcedimentos().then((r) => setCatalogo(r.data)).catch(() => setCatalogo([]))
    api.getProjetos(true).then(setProjetos).catch(() => setProjetos([]))
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
          projetoId: projetoId ? Number(projetoId) : null,
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
          projetoId: projetoId ? Number(projetoId) : null,
          urgente,
          foraHorario,
          bugSistema,
        })
        toast.success(`Solicitação #${r.id} criada`)
        if (anexosNovos.length) {
          try {
            await api.uploadAnexos({ tabela: 'atendimentos', registroId: r.id, files: anexosNovos })
          } catch (e: any) {
            toast.error(e?.message || 'Solicitação criada, mas falhou ao enviar os anexos.')
          }
        }
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

  // Procedimentos e finalização só fazem sentido sobre um atendimento que já existe — em vez
  // de mostrar desabilitadas no Novo Atendimento, nem aparecem até que exista o que editar.
  const abas: Array<[AbaForm, string]> = [
    ['atendimento', editando ? 'Alterar solicitação' : 'Salvar solicitação'],
    ...(editando ? ([['procedimentos', 'Procedimentos efetuados'], ['finalizacao', 'Finalização']] as Array<[AbaForm, string]>) : []),
  ]

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title={editando ? `Alterar solicitação #${solicitacao!.id}` : 'Nova Solicitação'}
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {abas.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={clsx(
                'px-3 py-2 text-xs font-medium border-b-2 -mb-px',
                aba === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {aba === 'atendimento' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <ClienteSearch label="Cliente" value={clienteId} onChange={(id) => setClienteId(id)} required />
              <Select
                label="Projeto"
                placeholder="(nenhum)"
                value={projetoId}
                onChange={(e) => setProjetoId(e.target.value)}
                options={projetos.map((p) => ({ value: p.id, label: p.nome }))}
              />
              <div>
                <label className="block text-xs text-slate-500 mb-1">Dados do Atendimento</label>
                <textarea
                  className="input w-full h-56 resize-none"
                  placeholder="O que o cliente está pedindo..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Anexos (fotos, vídeos, áudios)</label>
                {editando ? (
                  <Anexos tabela="atendimentos" registroId={solicitacao!.id} emptyLabel="Nenhum anexo ainda." />
                ) : (
                  <AnexosDraft files={anexosNovos} onChange={setAnexosNovos} />
                )}
              </div>
            </div>

            <div className="space-y-3">
              {!editando && (
                <Select
                  label="Status do Atendimento"
                  value={status}
                  onChange={(e) => setStatus(Number(e.target.value))}
                  options={STATUS_ABERTURA.map(([v, l]) => ({ value: v, label: l }))}
                />
              )}
              <Select
                label="Técnico"
                placeholder="(quem está lançando)"
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
                options={usuarios.map((u) => ({ value: u.id, label: u.nome || u.nomeUsu || '' }))}
              />
              <Select
                label="Desenvolvedor"
                placeholder="(nenhum)"
                value={desenvolvedorId}
                onChange={(e) => setDesenvolvedorId(e.target.value)}
                options={usuarios.map((u) => ({ value: u.id, label: u.nome || u.nomeUsu || '' }))}
              />

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
                Marcar como urgente
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
              <div className="flex-1">
                <Select
                  placeholder="Selecione o procedimento..."
                  value={procSelecionado}
                  onChange={(e) => setProcSelecionado(e.target.value)}
                  options={catalogo.map((p) => ({ value: p.id, label: p.descricao }))}
                />
              </div>
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
              {editando ? 'Salvar alterações' : 'Salvar solicitação'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
