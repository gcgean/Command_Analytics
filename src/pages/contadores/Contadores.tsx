import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, Building2, Mail, Phone, Users, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { useNavigate } from 'react-router-dom'

export function Contadores() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [contadores, setContadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const LIMIT = 24
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({
    nome: '',
    nomeComercial: '',
    cnpj: '',
    email: '',
    telefone: '',
    responsavel: '',
    emailResp: '',
    cidade: '',
    crc: '',
    descricao: '',
    perfilContador: '',
    chavePix: '',
    emailEnvio: '',
    sistemaContador: '',
    melhorDiaEnvio: '',
    usaPlataforma: '',
    cpfContador: '',
  })
  const [saving, setSaving] = useState(false)

  const carregarPagina = useCallback(async (p: number, reset = false) => {
    if (loadingMore || (hasMore === false && !reset)) return
    if (reset) {
      setLoading(true)
      setHasMore(true)
      setPage(1)
    } else {
      setLoadingMore(true)
    }
    try {
      const res: any = await api.getContadores({ page: String(p), limit: String(LIMIT), ...(busca ? { search: busca } : {}) })
      if (res && Array.isArray(res.data)) {
        const incoming = res.data
        setContadores(prev => (reset ? incoming : [...prev, ...incoming]))
        const pagesNum = Number(res.pages ?? 1)
        const nextHasMore = p < pagesNum && incoming.length > 0
        setHasMore(nextHasMore)
        setPage(p)
      } else if (Array.isArray(res)) {
        setContadores(res)
        setHasMore(false)
        setPage(1)
      } else {
        setHasMore(false)
      }
    } catch (err: any) {
      setHasMore(false)
      const msg = err?.message ? `Falha ao carregar contadores: ${err.message}` : 'Falha ao carregar contadores'
      toast.error(msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [busca, LIMIT, loadingMore, hasMore, toast])

  useEffect(() => {
    carregarPagina(1, true)
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
        carregarPagina(page + 1)
      }
    })
    const el = sentinelRef.current
    if (el) obs.observe(el)
    return () => { if (el) obs.unobserve(el) }
  }, [hasMore, loading, loadingMore, page, carregarPagina])

  useEffect(() => {
    const delay = setTimeout(() => carregarPagina(1, true), 400)
    return () => clearTimeout(delay)
  }, [busca]) 

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  const filtrados = contadores

  const abrirNovo = () => {
    setEditando(null)
    setForm({
      nome: '',
      nomeComercial: '',
      cnpj: '',
      email: '',
      telefone: '',
      responsavel: '',
      emailResp: '',
      cidade: '',
      crc: '',
      descricao: '',
      perfilContador: '',
      chavePix: '',
      emailEnvio: '',
      sistemaContador: '',
      melhorDiaEnvio: '',
      usaPlataforma: '',
      cpfContador: '',
    })
    setModalOpen(true)
  }

  const abrirEditar = async (id: number) => {
    try {
      const data: any = await api.getContador(id)
      setEditando(data)
      setForm({
        nome: data.nome ?? '',
        nomeComercial: data.nomeComercial ?? '',
        cnpj: data.cnpj ?? '',
        email: data.email ?? '',
        telefone: data.telefone ?? '',
        responsavel: data.responsavel ?? '',
        emailResp: data.emailResp ?? '',
        cidade: data.cidade ?? '',
        crc: data.crc ?? '',
        descricao: data.descricao ?? '',
        perfilContador: data.perfilContador ?? '',
        chavePix: data.chavePix ?? '',
        emailEnvio: data.emailEnvio ?? '',
        sistemaContador: data.sistemaContador ?? '',
        melhorDiaEnvio: data.melhorDiaEnvio ?? '',
        usaPlataforma: data.usaPlataforma ?? '',
        cpfContador: data.cpfContador ?? '',
      })
      setModalOpen(true)
    } catch {
      toast.error('Falha ao abrir dados do contador')
    }
  }

  const salvar = async () => {
    // Validações essenciais conforme Delphi
    if (!form.nome?.trim()) return toast.error('Informe o nome!')
    if (!form.usaPlataforma) return toast.error('Informe se usa a plataforma!')
    if (!form.nomeComercial?.trim()) return toast.error('Informe o nome fantasia!')
    if (!form.cnpj?.trim()) return toast.error('Informe o CNPJ/CPF!')
    if (!form.email?.trim()) return toast.error('Informe o e-mail!')
    if (!form.telefone?.trim()) return toast.error('Informe o telefone!')
    if (!form.descricao?.trim()) return toast.error('Informe a descrição!')
    if (!form.melhorDiaEnvio?.trim()) return toast.error('Informe o melhor dia para enviar os arquivos!')

    setSaving(true)
    try {
      const payload = { ...form }
      if (editando?.id) {
        await api.updateContador(editando.id, payload)
        toast.success('Contador atualizado com sucesso!')
      } else {
        await api.createContador(payload)
        toast.success('Contador cadastrado com sucesso!')
      }
      setModalOpen(false)
      setEditando(null)
      await carregarPagina(1, true)
    } catch {
      toast.error('Não foi possível salvar o cadastro do contador')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contadores Parceiros</h1>
          <p className="text-slate-400 text-sm mt-1">{contadores.length} contadores carregados</p>
        </div>
        <button className="btn-primary" onClick={abrirNovo}><Plus size={16} /> Novo Contador</button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input-field pl-9" placeholder="Buscar contador..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtrados.map((c: any) => (
          <div key={c.id}
            onClick={() => abrirEditar(c.id)}
            className="card cursor-pointer border transition-colors border-slate-700 hover:border-slate-600">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0">
                <Building2 size={20} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">{c.nome ?? '—'}</p>
                  {c.crc && (
                    <span className="badge text-xs bg-blue-500/20 text-blue-300">CRC {c.crc}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{c.nomeComercial ?? c.responsavel ?? '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3">
              {c.email && <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>}
              {c.telefone && <span className="flex items-center gap-1"><Phone size={11} />{c.telefone}</span>}
              {c.cidade && <span className="flex items-center gap-1"><Building2 size={11} />{c.cidade}</span>}
            </div>
            <div className="flex gap-4 pt-3 border-t border-slate-700">
              <div className="flex items-center gap-1.5 text-xs">
                <Users size={13} className="text-slate-500" />
                <button
                  className="text-blue-400 hover:underline font-medium"
                  onClick={(e) => { e.stopPropagation(); navigate(`/clientes?contadorId=${c.id}`) }}
                  title="Ver clientes vinculados"
                >
                  {(c.totalClientes ?? 0)} clientes
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-8" />
      {loadingMore && (
        <div className="flex items-center justify-center py-4 text-slate-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
          Carregando mais...
        </div>
      )}
      {!hasMore && (
        <div className="py-4 text-center text-xs text-slate-500">Fim da lista</div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Detalhes do Contador' : 'Novo Contador'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nome (Razão Social)" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
          <Input label="Nome Fantasia" value={form.nomeComercial} onChange={e => setForm({ ...form, nomeComercial: e.target.value })} required />
          <Input label="CNPJ/CPF" value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} required />
          <Select
            label="Usa plataforma do contador"
            value={form.usaPlataforma}
            onChange={e => setForm({ ...form, usaPlataforma: e.target.value })}
            options={[{ value: 'SIM', label: 'SIM' }, { value: 'NAO', label: 'NÃO' }]}
            placeholder="Selecione"
          />
          <Input label="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <Input label="Telefone" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} required />
          <Input label="Responsável" value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} />
          <Input label="E-mail do responsável" value={form.emailResp} onChange={e => setForm({ ...form, emailResp: e.target.value })} />
          <Input label="Cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
          <Input label="CRC do Contador" value={form.crc} onChange={e => setForm({ ...form, crc: e.target.value })} />
          <Input label="Descrição da Contabilidade" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} required />
          <Input label="Perfil do Contador" value={form.perfilContador} onChange={e => setForm({ ...form, perfilContador: e.target.value })} />
          <Input label="Chave PIX" value={form.chavePix} onChange={e => setForm({ ...form, chavePix: e.target.value })} />
          <Input label="E-mail p/ envio de arquivos" value={form.emailEnvio} onChange={e => setForm({ ...form, emailEnvio: e.target.value })} />
          <Input label="Sistema do Contador" value={form.sistemaContador} onChange={e => setForm({ ...form, sistemaContador: e.target.value })} />
          <Input label="Melhor dia p/ envio de arquivos" value={form.melhorDiaEnvio} onChange={e => setForm({ ...form, melhorDiaEnvio: e.target.value })} required />
          <Input label="CPF do Contador" value={form.cpfContador} onChange={e => setForm({ ...form, cpfContador: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={saving}>
            {saving ? (<span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</span>) : 'Salvar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
