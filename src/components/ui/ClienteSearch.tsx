import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { api } from '../../services/api'
import clsx from 'clsx'

interface ClienteOption {
  id: number
  nome: string | null
  nomeRazao: string | null
  cnpj: string | null
  cidade: string | null
  uf: string | null
}

interface Props {
  label?: string
  value: string           // clienteId as string
  onChange: (id: string, cliente?: ClienteOption) => void
  placeholder?: string
  required?: boolean
}

let cachedClientes: ClienteOption[] | null = null

export function ClienteSearch({ label, value, onChange, placeholder = 'Digite para buscar cliente...', required }: Props) {
  const [allClientes, setAllClientes] = useState<ClienteOption[]>(cachedClientes ?? [])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ClienteOption | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Load clients once and cache them
  useEffect(() => {
    if (cachedClientes) {
      setAllClientes(cachedClientes)
      return
    }
    api.getClientes().then((list: any) => {
      cachedClientes = list
      setAllClientes(list)
    }).catch(() => {})
  }, [])

  // Sync selected when value changes externally
  useEffect(() => {
    if (!value) {
      setSelected(null)
      setQuery('')
      return
    }
    const found = allClientes.find(c => String(c.id) === value)
    if (found) {
      setSelected(found)
      setQuery('')
    }
  }, [value, allClientes])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim().length < 1 ? [] : allClientes.filter(c => {
    const q = query.toLowerCase()
    return (
      c.nome?.toLowerCase().includes(q) ||
      c.nomeRazao?.toLowerCase().includes(q) ||
      c.cnpj?.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      c.cidade?.toLowerCase().includes(q)
    )
  }).slice(0, 30)

  function select(c: ClienteOption) {
    setSelected(c)
    setQuery('')
    setOpen(false)
    onChange(String(c.id), c)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(null)
    setQuery('')
    setOpen(false)
    onChange('')
  }

  const displayName = selected
    ? (selected.nome || selected.nomeRazao || `#${selected.id}`)
    : null

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          {label}{required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Input area */}
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-900 transition-colors cursor-text',
          open ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-700 hover:border-slate-600'
        )}
        onClick={() => { setOpen(true) }}
      >
        <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />

        {selected && !open ? (
          <span className="flex-1 text-sm text-slate-200 truncate">{displayName}</span>
        ) : (
          <input
            autoFocus={open}
            className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-500 min-w-0"
            placeholder={selected ? (displayName ?? placeholder) : placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
        )}

        {selected && (
          <button onClick={clear} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {query.trim().length < 1 ? (
            <p className="px-4 py-3 text-xs text-slate-500">Digite o nome, razão social, CNPJ ou cidade...</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">Nenhum cliente encontrado.</p>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => select(c)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0"
              >
                <p className="text-sm font-medium text-slate-200 truncate">
                  {c.nome || c.nomeRazao || `#${c.id}`}
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {[c.nomeRazao !== c.nome ? c.nomeRazao : null, c.cnpj, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
