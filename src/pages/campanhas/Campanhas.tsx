import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Filter, ImageIcon, Loader2, Megaphone, Pencil, Plus, Power, Search, Trash2, Upload, UserMinus, UserPlus, Users, X,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import type { Campanha, CampanhaCliente, CampanhaPayload, FiltroClientesCampanha } from '../../types'

const TIPOS_ACAO = [
  { value: 0, label: 'Sem ação' },
  { value: 1, label: 'Clique no botão (link)' },
  { value: 2, label: 'Vídeo (clique no botão)' },
]

const LIMITE_TEXTO = 100

function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatData(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** Situação real da campanha para o cliente: depende do flag "ativa" e do período. */
function situacao(c: Campanha): { label: string; className: string } {
  const hoje = hojeIso()
  if (!c.ativa) return { label: 'Inativa', className: 'bg-slate-500/15 text-slate-500' }
  if (c.dataFinal && c.dataFinal < hoje) return { label: 'Encerrada', className: 'bg-slate-500/15 text-slate-500' }
  if (c.dataInicial && c.dataInicial > hoje) return { label: 'Agendada', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
  return { label: 'No ar', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
}

const FORM_VAZIO: CampanhaPayload = {
  ativa: true,
  titulo: '',
  descricao: '',
  dataInicial: hojeIso(),
  dataFinal: hojeIso(),
  nomeArquivo: '',
  tipoAcao: 1,
  acao: '',
  textoBotaoAcao: '',
}

// A imagem fica no servidor de arquivos do Command; o backend faz o proxy autenticado.
const cacheImagens = new Map<string, string>()

function CampanhaImagem({ caminho, className }: { caminho: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(() => cacheImagens.get(caminho) ?? null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!caminho) return
    const emCache = cacheImagens.get(caminho)
    if (emCache) {
      setUrl(emCache)
      return
    }
    let cancelado = false
    setErro(false)
    api.getImagemCampanhaBlob(caminho)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        cacheImagens.set(caminho, objectUrl)
        if (!cancelado) setUrl(objectUrl)
      })
      .catch(() => { if (!cancelado) setErro(true) })
    return () => { cancelado = true }
  }, [caminho])

  return (
    <div className={clsx('overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center', className)}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : erro || !caminho ? (
        <ImageIcon className="w-6 h-6 text-slate-400" />
      ) : (
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      )}
    </div>
  )
}

