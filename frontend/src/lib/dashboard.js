// Pure helpers that turn backend data (monthly summaries, wallet, saved
// forecast) into what the Dashboard page shows. No React in here.
import { formatBDTWhole } from '@/lib/format'

// The backend buckets months in Dhaka time (UTC+6), so we do the same.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000

// key = Summary.expenses field, api = Transaction.category value.
export const CATEGORIES = [
  { key: 'food', api: 'Food', label: 'Food' },
  { key: 'transport', api: 'Transport', label: 'Transport' },
  { key: 'shopping', api: 'Shopping', label: 'Shopping' },
  { key: 'bills', api: 'Bills', label: 'Bills' },
  { key: 'entertainment', api: 'Entertainment', label: 'Entertainment' },
  { key: 'healthcare', api: 'Healthcare', label: 'Healthcare' },
  { key: 'education', api: 'Education', label: 'Education' },
  { key: 'cashOut', api: 'Cash Out', label: 'Cash out' },
  { key: 'sendMoney', api: 'Send Money', label: 'Send money' },
  { key: 'mobileRecharge', api: 'Mobile Recharge', label: 'Mobile recharge' },
  { key: 'other', api: 'Other', label: 'Other' },
]
// "Savings" is money moved aside, not spent, so it is never in CATEGORIES.

