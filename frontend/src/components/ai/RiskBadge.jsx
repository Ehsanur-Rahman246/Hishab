import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Color-coded risk badge that never relies on color alone:
// the text always spells out the level for screen readers and color-blind users.
const STYLES = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
}

const DOTS = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
}

export function RiskBadge({ level }) {
  const key = level === 'medium' || level === 'high' ? level : 'low'
  const label = key === 'low' ? 'Low risk' : key === 'medium' ? 'Medium risk' : 'High risk'
  return (
    <Badge
      variant="outline"
      aria-label={label}
      className={cn('gap-1.5 py-1 pr-3 pl-2 text-xs font-semibold', STYLES[key])}
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', DOTS[key])} />
      {label}
    </Badge>
  )
}