export function Campanhas() {
  const { toast } = useToast()
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)

  const [formAberto, setFormAberto] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<CampanhaPayload>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  const inputImagemRef = useRef<HTMLInputElement | null>(null)

  const [campanhaClientes, setCampanhaClientes] = useState<Campanha | null>(null)

  async function carregar() {
    try {
      setCampanhas(await api.getCampanhas())
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar campanhas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void carregar() }, [])

  const kpis = useMemo(() => {
    const situacoes = campanhas.map((c) => situacao(c).label)
    return {
      noAr: situacoes.filter((s) => s === 'No ar').length,
      agendadas: situacoes.filter((s) => s === 'Agendada').length,
      total: campanhas.length,
    }
  }, [campanhas])

  function abrirNova() {
    setEditId(null)
    setForm({ ...FORM_VAZIO, dataInicial: hojeIso(), dataFinal: hojeIso() })
    setFormAberto(true)
  }

  function abrirEdicao(c: Campanha) {
    setEditId(c.id)
    setForm({
      ativa: c.ativa,
      titulo: c.titulo,
      descricao: c.descricao,
      dataInicial: c.dataInicial,
      dataFinal: c.dataFinal,
      nomeArquivo: c.nomeArquivo,
      tipoAcao: c.tipoAcao,
      acao: c.tipoAcao === 0 && c.acao === '0' ? '' : c.acao,
      textoBotaoAcao: c.textoBotaoAcao,
    })
    setFormAberto(true)
  }

  async function enviarImagem(file: File | undefined) {
    if (!file) return
    setEnviandoImagem(true)
    try {
      const { caminho } = await api.uploadImagemCampanha(file)
      setForm((f) => ({ ...f, nomeArquivo: caminho }))
      toast.success('Imagem enviada.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar a imagem.')
    } finally {
      setEnviandoImagem(false)
      if (inputImagemRef.current) inputImagemRef.current.value = ''
    }
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.descricao.trim()) return toast.error('Informe título e descrição.')
    if (!form.dataInicial || !form.dataFinal) return toast.error('Informe o período da campanha.')
    if (form.dataFinal < form.dataInicial) return toast.error('A data final não pode ser anterior à inicial.')
    if (!form.nomeArquivo) return toast.error('Envie a imagem da campanha.')
    if (form.tipoAcao !== 0 && (!form.acao.trim() || !form.textoBotaoAcao.trim())) {
      return toast.error('Informe o link e o texto do botão de ação.')
    }

    setSalvando(true)
    try {
      if (editId) {
        await api.updateCampanha(editId, form)
        toast.success('Campanha atualizada.')
      } else {
        await api.createCampanha(form)
        toast.success('Campanha criada. Agora adicione os clientes que vão vê-la.')
      }
      setFormAberto(false)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar campanha.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtiva(c: Campanha) {
    try {
      const { ativa } = await api.toggleCampanha(c.id)
      setCampanhas((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativa } : x)))
      toast.info(ativa ? 'Campanha ativada.' : 'Campanha inativada.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao alterar a campanha.')
    }
  }

  async function excluir(c: Campanha) {
    if (!confirm(`Excluir a campanha "${c.titulo}"? Os ${c.totalClientes} vínculo(s) de clientes também serão removidos.`)) return
    try {
      await api.deleteCampanha(c.id)
      setCampanhas((prev) => prev.filter((x) => x.id !== c.id))
      toast.success('Campanha excluída.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir campanha.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Campanhas para Clientes</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Mensagens com imagem exibidas aos clientes no sistema durante o período da campanha.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={abrirNova}>Nova campanha</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'No ar agora', valor: kpis.noAr, cor: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Agendadas', valor: kpis.agendadas, cor: 'text-amber-600 dark:text-amber-400' },
          { label: 'Total de campanhas', valor: kpis.total, cor: 'text-slate-900 dark:text-slate-100' },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', k.cor)}>{k.valor}</p>
          </Card>
        ))}
      </div>

      {campanhas.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-slate-500">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Nenhuma campanha cadastrada.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {campanhas.map((c) => {
            const sit = situacao(c)
            return (
              <Card key={c.id} padding="sm">
                <div className="flex flex-col sm:flex-row gap-4">
                  <CampanhaImagem caminho={c.nomeArquivo} className="w-full sm:w-28 h-40 sm:h-28 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{c.titulo}</p>
                      <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', sit.className)}>{sit.label}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{c.descricao}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Período: {formatData(c.dataInicial)} a {formatData(c.dataFinal)}</span>
                      <span>Ação: {TIPOS_ACAO.find((t) => t.value === c.tipoAcao)?.label ?? c.tipoAcao}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {c.totalClientes} cliente(s)</span>
                    </div>
                    {c.tipoAcao !== 0 && c.acao ? (
                      <p className="mt-1 text-xs truncate">
                        <span className="text-slate-500">Botão "{c.textoBotaoAcao}" → </span>
                        <a href={c.acao} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{c.acao}</a>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex sm:flex-col gap-1 flex-shrink-0">
                    <Button size="sm" variant="secondary" icon={<Users className="w-3.5 h-3.5" />} onClick={() => setCampanhaClientes(c)}>Clientes</Button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => abrirEdicao(c)}>Editar</Button>
                    <Button size="sm" variant="ghost" icon={<Power className="w-3.5 h-3.5" />} onClick={() => void alternarAtiva(c)}>{c.ativa ? 'Inativar' : 'Ativar'}</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} className="text-red-500 hover:text-red-600" onClick={() => void excluir(c)}>Excluir</Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={formAberto} onClose={() => !salvando && setFormAberto(false)} title={editId ? 'Editar campanha' : 'Nova campanha'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Input label="Data inicial" type="date" value={form.dataInicial ?? ''} onChange={(e) => setForm((f) => ({ ...f, dataInicial: e.target.value }))} />
            <Input label="Data final" type="date" value={form.dataFinal ?? ''} onChange={(e) => setForm((f) => ({ ...f, dataFinal: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
              <input type="checkbox" checked={form.ativa} onChange={(e) => setForm((f) => ({ ...f, ativa: e.target.checked }))} className="accent-blue-600" />
              Campanha ativa
            </label>
          </div>

          <Input label="Título" maxLength={LIMITE_TEXTO} value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value.toUpperCase() }))} placeholder="Ex.: LIVE TIRA-DÚVIDAS DA NOVA VERSÃO" />
          <Input label="Descrição" maxLength={LIMITE_TEXTO} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value.toUpperCase() }))} />

          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Imagem da campanha</p>
            <div className="flex items-start gap-3">
              <CampanhaImagem caminho={form.nomeArquivo} className="w-24 h-24 flex-shrink-0" />
              <div className="space-y-2 min-w-0">
                <input ref={inputImagemRef} type="file" accept="image/png,image/jpeg,image/gif,image/bmp,image/webp" className="hidden" onChange={(e) => void enviarImagem(e.target.files?.[0])} />
                <Button size="sm" variant="secondary" icon={<Upload className="w-3.5 h-3.5" />} loading={enviandoImagem} onClick={() => inputImagemRef.current?.click()}>
                  {form.nomeArquivo ? 'Trocar imagem' : 'Selecionar imagem'}
                </Button>
                <p className="text-xs text-slate-500 break-all">{form.nomeArquivo || 'Nenhuma imagem enviada (PNG, JPG, GIF, BMP ou WEBP, até 10 MB).'}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Tipo de ação</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIPOS_ACAO.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipoAcao: t.value }))}
                  className={clsx(
                    'px-3 py-2 rounded-lg border text-sm text-left transition-colors',
                    form.tipoAcao === t.value
                      ? 'bg-blue-600/15 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {form.tipoAcao !== 0 ? (
            <>
              <Input label="Texto do botão de ação" maxLength={LIMITE_TEXTO} value={form.textoBotaoAcao} onChange={(e) => setForm((f) => ({ ...f, textoBotaoAcao: e.target.value }))} placeholder="Ex.: PARTICIPAR DA LIVE" />
              <Input label={form.tipoAcao === 2 ? 'Link do vídeo' : 'Link da página'} maxLength={LIMITE_TEXTO} value={form.acao} onChange={(e) => setForm((f) => ({ ...f, acao: e.target.value }))} placeholder="https://" />
            </>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setFormAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void salvar()} loading={salvando} disabled={enviandoImagem}>{editId ? 'Salvar alterações' : 'Criar campanha'}</Button>
          </div>
        </div>
      </Modal>

      {campanhaClientes ? (
        <ClientesCampanhaModal
          campanha={campanhaClientes}
          onClose={() => setCampanhaClientes(null)}
          onTotalAlterado={(total) => setCampanhas((prev) => prev.map((x) => (x.id === campanhaClientes.id ? { ...x, totalClientes: total } : x)))}
        />
      ) : null}
    </div>
  )
}