const pad = (n) => String(n).padStart(2, '0')
const keyOfUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`

// Summary.startDate (Dhaka month start, stored as UTC) -> "2026-10"
export function monthKey(value) {
  return keyOfUtc(new Date(new Date(value).getTime() + DHAKA_OFFSET_MS))
}

// Last `count` Dhaka months, oldest first. `date` is the 15th, safely inside
// the month, to send to POST /api/summaries/generate.
export function recentMonths(count, now = new Date()) {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  return Array.from({ length: count }, (_, i) => {
    const back = count - 1 - i
    const first = new Date(Date.UTC(y, m - back, 1))
    const opts = { timeZone: 'UTC' }
    return {
      key: keyOfUtc(first),
      label: first.toLocaleDateString('en-US', { ...opts, month: 'short' }),
      longLabel: first.toLocaleDateString('en-US', { ...opts, month: 'long' }),
      date: new Date(Date.UTC(y, m - back, 15)).toISOString(),
    }
  })
}

export function timeAgo(value, now = Date.now()) {
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return null
  const mins = Math.max(0, Math.round((now - t) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

function categoryInsight(cur, prev) {
  const rows = CATEGORIES.map((c) => ({
    ...c,
    cur: cur.expenses[c.key] || 0,
    prev: prev?.expenses?.[c.key] || 0,
  }))

  const rising = rows
    .filter((r) => r.prev > 0 && r.cur > r.prev)
    .sort((a, b) => b.cur - b.prev - (a.cur - a.prev))[0]
  if (rising) {
    const pct = Math.round((rising.cur / rising.prev - 1) * 100)
    return {
      id: 'category',
      icon: rising.key,
      text: `Your ${rising.label.toLowerCase()} spending is up ${pct}% from last month.`,
      big: formatBDTWhole(rising.cur),
      sub: `vs ${formatBDTWhole(rising.prev)} last month`,
      to: `/transactions?category=${encodeURIComponent(rising.api)}`,
      cta: 'View details',
    }
  }

  const top = [...rows].sort((a, b) => b.cur - a.cur)[0]
  if (top && top.cur > 0) {
    const share = Math.round((top.cur / cur.spent) * 100)
    return {
      id: 'category',
      icon: top.key,
      text: `${top.label} is your biggest expense this month, at ${share}% of spending.`,
      big: formatBDTWhole(top.cur),
      sub: `of ${formatBDTWhole(cur.spent)} spent`,
      to: `/transactions?category=${encodeURIComponent(top.api)}`,
      cta: 'View details',
    }
  }

  return {
    id: 'category',
    icon: 'other',
    empty: true,
    text: 'Add an expense to see where your money goes.',
    to: '/transactions',
    cta: 'Add transaction',
  }
}

function savingsInsight(cur, prev) {
  if (cur.income <= 0 && cur.spent <= 0) {
    return {
      id: 'savings',
      icon: 'savings',
      empty: true,
      text: 'Nothing recorded this month yet.',
      to: '/transactions',
      cta: 'Add transaction',
    }
  }
  const prevHasData = prev && (prev.income > 0 || prev.spent > 0)
  const sub = prevHasData ? `vs ${formatBDTWhole(prev.saved)} last month` : 'So far this month'
  const text =
    cur.saved >= 0 && cur.rate !== null
      ? `You have kept ${Math.round(cur.rate)}% of your income this month.`
      : `You have spent ${formatBDTWhole(Math.abs(cur.saved))} more than you earned this month.`
  return {
    id: 'savings',
    icon: 'savings',
    text,
    big: formatBDTWhole(cur.saved),
    sub,
    to: '/goals',
    cta: 'View goals',
  }
}

function forecastInsight(forecast) {
  const weeks = forecast?.weeks ?? []
  if (weeks.length === 0) {
    return {
      id: 'forecast',
      icon: 'forecast',
      empty: true,
      text: 'Generate a forecast to see where your balance is heading.',
      to: '/ai-assistant',
      cta: 'Generate insights',
    }
  }
  const risks = weeks.map((w) => w.shortfallRisk)
  const n = weeks.length
  const text = risks.includes('high')
    ? `Your balance could run short within the next ${n} weeks.`
    : risks.includes('medium')
      ? `Spending may get tight within the next ${n} weeks.`
      : `Your cash flow looks steady for the next ${n} weeks.`
  return {
    id: 'forecast',
    icon: 'forecast',
    text,
    big: formatBDTWhole(weeks[weeks.length - 1].predictedBalance),
    sub: `Projected balance in ${n} weeks`,
    to: '/forecast',
    cta: 'View forecast',
  }
}

export function buildDashboard({ summaries = [], balance = 0, forecast = null, now = new Date() }) {
  const months = recentMonths(6, now)
  const byKey = new Map(summaries.map((s) => [monthKey(s.startDate), s]))

  const series = months.map((m) => {
    const s = byKey.get(m.key)
    const income = s?.income || 0
    const totalExpense = s?.totalExpense || 0
    const spent = Math.max(0, totalExpense - (s?.expenses?.savings || 0))
    const saved = income - spent
    return {
      ...m,
      // false for months before the account had any activity
      active: income > 0 || totalExpense > 0,
      income,
      spent,
      saved,
      walletNet: income - totalExpense,
      rate: income > 0 ? (saved / income) * 100 : null,
      expenses: s?.expenses ?? {},
    }
  })

  // Rebuild past month-end balances by undoing each later month's net change.
  const balances = new Array(series.length)
  balances[series.length - 1] = balance
  for (let i = series.length - 1; i > 0; i--) {
    balances[i - 1] = balances[i] - series[i].walletNet
  }

  const cur = series[series.length - 1]
  const prev = series[series.length - 2]

  // Sparklines skip the empty months before the first activity.
  const firstActive = Math.max(0, series.findIndex((s) => s.active))
  const sparkOf = (values) => {
    const data = values.slice(firstActive)
    return data.length >= 2 ? data : null
  }
  const rateDelta = cur.rate !== null && prev.rate !== null ? cur.rate - prev.rate : null

  const cards = {
    balance: {
      value: balance,
      delta: { value: pctChange(balance, balances[balances.length - 2]), unit: '%', goodWhen: 'up' },
      spark: sparkOf(balances),
    },
    income: {
      value: cur.income,
      delta: { value: pctChange(cur.income, prev.income), unit: '%', goodWhen: 'up' },
      spark: sparkOf(series.map((s) => s.income)),
    },
    spent: {
      value: cur.spent,
      delta: { value: pctChange(cur.spent, prev.spent), unit: '%', goodWhen: 'down' },
      spark: sparkOf(series.map((s) => s.spent)),
    },
    rate: {
      value: cur.rate,
      delta: { value: rateDelta, unit: ' pts', goodWhen: 'up' },
      spark: sparkOf(series.map((s) => s.rate ?? 0)),
    },
  }

  // Dotted line = average of the (up to) 3 active months before each point.
  // Months before the first activity are left out, not drawn as zero.
  const trend = series.map((s, i) => {
    const before = series.slice(Math.max(0, i - 3), i).filter((b) => b.active)
    const baseline = before.length
      ? before.reduce((sum, b) => sum + b.spent, 0) / before.length
      : null
    return { label: s.label, spent: s.active ? s.spent : null, baseline }
  })

  // Top 4 categories this month; everything else is grouped into "Other".
  const ranked = CATEGORIES.map((c) => ({ name: c.label, value: cur.expenses[c.key] || 0 }))
    .filter((c) => c.value > 0 && c.name !== 'Other')
    .sort((a, b) => b.value - a.value)
  const otherValue =
    ranked.slice(4).reduce((sum, c) => sum + c.value, 0) + (cur.expenses.other || 0)
  const items = ranked.slice(0, 4)
  if (otherValue > 0) items.push({ name: 'Other', value: otherValue })

  return {
    cards,
    trend,
    hasSpending: series.some((s) => s.spent > 0),
    categories: { items, total: cur.spent, monthLabel: cur.longLabel },
    insights: [categoryInsight(cur, prev), savingsInsight(cur, prev), forecastInsight(forecast)],
    monthLabel: cur.longLabel,
  }
}
