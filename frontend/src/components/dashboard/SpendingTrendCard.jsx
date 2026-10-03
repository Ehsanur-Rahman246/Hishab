import { Link } from 'react-router'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { formatBDT, formatBDTCompact } from '@/lib/format'

export function SpendingTrendCard({ trend, hasSpending }) {
  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
        <div>
          <h2 className="text-lg">Monthly spending trend</h2>
          <p className="text-sm text-muted-foreground">
            Last 6 months vs. previous 3-month baseline
          </p>
        </div>
        <Link to="/analytics" className="shrink-0 text-sm font-semibold text-primary hover:underline">
          All analytics
        </Link>
      </div>

      <div className="px-(--card-spacing)">
        {hasSpending ? (
          <div
            className="h-64 w-full"
            role="img"
            aria-label={`Monthly spending, ${trend
              .map((t) => `${t.label} ${formatBDT(t.spent)}`)
              .join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  width={56}
                  domain={[
                    (min) => Math.max(0, Math.floor(min * 0.85)),
                    (max) => Math.ceil(max * 1.05),
                  ]}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatBDTCompact}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                />
                <Tooltip
                  formatter={(v, name) => [formatBDT(v), name]}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  name="3-month baseline"
                  dataKey="baseline"
                  stroke="var(--chart-5)"
                  strokeOpacity={0.45}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  name="Spending"
                  dataKey="spent"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-64 place-items-center rounded-xl bg-muted/60 text-center">
            <div className="max-w-xs px-4">
              <p className="font-medium">No spending recorded yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your trend appears here once you add expenses.
              </p>
              <Link to="/transactions" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                Add a transaction
              </Link>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
