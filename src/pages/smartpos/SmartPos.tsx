import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ChevronDown, Loader2, Search, Smartphone, Plus, Pencil, Trash2, ImagePlus, AlertTriangle, Zap,
} from 'lucide-react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { TerminalSmartPos, GrupoSmartPos } from '../../types'

interface Rascunho {
  id: number | null
  adquirente: string
  modelo: string
  fabricante: string
  observacao: string
  integracaoPropria: boolean
  integracaoNome: string
  ativo: boolean
}

const vazio = (adquirente = ''): Rascunho => ({
  id: null, adquirente, modelo: '', fabricante: '', observacao: '',
  integracaoPropria: false, integracaoNome: '', ativo: true,
})

export function SmartPos() {
  const { toast } = useToast()
  const [grupos, setGrupos] = useState<GrupoSmartPos[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [abertos, setAbertos] = useState<string[]>([])
  const [fotos, setFotos] = useState<Record<number, string>>({})

  const [edicao, setEdicao] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const entradaFoto = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.getSmartPos({ busca: busca.trim() || undefined, todos: incluirInativos })
      setGrupos(r.grupos)
      // Buscando um modelo, abrir tudo é o que a pessoa quer ver.
      if (busca.trim()) setAbertos(r.grupos.map((g) => g.adquirente))
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar o catálogo.')
    } finally {
      setCarregando(false)
    }
  }, [toast, busca, incluirInativos])

  useEffect(() => { void carregar() }, [carregar])

  // A leitura da foto é autenticada, então a miniatura vem por blob.
  useEffect(() => {
    let vivo = true
    const criadas: string[] = []
    void (async () => {
      for (const g of grupos) {
        for (const t of g.terminais) {
          if (!t.temImagem || fotos[t.id]) continue
          const blob = await api.getFotoSmartPosBlob(t.id).catch(() => null)
          if (!blob || !vivo) continue
          const url = URL.createObjectURL(blob)
          criadas.push(url)
          setFotos((m) => ({ ...m, [t.id]: url }))
        }
      }
    })()
    return () => { vivo = false; criadas.forEach((u) => URL.revokeObjectURL(u)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos])

  const total = useMemo(
    () => grupos.reduce((s, g) => s + g.terminais.length, 0), [grupos])

  function alternar(adquirente: string) {
    setAbertos((a) => a.includes(adquirente)
      ? a.filter((x) => x !== adquirente)
      : [...a, adquirente])
  }

  async function salvar() {
    if (!edicao) return
    if (!edicao.adquirente.trim() || !edicao.modelo.trim()) {
      return toast.error('Informe a adquirente e o modelo.')
    }
    setSalvando(true)
    try {
      await api.salvarSmartPos(edicao.id, {
        adquirente: edicao.adquirente.trim(),
        modelo: edicao.modelo.trim(),
        fabricante: edicao.fabricante.trim() || null,
        observacao: edicao.observacao.trim() || null,
        integracaoPropria: edicao.integracaoPropria,
        integracaoNome: edicao.integracaoNome.trim() || null,
        ativo: edicao.ativo,
      })
      toast.success(edicao.id ? 'Terminal atualizado.' : 'Terminal cadastrado.')
      setEdicao(null)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(t: TerminalSmartPos) {
    if (!window.confirm(`Excluir ${t.modelo} da ${t.adquirente}?`)) return
    await api.excluirSmartPos(t.id).catch(() => {})
    toast.info('Terminal removido.')
    await carregar()
  }

  async function enviarFoto(arquivo: File) {
    if (!edicao?.id) return toast.error('Salve o terminal antes de enviar a foto.')
    try {
      await api.enviarFotoSmartPos(edicao.id, arquivo)
      const blob = await api.getFotoSmartPosBlob(edicao.id).catch(() => null)
      if (blob) setFotos((m) => ({ ...m, [edicao.id as number]: URL.createObjectURL(blob) }))
      toast.success('Foto atualizada.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar a foto.')
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white"><Smartphone size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              SmartPOS compatíveis
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {total} terminais em {grupos.length} adquirentes. Clique na adquirente para ver os modelos.
            </p>
          </div>
        </div>
        <Button onClick={() => setEdicao(vazio())}>
          <Plus size={16} /> Novo terminal
        </Button>
      </div>

      <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Lista de referência da homologação do fornecedor TEF. Modelo que não está aqui não
          é necessariamente incompatível, e o que está pode depender da versão do aparelho —
          confirme com a equipe técnica antes de prometer ao cliente.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input-field pl-9 w-full" placeholder="Buscar por modelo, fabricante ou adquirente..."
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="accent-blue-600" checked={incluirInativos}
            onChange={(e) => setIncluirInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {carregando && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      )}

      {!carregando && grupos.length === 0 && (
        <div className="py-16 text-center text-slate-500">Nenhum terminal encontrado.</div>
      )}

      {!carregando && (
        <div className="grid gap-3 lg:grid-cols-2">
          {grupos.map((g) => {
            const aberto = abertos.includes(g.adquirente)
            return (
              <Card key={g.adquirente} padding="none">
                <button onClick={() => alternar(g.adquirente)}
                  className={clsx('w-full flex items-center justify-between gap-2 px-4 py-3 text-left rounded-xl',
                    aberto && 'bg-slate-900 dark:bg-slate-700 text-white rounded-b-none')}>
                  <span className="font-semibold">
                    {g.adquirente}
                    <span className={clsx('ml-2 text-xs font-normal',
                      aberto ? 'text-slate-300' : 'text-slate-400')}>
                      {g.terminais.length} {g.terminais.length === 1 ? 'modelo' : 'modelos'}
                    </span>
                  </span>
                  <ChevronDown className={clsx('w-4 h-4 transition-transform', aberto && 'rotate-180')} />
                </button>

                {aberto && (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {g.terminais.map((t) => (
                      <div key={t.id}
                        className={clsx('rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center relative group',
                          !t.ativo && 'opacity-50')}>
                        <div className="h-24 flex items-center justify-center mb-2 relative">
                          {fotos[t.id]
                            ? <img src={fotos[t.id]} alt={t.modelo} className="max-h-24 object-contain" />
                            : <Smartphone className="w-8 h-8 text-slate-300 dark:text-slate-600" />}
                          {/* Sobre a imagem porque muda o caminho todo: não é habilitação
                              pelo Smart TEF, e quem bate o olho precisa ver antes de pedir. */}
                          {t.integracaoPropria && (
                            <span className="absolute -top-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold shadow">
                              <Zap className="w-3 h-3" /> Integração própria
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.modelo}</p>
                        {t.fabricante && <p className="text-xs text-slate-500">{t.fabricante}</p>}
                        {t.integracaoPropria && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                            {t.integracaoNome
                              ? `Integra direto: ${t.integracaoNome}`
                              : 'Integra direto, sem Smart TEF'}
                          </p>
                        )}
                        {t.observacao && !t.integracaoPropria && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{t.observacao}</p>
                        )}
                        {!t.ativo && <p className="text-[10px] text-slate-400 mt-1">inativo</p>}

                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button title="Editar"
                            onClick={() => setEdicao({
                              id: t.id, adquirente: t.adquirente, modelo: t.modelo,
                              fabricante: t.fabricante ?? '', observacao: t.observacao ?? '',
                              integracaoPropria: t.integracaoPropria,
                              integracaoNome: t.integracaoNome ?? '',
                              ativo: t.ativo,
                            })}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button title="Excluir" onClick={() => void excluir(t)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setEdicao(vazio(g.adquirente))}
                      className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:border-blue-400 hover:text-blue-500 flex flex-col items-center justify-center gap-1 py-6">
                      <Plus className="w-5 h-5" />
                      <span className="text-xs">Adicionar</span>
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!edicao} onClose={() => !salvando && setEdicao(null)}
        title={edicao?.id ? 'Editar terminal' : 'Novo terminal'} size="md" fechavelPorFora={false}>
        {edicao && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-24 h-24 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
                {edicao.id && fotos[edicao.id]
                  ? <img src={fotos[edicao.id]} alt="" className="max-h-24 object-contain" />
                  : <Smartphone className="w-7 h-7 text-slate-300 dark:text-slate-600" />}
              </div>
              <div className="space-y-1.5">
                <input ref={entradaFoto} type="file" className="hidden"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarFoto(f); e.target.value = '' }} />
                <Button variant="secondary" size="sm" disabled={!edicao.id}
                  onClick={() => entradaFoto.current?.click()}>
                  <ImagePlus className="w-3.5 h-3.5" /> Foto do aparelho
                </Button>
                <p className="text-[11px] text-slate-400">
                  {edicao.id
                    ? 'JPG, PNG, WEBP ou SVG, até 3 MB.'
                    : 'Salve o terminal primeiro para enviar a foto.'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Adquirente</label>
                <input className="input-field w-full" list="adquirentes" value={edicao.adquirente}
                  onChange={(e) => setEdicao({ ...edicao, adquirente: e.target.value })} />
                <datalist id="adquirentes">
                  {grupos.map((g) => <option key={g.adquirente} value={g.adquirente} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Modelo</label>
                <input className="input-field w-full" value={edicao.modelo}
                  onChange={(e) => setEdicao({ ...edicao, modelo: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Fabricante</label>
                <input className="input-field w-full" value={edicao.fabricante}
                  onChange={(e) => setEdicao({ ...edicao, fabricante: e.target.value })}
                  placeholder="Ingenico, PAX, Sunmi..." />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 sm:pt-6">
                <input type="checkbox" className="accent-blue-600" checked={edicao.ativo}
                  onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
                Homologado / ativo
              </label>
            </div>

            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                <input type="checkbox" className="accent-emerald-600" checked={edicao.integracaoPropria}
                  onChange={(e) => setEdicao({ ...edicao, integracaoPropria: e.target.checked })} />
                <Zap className="w-4 h-4 text-emerald-600" />
                Este aparelho tem integração própria
              </label>
              {edicao.integracaoPropria && (
                <input className="input-field w-full" value={edicao.integracaoNome}
                  onChange={(e) => setEdicao({ ...edicao, integracaoNome: e.target.value })}
                  placeholder="Qual integração? Ex.: SDK Cielo LIO, Stone Connect" />
              )}
              <p className="text-[11px] text-slate-500">
                Integra direto com o Command, sem passar pelo Smart TEF — o caminho de
                habilitação é outro. Aparece em destaque sobre a foto do aparelho.
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Observação</label>
              <input className="input-field w-full" value={edicao.observacao}
                onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })}
                placeholder="Ex.: só a partir da versão X do firmware" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEdicao(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                {edicao.id ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
