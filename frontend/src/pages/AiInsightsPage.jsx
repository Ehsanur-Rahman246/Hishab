import { useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AiCoach } from '@/components/ai/AiCoach'
import { DataQualityNotice } from '@/components/ai/DataQualityNotice'
import { ForecastSection } from '@/components/ai/ForecastSection'
import { InsightsSkeleton } from '@/components/ai/InsightsSkeleton'
import { OverallRiskCard } from '@/components/ai/OverallRiskCard'
import { UnusualExpenses } from '@/components/ai/UnusualExpenses'
import {
  toApiError,
  useGenerateInsights,
  useLatestInsights,
} from '@/hooks/useAiInsights'
import { formatDateTime } from '@/lib/format'

const RISKS = ['low', 'medium', 'high']
const safeRisk = (r) => (RISKS.includes(r) ? r : 'low')
const weekKey = (d) => String(d ?? '').slice(0, 10)

// Saved snapshot weeks -> table rows (predictedBalance included).
function rowsFromSaved(weeks) {
  return (weeks ?? []).map((w) => {
    const income = Number(w?.predictedInflow) || 0
    const expense = Number(w?.predictedOutflow) || 0
    return {
      weekStart: w?.weekStart,
      income,
      expense,
      net: income - expense,
      risk: safeRisk(w?.shortfallRisk),
      balance: w?.predictedBalance ?? null,
    }
  })
}

// Live FastAPI weeks -> table rows; balances matched from the saved snapshot.
function rowsFromLive(weeks, balancesByWeek) {
  return (weeks ?? []).map((w) => {
    const income = Number(w?.predictedIncome) || 0
    const expense = Number(w?.predictedExpense) || 0
    const net = Number(w?.estimatedNetCashflow)
    return {
      weekStart: w?.weekStart,
      income,
      expense,
      net: Number.isFinite(net) ? net : income - expense,
      risk: safeRisk(w?.risk),
      balance: balancesByWeek.get(weekKey(w?.weekStart)) ?? null,
    }
  })
}

function worstRisk(rows) {
  if (rows.some((r) => r.risk === 'high')) return 'high'
  if (rows.some((r) => r.risk === 'medium')) return 'medium'
  return 'low'
}

export function AiInsightsPage() {
  // `live` holds the last freshly generated analysis (this session).
  // `latest` holds the last snapshot saved in MongoDB.
  const [live, setLive] = useState(null)
  const [liveAt, setLiveAt] = useState(null)

  const latest = useLatestInsights()
  const generate = useGenerateInsights()

  const saved = latest.data?.forecast ?? null
  const balancesByWeek = new Map(
    (saved?.weeks ?? []).map((w) => [weekKey(w?.weekStart), w?.predictedBalance ?? null]),
  )

  const liveWeeks = live?.mlInsights?.forecast?.weeks
  const rows = liveWeeks
    ? rowsFromLive(liveWeeks, balancesByWeek)
    : rowsFromSaved(saved?.weeks)
  const hasRows = rows.length > 0

  const overall = live?.mlInsights?.overallRisk ?? null
  const riskLevel = overall?.level ? safeRisk(overall.level) : worstRisk(rows)
  const riskReason =
    overall?.reason ??
    'Worst weekly risk from your last saved forecast. Refresh for a fresh assessment.'
  const riskSubtitle = live ? 'Fresh analysis' : 'From last saved forecast'

  const quality = live?.mlInsights?.dataQuality ?? null
  const unusual = live?.mlInsights?.unusualExpenses ?? null // null = unknown until regenerate

  const latestError = latest.error
    ? toApiError(latest.error, 'Could not load saved insights.')
    : null
  const generateError = generate.error
    ? toApiError(generate.error, 'Could not generate insights.')
    : null

  const isLoading = (latest.isPending && !live) || (generate.isPending && !hasRows)
  // 404 (never generated) and 400 (no transactions) are empty states, not errors.
  const showEmpty =
    !hasRows && !isLoading && (latestError?.status === 404 || latestError?.status === 400)

  const handleGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: (data) => {
        setLive(data)
        setLiveAt(new Date().toISOString())
      },
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      {/* A. Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5" aria-hidden="true" />
              AI Financial Insights
            </CardTitle>
            <CardDescription>
              Personalized from your transaction history
              {liveAt
                ? ` · Generated ${formatDateTime(liveAt)}`
                : saved?.generatedAt
                  ? ` · Last saved ${formatDateTime(saved.generatedAt)}`
                  : null}
            </CardDescription>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generate.isPending}
            className="shrink-0"
          >
            <RefreshCw
              className={generate.isPending ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {generate.isPending ? 'Refreshing…' : 'Refresh insights'}
          </Button>
        </CardHeader>
      </Card>

      {/* Generate-time errors (saved data below stays visible). */}
      {generateError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not generate insights</AlertTitle>
          <AlertDescription>{generateError.message}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? <InsightsSkeleton /> : null}

      {/* Load-time errors that are not empty states. */}
      {!isLoading && latestError && !showEmpty ? (
        <Alert variant={latestError.status === 503 ? 'warning' : 'destructive'}>
          <AlertTitle>
            {latestError.status === 401
              ? 'Please log in'
              : latestError.status === 503
                ? 'Service unavailable'
                : 'Something went wrong'}
          </AlertTitle>
          <AlertDescription>
            {latestError.status === 401
              ? 'Log in to your Hishab account to view AI insights.'
              : latestError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Empty state: never generated (404) or no transactions yet (400). */}
      {showEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-base font-medium">
              {latestError?.status === 400
                ? 'Add transactions to unlock AI insights'
                : 'No insights yet'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {latestError?.status === 400
                ? 'Add at least one transaction before generating AI insights.'
                : 'Generate your first forecast — it takes a few seconds.'}
            </p>
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              <RefreshCw
                className={generate.isPending ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              {generate.isPending ? 'Generating…' : 'Generate insights'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Sections B–E */}
      {!isLoading && hasRows ? (
        <>
          <OverallRiskCard
            level={riskLevel}
            reason={riskReason}
            subtitle={riskSubtitle}
          />
          <ForecastSection weeks={rows} />
          {unusual ? (
            <UnusualExpenses items={unusual} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unusual expenses</CardTitle>
                <CardDescription>
                  Refresh insights to run anomaly detection on your latest data.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          <DataQualityNotice
            modelUsed={quality?.modelUsed ?? saved?.modelUsed}
            historicalWeeks={quality?.historicalWeeks ?? null}
            message={quality?.message ?? null}
          />
        </>
      ) : null}

      {/* F. Bilingual AI coach (works with or without a saved forecast). */}
      <AiCoach />
    </main>
  )
}
