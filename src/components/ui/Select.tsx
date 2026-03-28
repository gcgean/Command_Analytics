import clsx from 'clsx'

interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, className, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <select
        {...props}
        className={clsx(
          'bg-white dark:bg-slate-900 border text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200 cursor-pointer',
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
          className
        )}
      >
        {placeholder && (
          <option value="" className="text-slate-500">{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
