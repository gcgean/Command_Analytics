import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
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

/** Rascunho vindo do assistente de IA — a pessoa ainda confere e edita tudo antes de salvar. */
export interface PrefillSolicitacao {
  clienteId?: number
  observacoes?: string
  status?: number
  projetoId?: number | null
  desenvolvedorId?: number | null
  urgente?: boolean
  bugSistema?: boolean
}

interface Props {
  aberto: boolean
  /** null = novo atendimento; preenchido = alterar. */
  solicitacao: Solicitacao | null
  usuarios: Usuario[]
  prefill?: PrefillSolicitacao | null
  onClose: () => void
  onSalvo: () => void
}

export function LancamentoSolicitacao({ aberto, solicitacao, usuarios, prefill, onClose, onSalvo }: Props) {
  const { toast } = useToast()
  const { user: usuarioLogado } = useAuthStore()
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
  // Pra quando a solicitação já foi resolvida e o lançamento é só pra deixar registrado.
  const [jaFinalizado, setJaFinalizado] = useState(false)
  // Texto reescrito pela IA — guarda o original pra desmarcar poder desfazer.
  const [melhorarIA, setMelhorarIA] = useState(false)
  const [melhorandoIA, setMelhorandoIA] = useState(false)
  const [textoOriginal, setTextoOriginal] = useState('')

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [catalogo, setCatalogo] = useState<Array<{ id: number; descricao: string; pontuacao: number }>>([])
  const [efetuados, setEfetuados] = useState<Array<{ id: number; descricao: string; pontuacao: number; data: string }>>([])
  const [procSelecionado, setProcSelecionado] = useState('')
  const [anexosNovos, setAnexosNovos] = useState<File[]>([])
  const [recarregarAnexos, setRecarregarAnexos] = useState(0)

  // Recarrega o formulário toda vez que abre, pra não vazar dados do registro anterior.
  useEffect(() => {
    if (!aberto) return
    setAba('atendimento')
    setClienteId(solicitacao?.clienteId ? String(solicitacao.clienteId) : prefill?.clienteId ? String(prefill.clienteId) : '')
    setObservacoes(solicitacao?.observacoes ?? prefill?.observacoes ?? '')
    setStatus(solicitacao?.status ?? prefill?.status ?? 2)
    // Sem técnico gravado, assume quem está mexendo — assim o campo nunca sai em branco e a
    // solicitação não perde o responsável numa alteração.
    setTecnicoId(
      solicitacao?.tecnicoId ? String(solicitacao.tecnicoId) : usuarioLogado?.id ? String(usuarioLogado.id) : ''
    )
    setDesenvolvedorId(
      solicitacao?.desenvolvedorId
        ? String(solicitacao.desenvolvedorId)
        : prefill?.desenvolvedorId
          ? String(prefill.desenvolvedorId)
          : ''
    )
    setProjetoId(
      solicitacao?.projetoId ? String(solicitacao.projetoId) : prefill?.projetoId ? String(prefill.projetoId) : ''
    )
    setUrgente(solicitacao ? solicitacao.prioritario === 'S' : !!prefill?.urgente)
    setBugSistema(solicitacao ? false : !!prefill?.bugSistema)
    setSolucao(solicitacao?.solucao ?? '')
    setJaFinalizado(false)
    setMelhorarIA(false)
    setMelhorandoIA(false)
    setTextoOriginal('')
    setProcSelecionado('')
    setEfetuados([])
    setAnexosNovos([])
  }, [aberto, solicitacao, prefill, usuarioLogado?.id])

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

  const alternarMelhoriaIA = async (marcado: boolean) => {
    if (!marcado) {
      // Desmarcar desfaz: volta exatamente o que a pessoa tinha escrito.
      setObservacoes(textoOriginal)
      setMelhorarIA(false)
      return
    }
    if (!observacoes.trim()) {
      toast.error('Escreva a solicitação antes de melhorar com IA.')
      return
    }

    setMelhorandoIA(true)
    try {
      const original = observacoes
      const r = await api.melhorarDescricaoIA(original)
      setTextoOriginal(original)
      setObservacoes(r.texto)
      setMelhorarIA(true)
      toast.success('Descrição reescrita — confira antes de salvar.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível melhorar a descrição.')
    } finally {
      setMelhorandoIA(false)
    }
  }

  /**
   * Colar print (Ctrl+V) vira anexo. A área de transferência entrega a imagem como blob sem nome,
   * então batiza com a hora — senão todos os prints chegariam como "image.png" e ficaria impossível
   * distinguir um do outro na lista.
   */
  const aoColar = async (e: React.ClipboardEvent) => {
    const imagens = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith('image/'))
    if (!imagens.length) return
    e.preventDefault()

    const agora = new Date()
    const carimbo = `${agora.getHours()}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}`
    const arquivos = imagens
      .map((item, i) => {
        const blob = item.getAsFile()
        if (!blob) return null
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        return new File([blob], `print-${carimbo}${imagens.length > 1 ? `-${i + 1}` : ''}.${ext}`, { type: blob.type })
      })
      .filter((f): f is File => !!f)
    if (!arquivos.length) return

    if (!editando) {
      setAnexosNovos((atuais) => [...atuais, ...arquivos])
      toast.success(`${arquivos.length} print anexado — será enviado ao salvar.`)
      return
    }

    // Alterando um registro que já existe: sobe na hora, igual ao botão Selecionar faz.
    try {
      await api.uploadAnexos({ tabela: 'atendimentos', registroId: solicitacao!.id, files: arquivos })
      setRecarregarAnexos((n) => n + 1)
      toast.success(`${arquivos.length} print anexado.`)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível anexar o print.')
    }
  }

  const salvar = async () => {
    if (!clienteId) return toast.error('Selecione o cliente.')
    if (!observacoes.trim()) return toast.error('Descreva os dados do atendimento.')
    if (!editando && !desenvolvedorId) return toast.error('Selecione o desenvolvedor responsável.')
    if (!projetoId) return toast.error('Informe o projeto da solicitação.')
    if (!editando && jaFinalizado && !solucao.trim()) return toast.error('Descreva a solução pra marcar como finalizado.')

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
        if (jaFinalizado) {
          try {
            await api.finalizarSolicitacao(r.id, solucao.trim())
            toast.success(`Solicitação #${r.id} já entrou finalizada`)
          } catch (e: any) {
            toast.error(e?.message || 'Solicitação criada, mas falhou ao marcar como finalizada.')
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
      {/* onPaste no formulário inteiro: o print cola estando o cursor na descrição ou em qualquer
          outro campo, sem exigir clicar na caixa de anexos antes. */}
      <div className="space-y-4" onPaste={aoColar}>
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
                label="Projeto *"
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
                <label className="block text-xs text-slate-500 mb-1">Anexos (fotos, vídeos, áudios) <span className="text-slate-400">— ou cole um print com Ctrl+V</span></label>
                {editando ? (
                  <Anexos key={recarregarAnexos} tabela="atendimentos" registroId={solicitacao!.id} emptyLabel="Nenhum anexo ainda." />
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
                label={editando ? 'Desenvolvedor' : 'Desenvolvedor *'}
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
              <label className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400 font-medium">
                <input
                  type="checkbox"
                  checked={melhorarIA}
                  disabled={melhorandoIA}
                  onChange={(e) => alternarMelhoriaIA(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {melhorandoIA ? 'Melhorando descrição com IA...' : 'Melhorar descrição com IA'}
                  <span className="block text-slate-400 font-normal">
                    Reescreve como problema + solução sugerida. Desmarque para voltar ao texto original.
                  </span>
                </span>
                {melhorandoIA && <Loader2 size={13} className="animate-spin mt-0.5 flex-shrink-0" />}
              </label>

              {!editando && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                  <label className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <input type="checkbox" checked={jaFinalizado} onChange={(e) => setJaFinalizado(e.target.checked)} />
                    Já foi resolvido — marcar como finalizado ao salvar
                  </label>
                  {jaFinalizado && (
                    <textarea
                      className="input w-full h-20 resize-none mt-2 text-xs"
                      placeholder="Descreva a solução aplicada..."
                      value={solucao}
                      onChange={(e) => setSolucao(e.target.value)}
                    />
                  )}
                </div>
              )}
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
              {editando ? 'Salvar alterações' : jaFinalizado ? 'Salvar já finalizado' : 'Salvar solicitação'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
