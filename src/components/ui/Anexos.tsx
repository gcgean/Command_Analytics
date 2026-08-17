import { useEffect, useMemo, useRef, useState } from 'react'
import { Paperclip, Upload, Download, Trash2, Eye } from 'lucide-react'
import { api } from '../../services/api'
import { Button } from './Button'
import clsx from 'clsx'
import { Modal } from './Modal'

type TabelaAnexo = 'agenda' | 'agendamento_programado' | 'cliente_prontuario' | 'banco_de_horas'

type Anexo = {
  id: number
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

type PreviewState = {
  isOpen: boolean
  url: string
  mimeType: string
  title: string
}

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toSafeFilename(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return cleaned || 'arquivo'
}

function canPreview(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf'
}

export function Anexos({
  tabela,
  registroId,
  className,
  title = 'Anexos',
  emptyLabel = 'Nenhum anexo.',
}: {
  tabela: TabelaAnexo
  registroId: number
  className?: string
  title?: string
  emptyLabel?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<Anexo[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<File[]>([])
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const selectedBytes = useMemo(() => selected.reduce((acc, f) => acc + (f.size || 0), 0), [selected])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listAnexos({ tabela, registroId })
      setItems((Array.isArray(list) ? list : []) as Anexo[])
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar anexos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [tabela, registroId])

  function onSelectFiles(files: FileList | null) {
    if (!files) return
    if (items.length >= MAX_FILES) {
      setError(`Limite de ${MAX_FILES} anexos por registro.`)
      return
    }
    const arr = Array.from(files)
    const available = MAX_FILES - items.length
    const limited = arr.slice(0, available)
    if (arr.length > available) {
      setError(`Limite de ${MAX_FILES} anexos por registro. ${available} disponível(is).`)
    } else {
      setError(null)
    }
    setSelected(limited)
  }

  async function upload() {
    if (selected.length === 0) return
    if (items.length + selected.length > MAX_FILES) {
      setError(`Limite de ${MAX_FILES} anexos por registro.`)
      return
    }
    if (selected.some(f => f.size > MAX_BYTES)) {
      setError('Um ou mais arquivos excedem 10MB.')
      return
    }
    setUploading(true)
    setError(null)
    setProgress(0)
    try {
      await api.uploadAnexos({ tabela, registroId, files: selected, onProgress: (p) => setProgress(p) })
      setSelected([])
      if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (e: any) {
      setError(e?.message || 'Falha ao enviar anexos')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function downloadItem(item: Anexo) {
    try {
      const blob = await api.getAnexoBlob(item.id, { download: true })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = toSafeFilename(item.originalName)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message || 'Falha ao baixar anexo')
    }
  }

  async function previewItem(item: Anexo) {
    try {
      const blob = await api.getAnexoBlob(item.id, { download: false })
      const url = URL.createObjectURL(blob)
      setPreview({ isOpen: true, url, mimeType: item.mimeType, title: item.originalName })
    } catch (e: any) {
      setError(e?.message || 'Falha ao pré-visualizar anexo')
    }
  }

  function closePreview() {
    setPreview(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  async function removeItem(item: Anexo) {
    if (!confirm('Excluir este anexo?')) return
    try {
      await api.deleteAnexo(item.id)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir anexo')
    }
  }

  return (
    <div className={clsx('rounded-lg border border-slate-200 dark:border-slate-700 p-3', className)}>
      <Modal isOpen={!!preview?.isOpen} onClose={closePreview} title={preview?.title || 'Pré-visualização'} size="xl">
        {preview && (
          <div className="space-y-3">
            {preview.mimeType.startsWith('image/') ? (
              <img src={preview.url} alt={preview.title} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
            ) : (
              <iframe title={preview.title} src={preview.url} className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700" />
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={closePreview}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
          {loading && <span className="text-xs text-slate-500">Carregando...</span>}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={e => onSelectFiles(e.target.files)}
            className="hidden"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => inputRef.current?.click()}
          >
            Selecionar
          </Button>
          <Button
            size="sm"
            icon={<Upload className="w-4 h-4" />}
            loading={uploading}
            disabled={selected.length === 0}
            onClick={() => void upload()}
          >
            Enviar
          </Button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {items.length + selected.length}/{MAX_FILES} arquivo(s) · {formatBytes(selectedBytes)}
        </div>
      )}

      {uploading && (
        <div className="mt-2">
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-2 bg-blue-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Enviando... {progress}%</div>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="mt-3 divide-y divide-slate-200/70 dark:divide-slate-700/60">
        {items.map(item => (
          <div key={item.id} className="py-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{item.originalName}</p>
              <p className="text-[11px] text-slate-500 truncate">{formatBytes(item.sizeBytes)} · {item.mimeType}</p>
            </div>
            {canPreview(item.mimeType) && (
              <button
                onClick={() => void previewItem(item)}
                className={clsx('p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors')}
                title="Pré-visualizar"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => void downloadItem(item)}
              className={clsx('p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors')}
              title="Baixar"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => void removeItem(item)}
              className={clsx('p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors')}
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="py-4 text-xs text-slate-500">{emptyLabel}</div>
        )}
      </div>
    </div>
  )
}

