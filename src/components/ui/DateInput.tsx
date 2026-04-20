import { useMemo, useRef } from 'react'
import clsx from 'clsx'
import { Calendar } from 'lucide-react'

type DateMode = 'br' | 'iso'

interface DateInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  mode?: DateMode
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  min?: string
  max?: string
}

function maskDateBR(raw: string) {
  const v = raw.replace(/\D/g, '').slice(0, 8)
  if (v.length <= 2) return v
  if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`
  return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`
}

function brToIso(br: string): string {
  const [d, m, y] = br.split('/')
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function isoToBr(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

export function DateInput({
  label,
  value,
  onChange,
  mode = 'br',
  placeholder,
  className,
  disabled,
  required,
  min,
  max,
}: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement | null>(null)

  const pickerValue = useMemo(() => {
    if (!value) return ''
    return mode === 'br' ? brToIso(value) : value
  }, [mode, value])

  const inputPlaceholder = placeholder ?? (mode === 'br' ? 'dd/mm/aaaa' : 'aaaa-mm-dd')

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          value={value}
          disabled={disabled}
          required={required}
          placeholder={inputPlaceholder}
          inputMode={mode === 'br' ? 'numeric' : undefined}
          maxLength={mode === 'br' ? 10 : undefined}
          onChange={(e) => {
            const raw = e.target.value
            onChange(mode === 'br' ? maskDateBR(raw) : raw)
          }}
          className={clsx(
            'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 pr-11 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 transition-colors duration-200',
            className
          )}
        />
        <button
          type="button"
          disabled={disabled}
          className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-blue-500 disabled:opacity-50"
          onClick={() => {
            const el: any = pickerRef.current
            if (!el) return
            if (typeof el.showPicker === 'function') {
              el.showPicker()
            } else {
              el.focus()
              el.click()
            }
          }}
          aria-label="Abrir calendário"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={pickerValue}
          min={mode === 'br' ? min : min}
          max={mode === 'br' ? max : max}
          onChange={(e) => {
            const raw = e.target.value
            onChange(mode === 'br' ? isoToBr(raw) : raw)
          }}
          className="absolute right-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
        />
      </div>
    </div>
  )
}

