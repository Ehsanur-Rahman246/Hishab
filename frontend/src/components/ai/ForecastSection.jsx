import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RiskBadge } from '@/components/ai/RiskBadge'
import { formatBDT, formatDate } from '@/lib/format'

// Week row shape (built by the page from either live or saved data):
// { weekStart, income, expense, net, risk, balance | null }
export function ForecastSection({ weeks }) {
  if (!weeks || weeks.length === 0) return null

  const showBalance = weeks.some((w) => w.balance !== null && w.balance !== undefined)
  // Scale the CSS bars against the largest weekly figure so weeks stay comparable.
  const maxValue = Math.max(
    1,
    ...weeks.flatMap((w) => [Number(w.income) || 0, Number(w.expense) || 0]),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next {weeks.length} weeks forecast</CardTitle>
        <CardDescription>
          Predicted income vs expense per week, starting Monday.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead className="text-right">Income</TableHead>
              <TableHead className="text-right">Expense</TableHead>
              <TableHead className="text-right">Net</TableHead>
              {showBalance ? <TableHead className="text-right">Balance</TableHead> : null}
              <TableHead className="text-right">Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeks.map((w) => (
              <TableRow key={w.weekStart}>
                <TableCell className="font-medium whitespace-nowrap">
                  {formatDate(w.weekStart)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatBDT(w.income)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatBDT(w.expense)}
                </TableCell>
                <TableCell
                  className={
                    Number(w.net) < 0
                      ? 'text-right font-medium whitespace-nowrap text-red-600 dark:text-red-400'
                      : 'text-right font-medium whitespace-nowrap'
                  }
                >
                  {formatBDT(w.net)}
                </TableCell>
                {showBalance ? (
                  <TableCell className="text-right whitespace-nowrap">
                    {w.balance === null || w.balance === undefined
                      ? '—'
                      : formatBDT(w.balance)}
                  </TableCell>
                ) : null}
                <TableCell className="text-right">
                  <RiskBadge level={w.risk} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pure CSS/Tailwind bars: income vs expense per week (no chart lib). */}
        <div className="flex flex-col gap-3" aria-hidden="true">
          {weeks.map((w) => {
            const income = Number(w.income) || 0
            const expense = Number(w.expense) || 0
            return (
              <div key={w.weekStart} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDate(w.weekStart)}
                </span>
                <div
                  className="h-2 rounded-full bg-emerald-500/70"
                  style={{ width: `${Math.max((income / maxValue) * 100, income > 0 ? 2 : 0)}%` }}
                />
                <div
                  className="h-2 rounded-full bg-rose-500/70"
                  style={{ width: `${Math.max((expense / maxValue) * 100, expense > 0 ? 2 : 0)}%` }}
                />
              </div>
            )
          })}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-full bg-emerald-500/70" /> Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-full bg-rose-500/70" /> Expense
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
