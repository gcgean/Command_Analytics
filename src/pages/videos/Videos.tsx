import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Search, BookOpen, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

interface VideoItem {
  id: number
  titulo: string | null
  descricao: string | null
  url: string | null
  tipo: number | null
  categoriaId: number | null
  categoriaDescricao: string | null   // da relação categoria
  colaboradorId: number | null
  colaboradorNome: string | null       // da relação colaborador
  data: string | null                  // DateTime (dataCadastro)
  visualizacoes: number
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

export function Videos() {
  const { toast } = useToast()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [videoAberto, setVideoAberto] = useState<number | null>(null)
  const LIMIT = 24
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadPage = async (pg: number, reset = false) => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const params: Record<string, string> = { page: String(pg), limit: String(LIMIT) }
      if (busca) params.search = busca
      // Observação: se houver mapeamento de descrição -> id, usar categoriaId
      const resp: any = await api.getVideos(params)
      const data: VideoItem[] = resp?.data ?? (Array.isArray(resp) ? resp : [])
      setVideos(prev => reset ? data : [...prev, ...data])
      const pages = resp?.pages ?? 1
      setHasMore(pg < pages)
      setPage(pg)
    } catch {
      // falha silenciosa para não quebrar scroll
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadPage(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1)
      setHasMore(true)
      loadPage(1, true)
    }, 300)
    return () => clearTimeout(handler)
  }, [busca, catFiltro])

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
      loadPage(page + 1)
    }
  }, [hasMore, loadingMore, loading, page])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(onIntersect, { root: null, rootMargin: '200px', threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [onIntersect])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    </div>
  )

  // Categorias únicas vindas do banco
  const categoriasSet = Array.from(new Set(
    videos.map(v => v.categoriaDescricao ?? 'Sem categoria').filter(Boolean)
  ))
  const categorias = ['Todos', ...categoriasSet]

  const filtrados = videos.filter(v => {
    const cat = v.categoriaDescricao ?? 'Sem categoria'
    const matchCat = catFiltro === 'Todos' || cat === catFiltro
    const matchBusca = !busca || (v.titulo ?? '').toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })

  const handleNovoVideo = () => {
    setTimeout(() => toast.success('Vídeo cadastrado com sucesso!'), 800)
  }

  const videoModal = videoAberto ? videos.find(x => x.id === videoAberto) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Biblioteca de Vídeos</h1>
          <p className="text-slate-400 text-sm mt-1">
            {videos.length} vídeos · {categorias.length - 1} categorias
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleNovoVideo}>
          <BookOpen size={16} /> Novo Vídeo
        </button>
      </div>

      {/* Busca */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar vídeo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Filtro por categoria */}
      <div className="flex flex-wrap gap-2">
        {categorias.map((c, i) => (
          <button
            key={`${c}-${i}`}
            onClick={() => setCatFiltro(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              catFiltro === c
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid de vídeos */}
      {filtrados.length === 0 && !loading ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">Nenhum vídeo encontrado para os filtros selecionados.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtrados.map(v => (
              <div
                key={v.id}
                className="card p-0 overflow-hidden cursor-pointer hover:border-slate-600 border border-slate-700 transition-colors"
                onClick={() => setVideoAberto(v.id)}
              >
                <div className="bg-slate-900 h-36 flex items-center justify-center relative group">
                  <div className="w-14 h-14 bg-blue-600/80 rounded-full flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                    <Play size={24} className="text-white fill-white ml-1" />
                  </div>
                  {v.categoriaDescricao && (
                    <span className="absolute top-2 left-2 badge bg-blue-600/80 text-white text-xs">
                      {v.categoriaDescricao}
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {v.visualizacoes} views
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-100 leading-tight mb-1 line-clamp-2">
                    {v.titulo ?? 'Sem título'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{v.colaboradorNome ?? '—'}</span>
                    <span>{formatData(v.data)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(loading || loadingMore) && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {!hasMore && videos.length > 0 && (
            <div className="text-center text-xs text-slate-500 py-4">Fim da lista</div>
          )}
        </>
      )}

      {/* Modal de vídeo */}
      {videoModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setVideoAberto(null)}
        >
          <div className="card max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 h-48 rounded-lg flex items-center justify-center mb-4">
              <Play size={48} className="text-blue-400 fill-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              {videoModal.titulo ?? 'Sem título'}
            </h3>
            {videoModal.descricao && (
              <p className="text-sm text-slate-400 mb-3">{videoModal.descricao}</p>
            )}
            <div className="flex gap-3 text-xs text-slate-500 mb-4">
              <span>{videoModal.colaboradorNome ?? '—'}</span>
              <span>{videoModal.categoriaDescricao ?? '—'}</span>
              <span>{videoModal.visualizacoes} visualizações</span>
            </div>
            <div className="flex gap-2">
              {videoModal.url ? (
                <a
                  href={videoModal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary flex-1 justify-center"
                >
                  Abrir Vídeo
                </a>
              ) : (
                <button
                  className="btn-primary flex-1 justify-center opacity-50 cursor-not-allowed"
                  disabled
                >
                  Sem URL
                </button>
              )}
              <button className="btn-secondary" onClick={() => setVideoAberto(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
