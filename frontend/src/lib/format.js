// Formatting helpers for money and dates (Bangladesh Taka).

const bdtFormatter = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 2,
})

// 1250.5 -> taka 1,250.50. Never throws; bad input shows a dash.
// (Taka sign, nbsp and em dash are unicode escapes to satisfy the linter.)
const TAKA = '\u09F3'
const NBSP = '\u00A0'
const DASH = '\u2014'
export function formatBDT(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `${TAKA}${NBSP}${DASH}`
  try {
    return bdtFormatter.format(n)
  } catch {
    return `${TAKA}${NBSP}${n.toLocaleString('en-BD')}`
  }
}

// 24850.4 -> taka 24,850 (no paise). Never throws; bad input shows a dash.
// Built by hand so the taka sign shows the same in every browser and locale.
export function formatBDTWhole(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `${TAKA}${NBSP}${DASH}`
  const digits = Math.abs(Math.round(n)).toLocaleString('en-BD')
  return `${n < 0 && Math.round(n) !== 0 ? '-' : ''}${TAKA}${digits}`
}

// Short form for chart axes: 2500 -> taka 2.5k, 1200000 -> taka 1.2M.
export function formatBDTCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `${TAKA}${NBSP}${DASH}`
  const abs = Math.abs(n)
  const trim = (x) => String(Number(x.toFixed(2)))
  if (abs >= 1_000_000) return `${TAKA}${trim(n / 1_000_000)}M`
  if (abs >= 1_000) return `${TAKA}${trim(n / 1_000)}k`
  return `${TAKA}${trim(n)}`
}

// "2026-10-12" / ISO string -> "12 Oct 2026". Never throws.
export function formatDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return `${DASH}`
  try {
    return d.toLocaleDateString('en-BD', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d.toDateString()
  }
}

// ISO date-time -> "12 Oct 2026, 14:30". Never throws.
export function formatDateTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return `${DASH}`
  try {
    return d.toLocaleString('en-BD', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d.toString()
  }
}
