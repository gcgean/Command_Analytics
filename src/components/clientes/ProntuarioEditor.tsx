import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const applyingHistoryRef = useRef(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => normalizeEditorHtml(initialValue))
  const [showHistory, setShowHistory] = useState(false)

  function getEditorHtml() {
    return editorRef.current?.innerHTML?.trim() || ''
  }

  function syncEditorFromHtml(value: string) {
    if (!editorRef.current) return
    editorRef.current.innerHTML = value || '<p></p>'
  }

  function resetHistory(value: string) {
    const html = value || '<p></p>'
    historyRef.current = [html]
    historyIndexRef.current = 0
  }

  function recordHistory(value: string) {
    if (applyingHistoryRef.current) return

    const html = value || '<p></p>'
    const current = historyRef.current[historyIndexRef.current]
    if (current === html) return

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    nextHistory.push(html)
    if (nextHistory.length > 200) {
      nextHistory.shift()
    }
    historyRef.current = nextHistory
    historyIndexRef.current = nextHistory.length - 1
  }

  function applyHistory(direction: 'undo' | 'redo') {
    const delta = direction === 'undo' ? -1 : 1
    const nextIndex = historyIndexRef.current + delta
    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return

    const nextHtml = historyRef.current[nextIndex] || '<p></p>'
    applyingHistoryRef.current = true
    historyIndexRef.current = nextIndex
    syncEditorFromHtml(nextHtml)
    setDraft(nextHtml)
    requestAnimationFrame(() => {
      applyingHistoryRef.current = false
      focusEditorAtEnd()
    })
  }

  useEffect(() => {
    const normalized = normalizeEditorHtml(initialValue)
    setDraft(normalized)
    resetHistory(normalized)
    if (editorRef.current) {
      syncEditorFromHtml(normalized)
    }
  }, [initialValue])

  useEffect(() => {
    if (!editorRef.current) return

    if (editing) {
      syncEditorFromHtml(draft)
      document.execCommand('defaultParagraphSeparator', false, 'p')
      resetHistory(draft)
      focusEditorAtEnd()
      return
    }

    syncEditorFromHtml(draft)
  }, [editing])

  const plainPreview = useMemo(() => stripHtml(draft), [draft])
  const characterCount = useMemo(() => plainPreview.length, [plainPreview])

  function focusEditor() {
    editorRef.current?.focus()
  }

  function focusEditorAtEnd() {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()

    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function exec(command: string, value?: string) {
    focusEditor()
    document.execCommand(command, false, value)
    const nextHtml = getEditorHtml()
    setDraft(nextHtml)
    recordHistory(nextHtml)
  }

  function handleInput() {
    const nextHtml = getEditorHtml()
    setDraft(nextHtml)
    recordHistory(nextHtml)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!editing) return
    const isModifierPressed = event.ctrlKey || event.metaKey
    if (!isModifierPressed) return

    const key = event.key.toLowerCase()
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      applyHistory('undo')
      return
    }

    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault()
      applyHistory('redo')
    }
  }

  function handleCancel() {
    const normalized = normalizeEditorHtml(initialValue)
    setDraft(normalized)
    resetHistory(normalized)
    syncEditorFromHtml(normalized)
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    const html = getEditorHtml() || draft
    setSaving(true)
    setError(null)
    try {
      await onSave(html)
      setDraft(html)
      resetHistory(html)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar o prontuário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 md:gap-6 items-start">
        <Card className="min-w-0 overflow-hidden border-slate-200/90 dark:border-slate-700">
          <div className="border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Prontuário do cliente</h3>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  Registro central do cliente com anotações, contexto comercial e materiais de apoio.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button className="w-full sm:w-auto" size="sm" variant="secondary" icon={<History className="w-4 h-4" />} onClick={() => setShowHistory(true)}>
                  Histórico
                </Button>
                {!editing && (
                  <Button className="w-full sm:w-auto" size="sm" variant="secondary" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>
                    Editar prontuário
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
            {editing && (
              <div className="border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Editando prontuário...
                  </div>
                  <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:justify-end">
                    <Button className="w-full sm:w-auto" size="sm" variant="secondary" icon={<X className="w-4 h-4" />} onClick={handleCancel}>
                      Cancelar
                    </Button>
                    <Button className="w-full sm:w-auto" size="sm" icon={<Save className="w-4 h-4" />} loading={saving} onClick={() => void handleSave()}>
                      Salvar prontuário
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 py-3 sm:px-5">
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

                <label className="flex min-w-max shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Type className="w-4 h-4" />
                  Fonte
                  <select
                    disabled={!editing}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    defaultValue={fontOptions[0].value}
                    onChange={(e) => exec('fontName', e.target.value)}
                  >
                    {fontOptions.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-max shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Heading2 className="w-4 h-4" />
                  Tamanho
                  <select
                    disabled={!editing}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    defaultValue="3"
                    onChange={(e) => exec('fontSize', e.target.value)}
                  >
                    {sizeOptions.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-max shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Palette className="w-4 h-4" />
                  Cor
                  <input
                    disabled={!editing}
                    type="color"
                    className="h-8 w-10 rounded border border-slate-200 bg-transparent p-1 dark:border-slate-700"
                    onChange={(e) => exec('foreColor', e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="bg-[linear-gradient(to_bottom,transparent_31px,#e5edf7_32px)] bg-[length:100%_32px] px-3 py-3 dark:bg-[linear-gradient(to_bottom,transparent_31px,#243041_32px)] sm:px-5 sm:py-5">
            <div
              ref={editorRef}
              contentEditable={editing}
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              dir="ltr"
              spellCheck
              className="min-h-[320px] w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 text-left text-sm leading-7 text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.04)] break-words focus:outline-none dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-200 sm:min-h-[420px] sm:px-6 sm:py-5 sm:leading-8"
            />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="min-w-0 text-xs text-slate-500">
                {plainPreview ? `Resumo: ${plainPreview.slice(0, 240)}${plainPreview.length > 240 ? '...' : ''}` : 'Nenhum conteúdo cadastrado no prontuário.'}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {characterCount} caractere{characterCount === 1 ? '' : 's'}
                </div>
                {editing && (
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <Button className="w-full sm:w-auto" size="sm" variant="secondary" icon={<X className="w-4 h-4" />} onClick={handleCancel}>
                    Cancelar
                  </Button>
                  <Button className="w-full sm:w-auto" size="sm" icon={<Save className="w-4 h-4" />} loading={saving} onClick={() => void handleSave()}>
                    Salvar
                  </Button>
                </div>
                )}
              </div>
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
