import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatBDT, formatDate } from '@/lib/format'

// Section D: ML-detected unusual expenses (at most 5, newest first).
// `items` may be null when unknown (saved view) — the page decides what to pass.
export function UnusualExpenses({ items }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Unusual expenses</CardTitle>
        <CardDescription>
          Purchases much larger than your usual pattern.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No unusual spending detected.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((u, i) => (
              <li
                key={`${u.date}-${u.amount}-${i}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {u.category || 'Expense'} · {formatDate(u.date)}
                  </span>
                  {u.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {u.description}
                    </span>
                  ) : null}
                  {(u.reasons ?? (u.reason ? [u.reason] : [])).map((r) => (
                    <span key={r} className="text-xs text-muted-foreground">
                      {r}
                    </span>
                  ))}
                  {u.severity ? (
                    <span className="text-xs font-medium text-muted-foreground">
                      Severity: {u.severity}
                      {u.anomalyScore !== undefined && u.anomalyScore !== null
                        ? ` · score ${Number(u.anomalyScore).toFixed(2)}`
                        : ""}
                      {u.detectionMethod ? ` · ${String(u.detectionMethod).replace(/_/g, " ")}` : ""}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {formatBDT(u.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
