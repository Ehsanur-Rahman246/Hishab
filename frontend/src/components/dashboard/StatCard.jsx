import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Tiny trend line. Decorative only, the number next to it carries the meaning.
function Sparkline({ data }) {
  const W = 84
  const H = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * W
      const y = max === min ? H / 2 : H - 3 - ((v - min) / range) * (H - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[84px] shrink-0 text-primary" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeltaChip({ delta }) {
  if (!delta || delta.value === null || !Number.isFinite(delta.value)) {
    return <span className="text-xs text-muted-foreground">No earlier month to compare</span>
  }
  const v = delta.value
  const flat = Math.abs(v) < 0.05
  const up = v > 0
  const good = flat ? null : up === (delta.goodWhen === 'up')
  const Icon = up ? ArrowUpRight : ArrowDownRight

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums',
          flat && 'bg-muted text-muted-foreground',
          good === true && 'bg-success/10 text-success',
          good === false && 'bg-destructive/10 text-destructive',
        )}
      >
        {flat ? null : <Icon className="size-3.5" aria-hidden="true" />}
        <span className="sr-only">{flat ? 'No change' : up ? 'Up' : 'Down'}</span>
        {flat ? '0' : Math.abs(v).toFixed(1)}
        {delta.unit}
      </span>
      <span className="text-muted-foreground">vs last month</span>
    </div>
  )
}

export function StatCard({ label, value, icon: Icon, delta, spark, highlight = false }) {
  return (
    <Card
      className={cn(
        'relative gap-3 shadow-panel [--card-spacing:--spacing(5)]',
        highlight && 'ring-2 ring-accent',
      )}
    >
      {highlight ? <span className="absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden="true" /> : null}

      <div className="flex items-center justify-between px-(--card-spacing)">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'grid size-9 place-items-center rounded-lg',
            highlight ? 'bg-accent text-accent-foreground' : 'bg-secondary text-primary',
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 px-(--card-spacing)">
        <span className="font-heading text-3xl font-extrabold tabular-nums tracking-tight">
          {value}
        </span>
        {spark ? <Sparkline data={spark} /> : null}
      </div>

      <div className="px-(--card-spacing)">
        <DeltaChip delta={delta} />
      </div>
    </Card>
  )
}
