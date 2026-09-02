import { useMemo, useRef, useState } from 'react'
import { Eye, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from './Button'
import clsx from 'clsx'
import { Modal } from './Modal'

const MAX_BYTES = 50 * 1024 * 1024
const MAX_FILES = 10

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function canPreviewFile(file: File) {
  return file.type.startsWith('image/') || file.type === 'application/pdf'
}

type PreviewState = {
  isOpen: boolean
  url: string
  mimeType: string
  title: string
}

export function AnexosDraft({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)

  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + (f.size || 0), 0), [files])

  function pick() {
    inputRef.current?.click()
  }

  function onSelect(list: FileList | null) {
    if (!list) return
    const selected = Array.from(list)
    if (files.length >= MAX_FILES) {
      setError(`Limite de ${MAX_FILES} anexos por agendamento.`)
      return
    }
    const available = MAX_FILES - files.length
    const limited = selected.slice(0, available)
    if (selected.length > available) {
      setError(`Limite de ${MAX_FILES} anexos por agendamento. ${available} disponível(is).`)
    } else {
      setError(null)
    }
    if (limited.some(f => f.size > MAX_BYTES)) {
      setError('Um ou mais arquivos excedem 50MB.')
      return
    }
    onChange([...
      files,
      ...limited,
    ])
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeAt(index: number) {
    const next = files.slice()
    next.splice(index, 1)
    onChange(next)
  }

  function openPreview(file: File) {
    const url = URL.createObjectURL(file)
    setPreviewState({ isOpen: true, url, mimeType: file.type, title: file.name })
  }

  function closePreview() {
    setPreviewState(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
      <Modal isOpen={!!previewState?.isOpen} onClose={closePreview} title={previewState?.title || 'Pré-visualização'} size="xl">
        {previewState && (
          <div className="space-y-3">
            {previewState.mimeType.startsWith('image/') ? (
              <img src={previewState.url} alt={previewState.title} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
            ) : (
              <iframe title={previewState.title} src={previewState.url} className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700" />
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
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Anexos</p>
          <span className="text-xs text-slate-500">(serão enviados após salvar)</span>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={e => onSelect(e.target.files)}
            className="hidden"
          />
          <Button size="sm" variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={pick}>
            Selecionar
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {files.length}/{MAX_FILES} arquivo(s) · {formatBytes(totalBytes)}
        </div>
      )}
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}

      <div className="mt-3 divide-y divide-slate-200/70 dark:divide-slate-700/60">
        {files.map((file, idx) => (
          <div key={idx} className="py-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{formatBytes(file.size)} · {file.type || 'application/octet-stream'}</p>
            </div>
            {canPreviewFile(file) && (
              <button
                onClick={() => openPreview(file)}
                className={clsx('p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors')}
                title="Pré-visualizar"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => removeAt(idx)}
              className={clsx('p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors')}
              title="Remover"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {files.length === 0 && (
          <div className="py-4 text-xs text-slate-500">Nenhum anexo selecionado.</div>
        )}
      </div>
    </div>
  )
}

