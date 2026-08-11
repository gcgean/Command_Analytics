import { useEffect, useState } from 'react'
import { Bell, Plus, Pencil, Trash2, X, Check, Loader2, Power, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import type { LembreteFixoRegra, LembreteFixoLegado, TipoRecorrenciaLembrete, Usuario } from '../../types'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const TIPO_OPCOES: { value: TipoRecorrenciaLembrete; label: string }[] = [
  { value: 'DIARIO', label: 'Todo dia' },
  { value: 'A_CADA_N_DIAS', label: 'A cada N dias' },
  { value: 'DIA_MES', label: 'Dia específico do mês' },
  { value: 'DIA_SEMANA', label: 'Dia da semana' },
]

type FormState = {
  usuarioId: string
  titulo: string
  mensagem: string
  tipoRecorrencia: TipoRecorrenciaLembrete
  intervaloDias: string
  diaMes: string
  diaSemana: string
  hora: string
  somenteUsuarioVisualizar: boolean
}

const FORM_VAZIO: FormState = {
  usuarioId: '',
  titulo: '',
  mensagem: '',
  tipoRecorrencia: 'DIARIO',
  intervaloDias: '5',
  diaMes: '1',
  diaSemana: '2',
  hora: '08:00',
  somenteUsuarioVisualizar: true,
}

export function LembretesFixos() {
  const { toast } = useToast()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [regras, setRegras] = useState<LembreteFixoRegra[]>([])
  const [legado, setLegado] = useState<LembreteFixoLegado[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)

  async function carregar() {
    setLoading(true)
    try {
      const [lista, users] = await Promise.all([api.getLembretesFixos(), api.getUsuarios()])
      setRegras(lista.regras)
      setLegado(lista.legado)
      setUsuarios(users)
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os lembretes fixos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirNovo() {
    setEditandoId(null)
    setForm({ ...FORM_VAZIO, usuarioId: usuarios[0] ? String(usuarios[0].id) : '' })
    setModalAberto(true)
  }

  function abrirEdicao(r: LembreteFixoRegra) {
    setEditandoId(r.id)
    setForm({
      usuarioId: String(r.usuarioId),
      titulo: r.titulo,
      mensagem: r.mensagem,
      tipoRecorrencia: r.tipoRecorrencia,
      intervaloDias: String(r.intervaloDias ?? 5),
      diaMes: String(r.diaMes ?? 1),
      diaSemana: String(r.diaSemana ?? 2),
      hora: r.hora || '08:00',
      somenteUsuarioVisualizar: r.somenteUsuarioVisualizar !== 'N',
    })
    setModalAberto(true)
  }

  function fecharModal() {
    if (salvando) return
    setModalAberto(false)
  }

  async function salvar() {
    if (!form.usuarioId) return toast.error('Selecione o usuário.')
    if (!form.titulo.trim()) return toast.error('Informe o título.')
    if (!form.mensagem.trim()) return toast.error('Informe a mensagem.')
    if (!form.hora) return toast.error('Selecione o horário do lembrete.')

    const payload = {
      usuarioId: Number(form.usuarioId),
      titulo: form.titulo.trim(),
      mensagem: form.mensagem.trim(),
      tipoRecorrencia: form.tipoRecorrencia,
      intervaloDias: form.tipoRecorrencia === 'A_CADA_N_DIAS' ? Number(form.intervaloDias) : undefined,
      diaMes: form.tipoRecorrencia === 'DIA_MES' ? Number(form.diaMes) : undefined,
      diaSemana: form.tipoRecorrencia === 'DIA_SEMANA' ? Number(form.diaSemana) : undefined,
      hora: form.hora,
      somenteUsuarioVisualizar: form.somenteUsuarioVisualizar,
    }

    setSalvando(true)
    try {
      if (editandoId !== null) {
        await api.updateLembreteFixo(editandoId, payload)
        toast.success('Lembrete atualizado.')
      } else {
        await api.createLembreteFixo(payload)
        toast.success('Lembrete criado.')
      }
      setModalAberto(false)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar o lembrete.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(r: LembreteFixoRegra) {
    setSalvando(true)
    try {
      await api.updateLembreteFixo(r.id, { ativo: !r.ativo })
      toast.success(r.ativo ? 'Lembrete desativado.' : 'Lembrete ativado.')
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar o lembrete.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(r: LembreteFixoRegra) {
    if (!window.confirm(`Remover o lembrete "${r.titulo}" de ${r.usuarioNome}?`)) return
    setSalvando(true)
    try {
      await api.deleteLembreteFixo(r.id)
      toast.success('Lembrete removido.')
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível remover o lembrete.')
    } finally {
      setSalvando(false)
    }
  }

  async function removerLegado(item: LembreteFixoLegado) {
    if (!window.confirm(`Remover todas as ${item.totalDias} ocorrência(s) de "${item.titulo}" para ${item.usuarioNome}? Essa ação não pode ser desfeita.`)) return
    setSalvando(true)
    try {
      await api.deleteLinhasLembreteLegado(item.ids)
      toast.success('Lembrete legado removido.')
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível remover.')
    } finally {
      setSalvando(false)
    }
  }

  const usuarioOptions = usuarios.map((u) => ({ value: String(u.id), label: u.nome }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 rounded-lg">
            <Bell className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Lembretes Fixos</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Avisos recorrentes por usuário (notificação na plataforma + Telegram), sem precisar de um agendamento com cliente.
            </p>
          </div>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={abrirNovo}>Novo lembrete</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                {['Usuário', 'Título', 'Mensagem', 'Recorrência', 'Horário', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : regras.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Nenhum lembrete cadastrado ainda.</td></tr>
              ) : (
                regras.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{r.usuarioNome}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.titulo}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-sm truncate">{r.mensagem}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.descricaoRecorrencia}</td>
                    <td className="px-4 py-3">
                      {r.hora ? (
                        <span className="text-slate-600 dark:text-slate-300">{r.hora}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium" title="Sem horário definido — dispara a qualquer hora do dia. Edite e escolha um horário.">
                          <AlertTriangle className="w-3.5 h-3.5" /> Sem horário
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        r.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      )}>
                        {r.ativo ? 'Ativo' : 'Desativado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => alternarAtivo(r)} disabled={salvando} title={r.ativo ? 'Desativar' : 'Ativar'}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => abrirEdicao(r)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button onClick={() => remover(r)} className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-500/30 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5" /> Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {legado.length > 0 && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lembretes legados</h3>
            <p className="text-xs text-slate-500 mt-0.5">Cadastrados antes desta tela existir. Continuam disparando normalmente — só não têm a regra de recorrência editável, apenas remoção.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  {['Usuário', 'Título', 'Mensagem', 'Ocorrências', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {legado.map((l, i) => (
                  <tr key={`${l.usuarioId}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{l.usuarioNome}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{l.titulo || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-sm truncate">{l.mensagem}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{l.totalDias} dia(s)/mês</td>
                    <td className="px-4 py-3">
                      <button onClick={() => removerLegado(l)} disabled={salvando} className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-500/30 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" /> Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editandoId !== null ? 'Editar lembrete' : 'Novo lembrete'}
              </h2>
              <button onClick={fecharModal} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Select
                label="Usuário"
                options={usuarioOptions}
                value={form.usuarioId}
                onChange={(e) => setForm((f) => ({ ...f, usuarioId: e.target.value }))}
              />
              <Input
                label="Título"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex.: Importar os atendimentos"
              />
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Mensagem</label>
                <textarea
                  value={form.mensagem}
                  onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
                  rows={3}
                  maxLength={255}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
                  placeholder="Texto do lembrete"
                />
              </div>
              <Select
                label="Recorrência"
                options={TIPO_OPCOES}
                value={form.tipoRecorrencia}
                onChange={(e) => setForm((f) => ({ ...f, tipoRecorrencia: e.target.value as TipoRecorrenciaLembrete }))}
              />
              {form.tipoRecorrencia === 'A_CADA_N_DIAS' && (
                <Input
                  label="A cada quantos dias"
                  type="number"
                  min={1}
                  max={31}
                  value={form.intervaloDias}
                  onChange={(e) => setForm((f) => ({ ...f, intervaloDias: e.target.value }))}
                />
              )}
              {form.tipoRecorrencia === 'DIA_MES' && (
                <Input
                  label="Dia do mês (1-31)"
                  type="number"
                  min={1}
                  max={31}
                  value={form.diaMes}
                  onChange={(e) => setForm((f) => ({ ...f, diaMes: e.target.value }))}
                />
              )}
              {form.tipoRecorrencia === 'DIA_SEMANA' && (
                <Select
                  label="Dia da semana"
                  options={DIAS_SEMANA.map((label, i) => ({ value: String(i + 1), label }))}
                  value={form.diaSemana}
                  onChange={(e) => setForm((f) => ({ ...f, diaSemana: e.target.value }))}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Horário</label>
                <input
                  type="time"
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2"
                />
                <p className="text-xs text-slate-500 mt-1">O lembrete só dispara a partir desse horário no dia certo.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.somenteUsuarioVisualizar}
                  onChange={(e) => setForm((f) => ({ ...f, somenteUsuarioVisualizar: e.target.checked }))}
                  className="accent-blue-600"
                />
                Visível apenas para o usuário selecionado
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={fecharModal} disabled={salvando}>Cancelar</Button>
              <Button icon={<Check className="w-4 h-4" />} onClick={() => void salvar()} loading={salvando}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
