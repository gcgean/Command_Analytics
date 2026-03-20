import clsx from 'clsx'
import type { StatusAtendimento } from '../../types'
import { statusAtendimentoLabel } from '../../services/api'

const statusColors: Record<StatusAtendimento, string> = {
  0:  'bg-red-500/20 text-red-400 border border-red-500/30',    // Atrasado
  1:  'bg-slate-500/20 text-slate-400 border border-slate-500/30', // Na fila
  2:  'bg-blue-500/20 text-blue-400 border border-blue-500/30',   // Em Atendimento
  3:  'bg-amber-500/20 text-amber-400 border border-amber-500/30', // Aguardando Cliente
  4:  'bg-orange-500/20 text-orange-400 border border-orange-500/30', // Aguardando Dev
  5:  'bg-purple-500/20 text-purple-400 border border-purple-500/30', // Em Análise Dev
  6:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', // Aguardando Procedimento
  7:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', // Concluído
  8:  'bg-slate-600/20 text-slate-500 border border-slate-600/30', // Cancelado
  9:  'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',   // Aguardando Testes
  10: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',   // Em Testes
  11: 'bg-green-500/20 text-green-400 border border-green-500/30', // Testado OK
  12: 'bg-lime-500/20 text-lime-400 border border-lime-500/30',   // Aprovado Dev
  13: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30', // Em Desenvolvimento
  14: 'bg-slate-700/40 text-slate-500 border border-slate-700/30', // Arquivados
  15: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',   // Testado com Erro
  16: 'bg-violet-500/20 text-violet-400 border border-violet-500/30', // Corrigido Dev
}

interface StatusBadgeProps {
  status: StatusAtendimento
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        statusColors[status],
        className
      )}
    >
      {statusAtendimentoLabel[status]}
    </span>
  )
}
