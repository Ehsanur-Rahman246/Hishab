import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Section E: honest trust notice — which model ran and on how much history.
export function DataQualityNotice({ modelUsed, historicalWeeks, message }) {
  const isFallback = modelUsed === 'historical_average_fallback'
  const prettyModel =
    modelUsed === 'linear_regression'
      ? 'Trend model (linear regression)'
      : isFallback
        ? 'Average fallback'
        : (modelUsed || 'Unknown model')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How this was calculated</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Model: <span className="font-medium text-foreground">{prettyModel}</span>
          {historicalWeeks !== null && historicalWeeks !== undefined ? (
            <>
              {' '}· based on{' '}
              <span className="font-medium text-foreground">
                {historicalWeeks} week{historicalWeeks === 1 ? '' : 's'}
              </span>{' '}
              of your history
            </>
          ) : null}
          .
        </p>
        {message ? <p>{message}</p> : null}
        {isFallback ? (
          <p className="font-medium text-foreground">
            Add more weeks of transactions for a more personalized forecast.
          </p>
        ) : null}
        <p className="text-xs">Predictions are estimates, not financial advice.</p>
      </CardContent>
    </Card>
  )
}