function ClientesCampanhaModal({ campanha, onClose, onTotalAlterado }: {
  campanha: Campanha
  onClose: () => void
  onTotalAlterado: (total: number) => void
}) {
  const { toast } = useToast()
  const POR_PAGINA = 50

  const [vinculados, setVinculados] = useState<CampanhaCliente[]>([])
  const [total, setTotal] = useState(campanha.totalClientes)
  const [pagina, setPagina] = useState(1)
  const [filtro, setFiltro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)

  // Quem ainda pode entrar: a mesma consulta que o "adicionar todos" usa no banco.
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [cidade, setCidade] = useState('')
  const [planoId, setPlanoId] = useState('')
  const [classificacaoId, setClassificacaoId] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [opcoes, setOpcoes] = useState<{
    estados: string[]
    cidades: string[]
    planos: Array<{ id: number; descricao: string }>
    classificacoes: Array<{ id: number; nome: string }>
  }>({ estados: [], cidades: [], planos: [], classificacoes: [] })
  const [candidatos, setCandidatos] = useState<
    Array<{ id: number; nome: string; cnpj: string | null; cidade: string | null; uf: string | null; ativo: boolean }>
  >([])
  const [totalCandidatos, setTotalCandidatos] = useState(0)
  const [buscando, setBuscando] = useState(false)

  const filtros: FiltroClientesCampanha = {
    search: busca.trim() || undefined,
    estado: estado || undefined,
    cidade: cidade || undefined,
    planoId: planoId || undefined,
    classificacaoId: classificacaoId || undefined,
    incluirInativos: incluirInativos || undefined,
  }
  const temFiltro = Boolean(busca.trim() || estado || cidade || planoId || classificacaoId)

  function limparFiltros() {
    setBusca(''); setEstado(''); setCidade(''); setPlanoId(''); setClassificacaoId('')
    setIncluirInativos(false)
  }

  async function carregarVinculados(pag = pagina, termo = filtro) {
    setCarregando(true)
    try {
      const resp = await api.getClientesCampanha(campanha.id, { search: termo.trim() || undefined, page: pag, limit: POR_PAGINA })
      setVinculados(resp.data)
      setTotal(resp.total)
      if (!termo.trim()) onTotalAlterado(resp.total)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar clientes da campanha.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => { setPagina(1); void carregarVinculados(1, filtro) }, 300)
    return () => window.clearTimeout(id)
  }, [filtro])

  // Cidades dependem do estado: a lista inteira do pais nao ajudaria ninguem.
  useEffect(() => {
    api.getOpcoesClientesCampanha(estado || undefined)
      .then(setOpcoes)
      .catch(() => {})
  }, [estado])

  useEffect(() => {
    setBuscando(true)
    const id = window.setTimeout(() => {
      api.getClientesDisponiveisCampanha(campanha.id, { ...filtros, page: 1, limit: 20 })
        .then((resp) => { setCandidatos(resp.data); setTotalCandidatos(resp.total) })
        .catch(() => { setCandidatos([]); setTotalCandidatos(0) })
        .finally(() => setBuscando(false))
    }, 300)
    return () => window.clearTimeout(id)
  }, [busca, estado, cidade, planoId, classificacaoId, incluirInativos, total])

  async function adicionar(dados: { clienteIds?: number[]; todosAtivos?: boolean; filtros?: FiltroClientesCampanha }) {
    setProcessando(true)
    try {
      const { adicionados } = await api.addClientesCampanha(campanha.id, dados)
      toast.success(adicionados > 0 ? `${adicionados} cliente(s) adicionado(s).` : 'Nenhum cliente novo — já estavam na campanha.')
      await carregarVinculados(1, filtro)
      setPagina(1)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao adicionar clientes.')
    } finally {
      setProcessando(false)
    }
  }

  async function remover(cliente: CampanhaCliente) {
    setProcessando(true)
    try {
      await api.removeClienteCampanha(campanha.id, cliente.clienteId)
      await carregarVinculados(pagina, filtro)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover cliente.')
    } finally {
      setProcessando(false)
    }
  }

  async function removerTodos() {
    if (!confirm(`Remover todos os ${total} cliente(s) desta campanha?`)) return
    setProcessando(true)
    try {
      await api.removeTodosClientesCampanha(campanha.id)
      await carregarVinculados(1, '')
      setFiltro('')
      setPagina(1)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover clientes.')
    } finally {
      setProcessando(false)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <Modal isOpen onClose={() => !processando && onClose()} title={`Clientes da campanha — ${campanha.titulo}`} size="xl">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Adicionar clientes</p>
            {temFiltro && (
              <button type="button" onClick={limparFiltros}
                className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 inline-flex items-center gap-1">
                <X className="w-3 h-3" /> limpar filtros
              </button>
            )}
          </div>

          <Input icon={<Search className="w-3.5 h-3.5" />} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome, fantasia ou CNPJ..." />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setCidade('') }}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2">
              <option value="">Todos os estados</option>
              {opcoes.estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={!estado}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 disabled:opacity-50">
              <option value="">{estado ? 'Todas as cidades' : 'Escolha o estado'}</option>
              {opcoes.cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={planoId} onChange={(e) => setPlanoId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2">
              <option value="">Todos os planos</option>
              {opcoes.planos.map((pl) => <option key={pl.id} value={String(pl.id)}>{pl.descricao}</option>)}
            </select>
            <select value={classificacaoId} onChange={(e) => setClassificacaoId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2">
              <option value="">Todas as classificações</option>
              {opcoes.classificacoes.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
              incluir clientes inativos
            </label>
            {/* O botão promete o número que a listagem encontrou, e o backend aplica os mesmos
                filtros — não só os que couberam na tela. */}
            <Button size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} loading={processando}
              disabled={totalCandidatos === 0}
              onClick={() => {
                if (!confirm(`Adicionar ${totalCandidatos} cliente(s) a esta campanha?`)) return
                void adicionar({ filtros })
              }}>
              {temFiltro
                ? `Adicionar os ${totalCandidatos} encontrados`
                : `Adicionar todos os ${totalCandidatos} ativos`}
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {buscando ? (
              <p className="px-3 py-2 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...</p>
            ) : candidatos.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                {temFiltro ? 'Nenhum cliente fora da campanha com esses filtros.' : 'Todos os clientes já estão na campanha.'}
              </p>
            ) : candidatos.map((cl) => (
              <button
                key={cl.id}
                type="button"
                disabled={processando}
                onClick={() => void adicionar({ clienteIds: [cl.id] })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {cl.nome}
                    {!cl.ativo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500">inativo</span>}
                  </span>
                  <span className="block text-xs text-slate-500 truncate">
                    #{cl.id} · {cl.cnpj || 'Sem CNPJ'}
                    {cl.cidade ? ` · ${cl.cidade}${cl.uf ? `/${cl.uf}` : ''}` : ''}
                  </span>
                </span>
                <UserPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
              </button>
            ))}
          </div>
          {totalCandidatos > candidatos.length && (
            <p className="text-[11px] text-slate-400">
              Mostrando {candidatos.length} de {totalCandidatos} — refine os filtros ou use o botão acima para incluir todos.
            </p>
          )}
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{total} cliente(s) na campanha</p>
            <div className="flex items-center gap-2">
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar vinculados..." className="h-8 text-xs" />
              <Button size="sm" variant="ghost" icon={<UserMinus className="w-3.5 h-3.5" />} className="text-red-500 hover:text-red-600 whitespace-nowrap" disabled={processando || total === 0} onClick={() => void removerTodos()}>
                Remover todos
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-[45vh] overflow-y-auto">
            {carregando ? (
              <p className="p-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</p>
            ) : vinculados.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">{filtro.trim() ? 'Nenhum cliente encontrado no filtro.' : 'Nenhum cliente nesta campanha ainda.'}</p>
            ) : vinculados.map((v) => (
              <div key={v.clienteId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                    {v.nome}
                    {!v.ativo ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500">inativo</span> : null}
                  </p>
                  <p className="text-xs text-slate-500 truncate">#{v.clienteId} · {v.cnpj || 'Sem CNPJ'}</p>
                </div>
                <button
                  type="button"
                  disabled={processando}
                  onClick={() => void remover(v)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                  title="Remover da campanha"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {totalPaginas > 1 ? (
            <div className="flex items-center justify-end gap-2 mt-2 text-xs text-slate-500">
              <Button size="sm" variant="secondary" disabled={pagina <= 1 || carregando} onClick={() => { const p = pagina - 1; setPagina(p); void carregarVinculados(p, filtro) }}>Anterior</Button>
              <span>Página {pagina} de {totalPaginas}</span>
              <Button size="sm" variant="secondary" disabled={pagina >= totalPaginas || carregando} onClick={() => { const p = pagina + 1; setPagina(p); void carregarVinculados(p, filtro) }}>Próxima</Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
