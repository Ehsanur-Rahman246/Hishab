import { Link } from 'react-router'
import {
  Banknote,
  Bot,
  ChevronRight,
  Ellipsis,
  Film,
  GraduationCap,
  HeartPulse,
  PiggyBank,
  Receipt,
  Send,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Bus,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ICONS = {
  food: Utensils,
  transport: Bus,
  shopping: ShoppingBag,
  bills: Receipt,
  entertainment: Film,
  healthcare: HeartPulse,
  education: GraduationCap,
  cashOut: Banknote,
  sendMoney: Send,
  mobileRecharge: Smartphone,
  other: Ellipsis,
  savings: PiggyBank,
  forecast: TrendingUp,
}

function InsightCard({ insight }) {
  const Icon = ICONS[insight.icon] ?? Sparkles
  return (
    <article className="flex flex-col rounded-xl bg-card p-5 shadow-panel ring-1 ring-foreground/5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          AI
        </span>
        <Icon className="size-[18px] text-primary" aria-hidden="true" />
      </div>

      <p className="mt-4 min-h-12 text-base font-medium leading-snug">{insight.text}</p>

      <div className="mt-4 flex items-end justify-between gap-3 border-t pt-4">
        <div className="min-w-0">
          {insight.empty ? null : (
            <>
              <p className="font-heading text-xl font-extrabold tabular-nums">{insight.big}</p>
              <p className="truncate text-xs text-muted-foreground">{insight.sub}</p>
            </>
          )}
        </div>
        <Link
          to={insight.to}
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
        >
          {insight.cta}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

export function AiInsightsPanel({ insights, subtitle }) {
  return (
    <section
      aria-labelledby="ai-insights-heading"
      className="rounded-2xl bg-secondary/70 p-5 ring-1 ring-primary/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#064581] text-accent">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="ai-insights-heading" className="text-xl">
              AI Financial Insights
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Link
          to="/ai-assistant"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'border-primary/40 bg-card text-primary hover:bg-card/80',
          )}
        >
          <Bot aria-hidden="true" />
          Ask the assistant
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  )
}
