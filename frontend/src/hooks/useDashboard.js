import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { generateSummary, getSummaries } from '@/api/summaryApi'
import { useWallet } from '@/hooks/useWallet'
import { useLatestInsights } from '@/hooks/useAiInsights'
import { buildDashboard, monthKey, recentMonths } from '@/lib/dashboard'

// Summaries are only created when POST /api/summaries/generate is called, so
// the dashboard refreshes the current + previous month every time and builds
// older months only if they are missing. Safe to repeat: the backend upserts.
function useMonthlySummaries() {
  return useQuery({
    queryKey: ['summaries', 'dashboard'], // under ['summaries'] so any transaction/wallet change refreshes it
    staleTime: 60_000,
    queryFn: async () => {
      const months = recentMonths(6)
      const existing = (await getSummaries('monthly')).summaries ?? []
      const have = new Set(existing.map((s) => monthKey(s.startDate)))
      const toBuild = months.filter((m, i) => !have.has(m.key) || i >= months.length - 2)

      await Promise.all(toBuild.map((m) => generateSummary({ period: 'monthly', date: m.date })))

      return (await getSummaries('monthly')).summaries ?? []
    },
  })
}

export function useDashboardData() {
  const summaries = useMonthlySummaries()
  const wallet = useWallet()
  const insights = useLatestInsights() // 404 = never generated -> null

  const balance = wallet.data?.wallet?.balance
  const forecast = insights.data?.forecast ?? null

  const data = useMemo(
    () =>
      summaries.data && balance !== undefined
        ? buildDashboard({ summaries: summaries.data, balance, forecast })
        : null,
    [summaries.data, balance, forecast],
  )

  return {
    data,
    forecast,
    isLoading: summaries.isPending || wallet.isPending,
    error: summaries.error || wallet.error,
    refetch: () => {
      summaries.refetch()
      wallet.refetch()
    },
  }
}
