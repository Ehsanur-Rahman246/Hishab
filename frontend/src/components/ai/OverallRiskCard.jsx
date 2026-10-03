import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RiskBadge } from '@/components/ai/RiskBadge'

// Section B: overall spending risk for the forecast horizon.
export function OverallRiskCard({ level, reason, subtitle }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overall risk</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <RiskBadge level={level} />
        <p className="text-sm text-muted-foreground">{reason || '—'}</p>
      </CardContent>
    </Card>
  )
}
