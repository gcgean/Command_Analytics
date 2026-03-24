import clsx from 'clsx'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan'
  className?: string
}

const colorMap = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-500/20',
    icon: 'text-blue-600 dark:text-blue-400',
    trend: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
    trend: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-500/20',
    icon: 'text-amber-600 dark:text-amber-400',
    trend: 'text-amber-600 dark:text-amber-400',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-500/20',
    icon: 'text-red-600 dark:text-red-400',
    trend: 'text-red-600 dark:text-red-400',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-500/20',
    icon: 'text-purple-600 dark:text-purple-400',
    trend: 'text-purple-600 dark:text-purple-400',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-500/20',
    icon: 'text-cyan-600 dark:text-cyan-400',
    trend: 'text-cyan-600 dark:text-cyan-400',
  },
}

export function KPICard({ title, value, subtitle, icon, trend, color = 'blue', className }: KPICardProps) {
  const colors = colorMap[color]

  return (
    <div className={clsx('card p-5 transition-colors duration-300', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={clsx(
                  'text-xs font-medium',
                  trend.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {trend.positive ? '▲' : '▼'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-500">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl transition-colors duration-300', colors.bg)}>
          <span className={clsx('block', colors.icon)}>{icon}</span>
        </div>
      </div>
    </div>
  )
}
