import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  History,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Save,
  X,
  Pencil,
  Palette,
  Type,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Anexos } from '../ui/Anexos'
import { AuditoriaTimeline } from '../ui/AuditoriaTimeline'

type ProntuarioEditorProps = {
  clienteId: number
  initialValue: string
  onSave: (html: string) => Promise<void>
}

const fontOptions = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
]

const sizeOptions = [
  { label: 'Pequena', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Média', value: '4' },
  { label: 'Grande', value: '5' },
]

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function plainTextToHtml(value: string) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return escaped ? `<p>${escaped}</p>` : '<p></p>'
}

function normalizeEditorHtml(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return looksLikeHtml(trimmed) ? trimmed : plainTextToHtml(trimmed)
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function ProntuarioEditor({
  clienteId,
  initialValue,
  onSave,
}: ProntuarioEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => normalizeEditorHtml(initialValue))
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const normalized = normalizeEditorHtml(initialValue)
    setDraft(normalized)
    if (!editing && editorRef.current) {
      editorRef.current.innerHTML = normalized || '<p></p>'
    }
  }, [initialValue, editing])

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = draft || '<p></p>'
    }
  }, [editing, draft])

  const plainPreview = useMemo(() => stripHtml(draft), [draft])
  const characterCount = useMemo(() => plainPreview.length, [plainPreview])

  function focusEditor() {
    editorRef.current?.focus()
  }

  function exec(command: string, value?: string) {
    focusEditor()
    document.execCommand(command, false, value)
    if (editorRef.current) {
      setDraft(editorRef.current.innerHTML)
    }
  }

  function handleInput() {
    setDraft(editorRef.current?.innerHTML ?? '')
  }

  function handleCancel() {
    const normalized = normalizeEditorHtml(initialValue)
    setDraft(normalized)
    if (editorRef.current) {
      editorRef.current.innerHTML = normalized || '<p></p>'
    }
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    const html = (editorRef.current?.innerHTML ?? draft).trim()
    setSaving(true)
    setError(null)
    try {
      await onSave(html)
      setDraft(html)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar o prontuário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <Card className="overflow-hidden border-slate-200/90 dark:border-slate-700">
          <div className="border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Prontuário do cliente</h3>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  Registro central do cliente com anotações, contexto comercial e materiais de apoio.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button size="sm" variant="secondary" icon={<History className="w-4 h-4" />} onClick={() => setShowHistory(true)}>
                  Histórico
                </Button>
                {!editing && (
                  <Button size="sm" variant="secondary" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>
                    Editar prontuário
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              <Button size="sm" variant="secondary" disabled={!editing} icon={<Bold className="w-4 h-4" />} onClick={() => exec('bold')}>
                Negrito
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<Italic className="w-4 h-4" />} onClick={() => exec('italic')}>
                Itálico
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<Underline className="w-4 h-4" />} onClick={() => exec('underline')}>
                Sublinhado
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<List className="w-4 h-4" />} onClick={() => exec('insertUnorderedList')}>
                Lista
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<ListOrdered className="w-4 h-4" />} onClick={() => exec('insertOrderedList')}>
                Numerada
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<Heading1 className="w-4 h-4" />} onClick={() => exec('formatBlock', '<h1>')}>
                Título 1
              </Button>
              <Button size="sm" variant="secondary" disabled={!editing} icon={<Heading2 className="w-4 h-4" />} onClick={() => exec('formatBlock', '<h2>')}>
                Título 2
              </Button>

              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Type className="w-4 h-4" />
                Fonte
                <select
                  disabled={!editing}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                  defaultValue={fontOptions[0].value}
                  onChange={(e) => exec('fontName', e.target.value)}
                >
                  {fontOptions.map((option) => (
                    <option key={option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Heading2 className="w-4 h-4" />
                Tamanho
                <select
                  disabled={!editing}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                  defaultValue="3"
                  onChange={(e) => exec('fontSize', e.target.value)}
                >
                  {sizeOptions.map((option) => (
                    <option key={option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Palette className="w-4 h-4" />
                Cor
                <input
                  disabled={!editing}
                  type="color"
                  className="h-8 w-10 rounded border border-slate-200 dark:border-slate-700 bg-transparent p-1"
                  onChange={(e) => exec('foreColor', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="bg-[linear-gradient(to_bottom,transparent_31px,#e5edf7_32px)] dark:bg-[linear-gradient(to_bottom,transparent_31px,#243041_32px)] bg-[length:100%_32px] px-5 py-5">
            <div
              ref={editorRef}
              contentEditable={editing}
              suppressContentEditableWarning
              onInput={handleInput}
              className="min-h-[420px] w-full rounded-2xl border border-slate-200/80 bg-white/90 px-6 py-5 text-sm leading-8 text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.04)] focus:outline-none dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: draft || '<p></p>' }}
            />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 text-xs text-slate-500">
                {plainPreview ? `Resumo: ${plainPreview.slice(0, 240)}${plainPreview.length > 240 ? '...' : ''}` : 'Nenhum conteúdo cadastrado no prontuário.'}
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {characterCount} caractere{characterCount === 1 ? '' : 's'}
              </div>
              {editing && (
                <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                  <Button size="sm" variant="secondary" icon={<X className="w-4 h-4" />} onClick={handleCancel}>
                    Cancelar
                  </Button>
                  <Button size="sm" icon={<Save className="w-4 h-4" />} loading={saving} onClick={() => void handleSave()}>
                    Salvar
                  </Button>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-3 text-sm text-red-500">{error}</div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200/90 dark:border-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Anotações do prontuário</p>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Use esse espaço para registrar histórico operacional, contexto fiscal, particularidades do atendimento e qualquer material importante do cliente.
            </p>
          </Card>

          <Anexos
            tabela="cliente_prontuario"
            registroId={clienteId}
            title="Arquivos do prontuário"
            emptyLabel="Nenhum arquivo anexado ao prontuário."
            className="border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
      </div>

      {showHistory && (
        <AuditoriaTimeline
          tabela="cliente_prontuario"
          registroId={clienteId}
          titulo="Prontuário do cliente"
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}
