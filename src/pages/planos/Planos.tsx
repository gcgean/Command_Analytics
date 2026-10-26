import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Plus, Check, Loader2, Package, Tag, Pencil, ImagePlus, Trash2, Layers,
} from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { PlanoCatalogo, SistemaPlanos } from '../../types'

const TIPO_LABEL: Record<number, string> = {
  0: 'Padrão',
  1: 'Módulo Adicional',
  2: 'Personalizado',
}

const rotuloTipo = (t?: number | null) => TIPO_LABEL[t ?? 0] ?? `Tipo ${t}`
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

interface Rascunho {
  id: number | null
  descricao: string
  valor: string
  valorAntigo: string
  detalhes: string
  sistemaId: string
  tipo: string
  percComissao: string
  ativo: boolean
}

const vazio = (sistemaId: string): Rascunho => ({
  id: null, descricao: '', valor: '', valorAntigo: '', detalhes: '',
  sistemaId: sistemaId && sistemaId !== 'nenhum' ? sistemaId : '', tipo: '0',
  percComissao: '', ativo: true,
})

export function Planos() {
  const { toast } = useToast()
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([])
  const [sistemas, setSistemas] = useState<SistemaPlanos[]>([])
  const [semSistema, setSemSistema] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [sistemaId, setSistemaId] = useState('')
  const [tipo, setTipo] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)

  const [edicao, setEdicao] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [imagens, setImagens] = useState<Record<number, string>>({})
  const entradaImagem = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, s] = await Promise.all([
        api.getPlanos({
          sistemaId: sistemaId || undefined,
          tipo: tipo || undefined,
          todos: incluirInativos,
        }),
        api.getSistemasPlanos().catch(() => ({ sistemas: [], semSistema: 0 })),
      ])
      setPlanos(lista)
      setSistemas(s.sistemas)
      setSemSistema(s.semSistema)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os planos.')
    } finally {
      setCarregando(false)
    }
  }, [toast, sistemaId, tipo, incluirInativos])

  useEffect(() => { void carregar() }, [carregar])

  // A leitura da imagem é autenticada, então a miniatura vem por blob.
  useEffect(() => {
    let vivo = true
    const criadas: string[] = []
    void (async () => {
      for (const p of planos) {
        if (!p.temImagem || imagens[p.id]) continue
        const blob = await api.getImagemPlanoBlob(p.id).catch(() => null)
        if (!blob || !vivo) continue
        const url = URL.createObjectURL(blob)
        criadas.push(url)
        setImagens((m) => ({ ...m, [p.id]: url }))
      }
    })()
    return () => { vivo = false; criadas.forEach((u) => URL.revokeObjectURL(u)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planos])

  const filtrados = useMemo(
    () => planos.filter((p) => !busca
      || (p.descricao ?? '').toLowerCase().includes(busca.toLowerCase())
      || (p.detalhes ?? '').toLowerCase().includes(busca.toLowerCase())),
    [planos, busca])

  // Separar plano de módulo: o gestor olha "o que o cliente contrata" e "o que soma depois".
  const principais = filtrados.filter((p) => (p.tipo ?? 0) !== 1)
  const modulos = filtrados.filter((p) => (p.tipo ?? 0) === 1)

  function abrirEdicao(p: PlanoCatalogo) {
    setEdicao({
      id: p.id,
      descricao: p.descricao ?? '',
      valor: String(p.valor ?? ''),
      valorAntigo: p.valorAntigo == null ? '' : String(p.valorAntigo),
      detalhes: p.detalhes ?? '',
      sistemaId: p.sistemaId == null ? '' : String(p.sistemaId),
      tipo: String(p.tipo ?? 0),
      percComissao: p.percComissao == null ? '' : String(p.percComissao),
      ativo: !!p.ativo,
    })
  }

  async function salvar() {
    if (!edicao) return
    if (!edicao.descricao.trim()) return toast.error('Informe o nome do plano.')
    setSalvando(true)
    try {
      await api.salvarPlano(edicao.id, {
        descricao: edicao.descricao.trim(),
        valor: edicao.valor === '' ? 0 : Number(edicao.valor),
        valorAntigo: edicao.valorAntigo === '' ? null : Number(edicao.valorAntigo),
        detalhes: edicao.detalhes.trim() || null,
        sistemaId: edicao.sistemaId === '' ? null : Number(edicao.sistemaId),
        tipo: edicao.tipo === '' ? null : Number(edicao.tipo),
        percComissao: edicao.percComissao === '' ? null : Number(edicao.percComissao),
        ativo: edicao.ativo,
      })
      toast.success(edicao.id ? 'Plano atualizado.' : 'Plano criado.')
      setEdicao(null)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function enviarImagem(arquivo: File) {
    if (!edicao?.id) return toast.error('Salve o plano antes de enviar a imagem.')
    try {
      await api.enviarImagemPlano(edicao.id, arquivo)
      const blob = await api.getImagemPlanoBlob(edicao.id).catch(() => null)
      if (blob) setImagens((m) => ({ ...m, [edicao.id as number]: URL.createObjectURL(blob) }))
      setPlanos((lista) => lista.map((p) => p.id === edicao.id ? { ...p, temImagem: true } : p))
      toast.success('Imagem atualizada.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar a imagem.')
    }
  }

  async function removerImagem() {
    if (!edicao?.id) return
    await api.removerImagemPlano(edicao.id).catch(() => {})
    setImagens((m) => { const n = { ...m }; delete n[edicao.id as number]; return n })
    setPlanos((lista) => lista.map((p) => p.id === edicao.id ? { ...p, temImagem: false } : p))
    toast.info('Imagem removida.')
  }

  const sistemaEscolhido = sistemas.find((s) => String(s.id) === sistemaId)

  function cartao(p: PlanoCatalogo) {
    const valor = Number(p.valor ?? 0)
    const valorAntigo = p.valorAntigo != null ? Number(p.valorAntigo) : null
    const linhas = p.detalhes ? p.detalhes.split('\n').filter(Boolean) : []

    return (
      <div key={p.id}
        className={clsx('bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col',
          !p.ativo && 'opacity-60')}>
        {imagens[p.id] ? (
          <img src={imagens[p.id]} alt={p.descricao}
            className="w-full h-32 object-cover border-b border-slate-200 dark:border-slate-700" />
        ) : (
          <div className="w-full h-16 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <Package size={20} className="text-slate-300 dark:text-slate-600" />
          </div>
        )}

        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              <Tag size={10} className="inline mr-1" />{rotuloTipo(p.tipo)}
            </span>
            {!p.ativo && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                Inativo
              </span>
            )}
          </div>

          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{p.descricao}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{p.sistemaNome ?? 'Sem sistema'}</p>

          <div className="mt-3">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              R$ {brl(valor)}
              <span className="text-slate-500 text-sm font-normal">/mês</span>
            </div>
            {valorAntigo != null && valorAntigo > 0 && valorAntigo !== valor && (
              <p className="text-xs text-slate-400 line-through">R$ {brl(valorAntigo)}</p>
            )}
            {p.percComissao != null && Number(p.percComissao) > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Comissão: {Number(p.percComissao).toFixed(1)}%
              </p>
            )}
          </div>

          {linhas.length > 0 && (
            <ul className="mt-3 space-y-1.5 flex-1">
              {linhas.map((linha, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{linha}</span>
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => abrirEdicao(p)}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Planos e Módulos</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            {sistemaEscolhido
              ? `${sistemaEscolhido.nome}${sistemaEscolhido.categoria ? ` · ${sistemaEscolhido.categoria}` : ''}`
              : `${planos.length} itens no filtro atual`}
          </p>
        </div>
        <Button onClick={() => setEdicao(vazio(sistemaId))}>
          <Plus size={16} /> Novo plano
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input-field flex-1 min-w-[14rem]" placeholder="Buscar por nome ou função..."
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="input-field w-full sm:w-72" value={sistemaId}
          onChange={(e) => setSistemaId(e.target.value)}>
          <option value="">Todos os sistemas</option>
          {sistemas.filter((s) => s.planos > 0).map((s) => (
            <option key={s.id} value={String(s.id)}>{s.nome} ({s.planos})</option>
          ))}
          {semSistema > 0 && <option value="nenhum">Sem sistema ({semSistema})</option>}
        </select>
        <select className="input-field w-full sm:w-48" value={tipo}
          onChange={(e) => setTipo(e.target.value)}>
          <option value="">Planos e módulos</option>
          {Object.entries(TIPO_LABEL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="accent-blue-600" checked={incluirInativos}
            onChange={(e) => setIncluirInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {carregando && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      )}

      {!carregando && filtrados.length === 0 && (
        <div className="py-16 text-center text-slate-500">Nenhum plano com esses filtros.</div>
      )}

      {!carregando && principais.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" /> Planos ({principais.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {principais.map(cartao)}
          </div>
        </section>
      )}

      {!carregando && modulos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" /> Módulos adicionais ({modulos.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulos.map(cartao)}
          </div>
        </section>
      )}

      <Modal isOpen={!!edicao} onClose={() => !salvando && setEdicao(null)}
        title={edicao?.id ? 'Editar plano' : 'Novo plano'} size="lg" fechavelPorFora={false}>
        {edicao && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Imagem do plano
              </label>
              <div className="flex items-center gap-3">
                <div className="w-28 h-20 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/40 flex items-center justify-center shrink-0">
                  {edicao.id && imagens[edicao.id]
                    ? <img src={imagens[edicao.id]} alt="" className="w-full h-full object-cover" />
                    : <Package size={18} className="text-slate-300 dark:text-slate-600" />}
                </div>
                <div className="space-y-1.5">
                  <input ref={entradaImagem} type="file" className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarImagem(f); e.target.value = '' }} />
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={!edicao.id}
                      onClick={() => entradaImagem.current?.click()}>
                      <ImagePlus className="w-3.5 h-3.5" /> Escolher imagem
                    </Button>
                    {edicao.id && imagens[edicao.id] && (
                      <Button variant="ghost" size="sm" onClick={removerImagem}>
                        <Trash2 className="w-3.5 h-3.5" /> Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {edicao.id
                      ? 'JPG, PNG, WEBP ou SVG, até 4 MB. A troca substitui a anterior.'
                      : 'Salve o plano primeiro para poder enviar a imagem.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Nome do plano</label>
                <input className="input-field w-full" value={edicao.descricao}
                  onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Sistema</label>
                <select className="input-field w-full" value={edicao.sistemaId}
                  onChange={(e) => setEdicao({ ...edicao, sistemaId: e.target.value })}>
                  <option value="">Sem sistema</option>
                  {sistemas.map((s) => <option key={s.id} value={String(s.id)}>{s.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tipo</label>
                <select className="input-field w-full" value={edicao.tipo}
                  onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value })}>
                  {Object.entries(TIPO_LABEL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  {!(edicao.tipo in TIPO_LABEL) && (
                    <option value={edicao.tipo}>{rotuloTipo(Number(edicao.tipo))}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Valor mensal (R$)</label>
                <input type="number" step="0.01" className="input-field w-full" value={edicao.valor}
                  onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Valor anterior (R$)</label>
                <input type="number" step="0.01" className="input-field w-full" value={edicao.valorAntigo}
                  onChange={(e) => setEdicao({ ...edicao, valorAntigo: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Comissão (%)</label>
                <input type="number" step="0.1" className="input-field w-full" value={edicao.percComissao}
                  onChange={(e) => setEdicao({ ...edicao, percComissao: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 sm:pt-6">
                <input type="checkbox" className="accent-blue-600" checked={edicao.ativo}
                  onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
                Plano ativo
              </label>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                O que o plano dá acesso — uma função por linha
              </label>
              <textarea className="input-field w-full min-h-[8rem]" value={edicao.detalhes}
                onChange={(e) => setEdicao({ ...edicao, detalhes: e.target.value })}
                placeholder={'Emissão de NF-e\nControle de estoque\nRelatórios gerenciais'} />
              <p className="text-[11px] text-slate-400 mt-1">
                Cada linha vira um item com marcador no card do plano.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEdicao(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                {edicao.id ? 'Salvar alterações' : 'Criar plano'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
