import { useEffect, useRef, useState } from 'react'
import { Bot, Send, User } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toApiError } from '@/hooks/useAiInsights'
import { useAskCoach } from '@/hooks/useAiCoach'
import { cn } from '@/lib/utils'

const MAX_MESSAGE = 500

const LANGUAGES = [
  { id: 'auto', label: 'Auto' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'en', label: 'English' },
]

const STARTERS = {
  bn: [
    'এই মাসে আমার খরচ কোথায় বেশি?',
    'আগামী সপ্তাহে কীভাবে খরচ কমাতে পারি?',
    'আমার আর্থিক ঝুঁকি কতটুকু?',
  ],
  en: [
    'Where am I spending the most this month?',
    'How can I reduce spending next week?',
    'What is my current financial risk?',
  ],
}

function starterList(language) {
  if (language === 'bn') return STARTERS.bn
  if (language === 'en') return STARTERS.en
  return [...STARTERS.bn, ...STARTERS.en]
}

let nextId = 1
const makeId = () => `msg-${Date.now()}-${nextId++}`

// One assistant reply: headline + answer + up to 3 action cards + disclaimer.
function CoachAnswer({ coach }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{coach.headline}</p>
      <p className="text-sm whitespace-pre-wrap">{coach.answer}</p>
      {coach.actions?.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {coach.actions.map((a, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/60 bg-background px-3 py-2"
            >
              <p className="text-sm font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">{coach.disclaimer}</p>
    </div>
  )
}

export function AiCoach() {
  const [language, setLanguage] = useState('auto')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [error, setError] = useState(null)
  const ask = useAskCoach()
  const logRef = useRef(null)

  // Auto-scroll the chat log as messages arrive (motion-safe, accessible).
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, ask.isPending])

  const send = (text) => {
    const message = (text ?? input).trim()
    if (!message || ask.isPending) return
    if (message.length > MAX_MESSAGE) {
      setError({
        status: 400,
        message: `Please keep questions under ${MAX_MESSAGE} characters.`,
      })
      return
    }
    setError(null)
    setMessages((prev) => [...prev, { id: makeId(), role: 'user', text: message }])
    setInput('')
    ask.mutate(
      { message, language },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            { id: makeId(), role: 'assistant', coach: data.coach },
          ])
        },
        onError: (err) => {
          setError(toApiError(err, 'The AI coach is unavailable right now.'))
        },
      },
    )
  }

  const errorTitle =
    error?.status === 429
      ? 'Slow down'
      : error?.status === 503
        ? 'Service unavailable'
        : error?.status === 502
          ? 'Unclear answer'
          : 'Could not send';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">হিসাব AI কোচ / Hishab AI Coach</CardTitle>
        <CardDescription>
          Ask about your own spending, forecast, and risk — in Bangla, English,
          or mixed.
        </CardDescription>
        {/* Language selector: Auto / বাংলা / English */}
        <div
          className="flex flex-wrap gap-2 pt-1"
          role="group"
          aria-label="Answer language"
        >
          {LANGUAGES.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant={language === l.id ? 'default' : 'outline'}
              aria-pressed={language === l.id}
              onClick={() => setLanguage(l.id)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Starter prompts follow the selected language. */}
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {starterList(language).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                disabled={ask.isPending}
                onClick={() => send(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        ) : null}

        {/* Message log */}
        {messages.length > 0 ? (
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Chat with Hishab AI Coach"
            className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg bg-muted/40 p-3"
          >
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end gap-2">
                  <p
                    lang={language === 'auto' ? undefined : language}
                    className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                  >
                    {m.text}
                  </p>
                  <User className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                <div key={m.id} className="flex justify-start gap-2">
                  <Bot className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div
                    lang={m.coach?.language === 'mixed' ? undefined : m.coach?.language}
                    className="max-w-[85%] rounded-xl rounded-bl-sm border border-border/60 bg-card px-3 py-2"
                  >
                    <CoachAnswer coach={m.coach} />
                  </div>
                </div>
              ),
            )}
            {ask.isPending ? (
              <div className="flex justify-start gap-2">
                <Bot className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex w-2/3 flex-col gap-2 rounded-xl rounded-bl-sm border border-border/60 bg-card px-3 py-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Composer */}
        <div className="flex flex-col gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="আপনার প্রশ্ন লিখুন / Type your question…"
            rows={3}
            maxLength={MAX_MESSAGE + 50}
            disabled={ask.isPending}
            aria-label="Your question for the AI coach"
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-xs text-muted-foreground',
                input.trim().length > MAX_MESSAGE && 'font-medium text-destructive',
              )}
            >
              {input.trim().length}/{MAX_MESSAGE}
            </span>
            <Button
              onClick={() => send()}
              disabled={ask.isPending || !input.trim()}
            >
              <Send aria-hidden="true" />
              {ask.isPending ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
