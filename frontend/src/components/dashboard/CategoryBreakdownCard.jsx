import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/card'
import { formatBDT, formatBDTWhole } from '@/lib/format'

const COLORS = ['#064581', '#0755a4', '#ffd21f', '#5b9bd5', '#b9cde3']

export function CategoryBreakdownCard({ items, total, monthLabel }) {
  const empty = items.length === 0
  const chartData = empty ? [{ name: 'None', value: 1 }] : items

  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="px-(--card-spacing)">
        <h2 className="text-lg">Spending by category</h2>
        <p className="text-sm text-muted-foreground">{monthLabel}, {formatBDTWhole(total)} total</p>
      </div>

      <div className="flex flex-col items-center gap-6 px-(--card-spacing) sm:flex-row">
        <div
          className="relative size-44 shrink-0"
          role="img"
          aria-label={
            empty
              ? 'No spending this month'
              : `Spending by category: ${items.map((i) => `${i.name} ${formatBDT(i.value)}`).join(', ')}`
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={empty ? 0 : 2}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((d, i) => (
                  <Cell key={d.name} fill={empty ? 'var(--muted)' : COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              {empty ? null : <Tooltip formatter={(v, name) => [formatBDT(v), name]} />}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="font-heading text-lg font-extrabold tabular-nums">
                {formatBDTWhole(total)}
              </p>
              <p className="text-xs text-muted-foreground">tracked</p>
            </div>
          </div>
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">No spending recorded this month yet.</p>
        ) : (
          <ul className="w-full space-y-3">
            {items.map((item, i) => (
              <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                    aria-hidden="true"
                  />
                  {item.name}
                </span>
                <span className="font-semibold tabular-nums">{formatBDTWhole(item.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
