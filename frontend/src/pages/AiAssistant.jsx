import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CircleAlert,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataQualityNotice } from "@/components/ai/DataQualityNotice";
import { ForecastSection } from "@/components/ai/ForecastSection";
import { InsightsSkeleton } from "@/components/ai/InsightsSkeleton";
import { OverallRiskCard } from "@/components/ai/OverallRiskCard";
import { UnusualExpenses } from "@/components/ai/UnusualExpenses";
import {
  toApiError,
  useGenerateInsights,
  useLatestInsights,
} from "@/hooks/useAiInsights";
import { useAskCoach } from "@/hooks/useAiCoach";
import { useCurrentUser } from "@/hooks/useAuth";
import { useDeleteAllMessages, useMessages } from "@/hooks/useChat";
import { confirmGoalAddMoney, confirmGoalDelete } from "@/api/aiGoalApi";
import { useSummaries } from "@/hooks/useSummaries";
import { useQueryClient } from "@tanstack/react-query";
import { CATEGORIES, monthKey, recentMonths } from "@/lib/dashboard";
import { formatBDTWhole, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Chat constants. These mirror the backend (aiControllers.askCoach):
// message <= 500 chars, language in auto | bn | en, 10 questions / 10 min.
// ---------------------------------------------------------------------------

const MAX_MESSAGE = 500;
// One idempotency key per send: network retries reuse it so the backend
// returns the original transfer instead of moving money twice.
// Module scope keeps the react compiler purity rule happy.
const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LANGUAGES = [
  { id: "auto", label: "Auto" },
  { id: "bn", label: "\u09AC\u09BE\u0982\u09B2\u09BE" },
  { id: "en", label: "English" },
];
const STARTERS = {
  en: [
    "Why did my expenses increase this month?",
    "How much can I save next month?",
    "Where am I spending the most?",
    "How can I reduce my unnecessary expenses?",
  ],
  bn: [
    "\u098F\u0987 \u09AE\u09BE\u09B8\u09C7 \u0986\u09AE\u09BE\u09B0 \u0996\u09B0\u099A \u0995\u09CB\u09A5\u09BE\u09AF\u09BC \u09AC\u09C7\u09B6\u09BF?",
    "\u0986\u0997\u09BE\u09AE\u09C0 \u09AE\u09BE\u09B8\u09C7 \u0995\u09A4 \u09B8\u099E\u09CD\u099A\u09AF\u09BC \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09AC?",
    "\u0986\u09AE\u09BE\u09B0 \u0996\u09B0\u099A \u0995\u09C7\u09A8 \u09AC\u09C7\u09DC\u09C7\u099B\u09C7?",
    "\u0985\u09AA\u09CD\u09B0\u09AF\u09BC\u09CB\u099C\u09A8\u09C0\u09AF\u09BC \u0996\u09B0\u099A \u0995\u09C0\u09AD\u09BE\u09AC\u09C7 \u0995\u09AE\u09BE\u09AC?",
  ],
};
const TONES = {
  positive: { label: "Looking good", cls: "bg-success/10 text-success" },
  neutral: { label: "Neutral", cls: "bg-secondary text-primary" },
  caution: { label: "Needs attention", cls: "bg-warning/10 text-warning" },
};
const LANG_LABEL = {
  bn: "\u09AC\u09BE\u0982\u09B2\u09BE",
  en: "English",
  mixed: "Mixed",
};

const ERROR_TITLES = {
  429: "Slow down",
  503: "Service unavailable",
  502: "Unclear answer",
};

// "Your financial evidence": this month's top categories vs the average of the
// previous (up to) 3 monthly Summary documents. Pure client-side maths on data
// the backend already stores; the coach does not return this itself.
function buildEvidence(summaries) {
  const months = recentMonths(4);
  const by = new Map(summaries.map((s) => [monthKey(s.startDate), s]));
  const cur = by.get(months[3].key);
  if (!cur) return null;
  const prior = months
    .slice(0, 3)
    .map((m) => by.get(m.key))
    .filter(Boolean);
  const rows = CATEGORIES.map((c) => {
    const now = cur.expenses?.[c.key] || 0;
    const avg = prior.length
      ? prior.reduce((t, s) => t + (s.expenses?.[c.key] || 0), 0) / prior.length
      : null;
    return {
      label: c.label,
      now,
      delta: avg > 0 ? ((now - avg) / avg) * 100 : null,
    };
  })
    .filter((r) => r.now > 0)
    .sort((a, b) => b.now - a.now)
    .slice(0, 3);
  return rows.length
    ? { rows, month: months[3].longLabel, priorCount: prior.length }
    : null;
}

// ---------------------------------------------------------------------------
// Chat pieces
// ---------------------------------------------------------------------------

const Avatar = () => (
  <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-[#064581] text-accent">
    <Sparkles className="size-4.5" aria-hidden="true" />
  </span>
);

function Evidence({ evidence }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Database className="size-4" aria-hidden="true" /> Your financial
        evidence
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {evidence.rows.map((r) => {
          const up = r.delta > 0;
          return (
            <li key={r.label} className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">{r.label}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-[#064581] tabular-nums dark:text-primary">
                {formatBDTWhole(r.now)}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs font-semibold tabular-nums",
                  r.delta === null
                    ? "text-muted-foreground"
                    : up
                      ? "text-destructive"
                      : "text-success",
                )}
              >
                {r.delta === null
                  ? "No earlier months to compare"
                  : `${up ? "+" : "\u2212"}${Math.abs(Math.round(r.delta))}% vs average`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Analysis({ text, coach, tags, goalAction, onConfirmDelete, confirming, addMoneyAction, onConfirmAddMoney }) {
  return (
    <div data-testid="coach-reply" className="rounded-2xl bg-secondary/80 p-5 ring-1 ring-primary/10">
      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-accent-foreground uppercase">
        <Sparkles className="size-3" aria-hidden="true" /> AI analysis
      </span>
      {coach?.headline ? (
        <p className="mt-3 font-heading text-lg font-bold">{coach.headline}</p>
      ) : null}
      <p
        className={cn(
          "whitespace-pre-wrap leading-relaxed",
          coach?.headline ? "mt-1.5 text-base" : "mt-3 text-[17px]",
        )}
      >
        {text}
      </p>
      {coach?.actions?.length ? (
        <ul className="mt-4 grid gap-2.5 md:grid-cols-3">
          {coach.actions.map((a, i) => (
            <li
              key={i}
              className="rounded-xl bg-card p-3.5 ring-1 ring-foreground/5"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#064581] text-[11px] text-white">
                  {i + 1}
                </span>
                {a.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {tags?.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-primary/20 bg-card px-3 py-1 text-xs text-primary"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      {coach?.disclaimer ? (
        <p className="mt-3 text-xs text-muted-foreground">{coach.disclaimer}</p>
      ) : null}
      {goalAction?.kind === "confirm_required" && goalAction?.goal ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-card p-4">
          <p className="text-sm font-semibold">
            Delete “{goalAction.goal.title}”? {formatBDTWhole(goalAction.goal.savedAmount)} will be returned to your wallet.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              className="h-10 rounded-xl px-4"
              disabled={confirming}
              onClick={() => onConfirmDelete?.(goalAction.goal._id)}
            >
              {confirming ? "Deleting…" : `Yes, delete ${goalAction.goal.title}`}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Or reply “Yes, delete {goalAction.goal.title}” in chat. Nothing is deleted until you confirm.
          </p>
        </div>
      ) : null}
      {goalAction?.kind === "ambiguous" && goalAction?.matches?.length ? (
        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Multiple goals match — choose one:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {goalAction.matches.map((g) => (
              <li key={g._id} className="flex items-center justify-between gap-2">
                <span>“{g.title}” — {formatBDTWhole(g.savedAmount)} saved</span>
                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => onConfirmDelete?.(g._id)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {addMoneyAction?.kind === "ambiguous" && addMoneyAction?.matches?.length ? (
        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">
            Multiple goals match — choose one to add{addMoneyAction.amount ? ` ${formatBDTWhole(addMoneyAction.amount)}` : ""}:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {addMoneyAction.matches.map((g) => (
              <li key={g._id} className="flex items-center justify-between gap-2">
                <span>“{g.title}” — {formatBDTWhole(g.savedAmount)} saved</span>
                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => onConfirmAddMoney?.(g._id)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                >
                  Add here
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ChatView({ language }) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(null); // question awaiting an answer
  const [rich, setRich] = useState({}); // answer text -> full coach reply (this session)
  const [goalActions, setGoalActions] = useState({}); // answer text -> goalAction payload
  const [addMoneyActions, setAddMoneyActions] = useState({}); // answer text -> addMoneyAction payload
  const [local, setLocal] = useState([]); // exchanges the backend did not save
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const logRef = useRef(null);
  const qc = useQueryClient();

  const { data: user } = useCurrentUser();
  const summaries = useSummaries("monthly");
  const msgs = useMessages(); // GET /api/chat (ChatMessage model)
  const ask = useAskCoach(); // POST /api/ai/coach
  const clear = useDeleteAllMessages();

  const refreshAfterGoalDelete = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["summaries"] });
    qc.invalidateQueries({ queryKey: ["chat"] });
  };

  // Same caches move on Wallet -> Goal contributions, so one refresher covers
  // both delete-refunds and chat add-money.
  const refreshAfterGoalMoneyMove = refreshAfterGoalDelete;

  const evidence = useMemo(
    () => buildEvidence(summaries.data?.summaries ?? []),
    [summaries.data],
  );

  const items = useMemo(() => {
    const saved = (msgs.data?.messages ?? []).map((m) => ({
      id: m._id,
      role: m.role,
      text: m.text,
      coach: rich[m.text],
      goalAction: goalActions[m.text],
      addMoneyAction: addMoneyActions[m.text],
    }));
    const extra = local.flatMap((l) => [
      { id: `${l.id}-q`, role: "user", text: l.user },
      {
        id: `${l.id}-a`,
        role: "assistant",
        text: l.coach.answer,
        coach: l.coach,
        goalAction: l.goalAction,
        addMoneyAction: l.addMoneyAction,
      },
    ]);
    return [...saved, ...extra];
  }, [msgs.data, rich, goalActions, addMoneyActions, local]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, pending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    if (message.length > MAX_MESSAGE) {
      setError({
        status: 400,
        message: `Please keep questions under ${MAX_MESSAGE} characters.`,
      });
      return;
    }
    setError(null);
    setPending(message);
    setInput("");
    // One idempotency key per send: network retries reuse it so the backend
    // returns the original transfer instead of moving money twice.
    const idempotencyKey = newIdempotencyKey();
    try {
      const { coach, goalAction, addMoneyAction } = await ask.mutateAsync({ message, language, idempotencyKey });
      const fresh = await msgs.refetch();
      const last = (fresh.data?.messages ?? []).at(-1);
      setRich((r) => ({ ...r, [coach.answer]: coach }));
      if (goalAction) setGoalActions((g) => ({ ...g, [coach.answer]: goalAction }));
      if (addMoneyAction) setAddMoneyActions((a) => ({ ...a, [coach.answer]: addMoneyAction }));
      if (goalAction?.kind === "deleted" || goalAction?.kind === "duplicate") refreshAfterGoalDelete();
      if (addMoneyAction?.added) refreshAfterGoalMoneyMove();
      // the no-data reply is never saved by the backend, so keep it locally
      if (!(last?.role === "assistant" && last.text === coach.answer)) {
        setLocal((l) => [
          ...l,
          { id: `l-${Date.now()}`, user: message, coach, goalAction, addMoneyAction },
        ]);
      }
    } catch (err) {
      setError(toApiError(err, "The AI coach is unavailable right now."));
      setInput(message);
    } finally {
      setPending(null);
    }
  };

  const confirmDeleteFromChat = async (goalId) => {
    if (!goalId || confirmingId) return;
    setConfirmingId(goalId);
    setError(null);
    try {
      const res = await confirmGoalDelete(goalId, language);
      await msgs.refetch();
      if (res?.reply) {
        setRich((r) => ({
          ...r,
          [res.reply]: {
            language: language === "bn" ? "bn" : language === "en" ? "en" : "mixed",
            headline: res.goalTitle ? `Goal deleted: ${res.goalTitle}` : "Goal deleted",
            answer: res.reply,
            actions: [],
            tone: "neutral",
            disclaimer: "",
          },
        }));
        setLocal((l) => [
          ...l,
          {
            id: `l-${Date.now()}`,
            user: `Yes, delete goal`,
            coach: { answer: res.reply },
            goalAction: { kind: "deleted" },
          },
        ]);
      }
      refreshAfterGoalDelete();
    } catch (err) {
      setError(toApiError(err, "Could not delete the goal. No money was moved."));
    } finally {
      setConfirmingId(null);
    }
  };

  const clearChat = () => {
    if (!window.confirm("Delete your whole chat history?")) return;
    clear.mutate(undefined, {
      onSuccess: () => {
        setRich({});
        setGoalActions({});
        setAddMoneyActions({});
        setLocal([]);
      },
    });
  };

  // Explicit choice for an ambiguous add-money command. Amount + condition
  // come from the server-parsed action payload; the backend re-validates
  // everything before moving money.
  const confirmAddMoneyFromChat = (answerText) => async (goalId) => {
    const action = addMoneyActions[answerText];
    if (!goalId || confirmingId || !action?.amount) return;
    setConfirmingId(goalId);
    setError(null);
    try {
      const res = await confirmGoalAddMoney({
        goalId,
        amount: action.amount,
        conditionThreshold: action.conditionThreshold,
        idempotencyKey: newIdempotencyKey(),
        language,
      });
      await msgs.refetch();
      if (res?.reply) {
        setRich((r) => ({
          ...r,
          [res.reply]: {
            language: language === "bn" ? "bn" : language === "en" ? "en" : "mixed",
            headline: res.goalTitle ? `Added to ${res.goalTitle}` : "Goal updated",
            answer: res.reply,
            actions: [],
            tone: "neutral",
            disclaimer: "",
          },
        }));
        setLocal((l) => [
          ...l,
          {
            id: `l-${Date.now()}`,
            user: `Add to goal`,
            coach: { answer: res.reply },
            addMoneyAction: { kind: res.duplicate ? "duplicate" : "added" },
          },
        ]);
      }
      refreshAfterGoalMoneyMove();
    } catch (err) {
      setError(toApiError(err, "Could not add money. No money was moved."));
    } finally {
      setConfirmingId(null);
    }
  };

  const first = (user?.name || "there").split(" ")[0];
  const starters = language === "bn" ? STARTERS.bn : STARTERS.en;

  return (
    <>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Chat with the finance assistant"
        className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8"
      >
        {/* greeting + evidence (real Summary data) */}
        <div className="flex gap-3">
          <Avatar />
          <div className="min-w-0 max-w-3xl flex-1 space-y-3">
            <p className="pt-2 text-[15px]">
              Hi {first}! Ask me about your spending, savings, forecast or
              goals.
              {evidence
                ? ` Here is where ${evidence.month} stands so far.`
                : ""}
            </p>
            {evidence ? (
              <>
                <Evidence evidence={evidence} />
                <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <li className="rounded-full border px-3 py-1">
                    Based on {evidence.month} transactions
                  </li>
                  {evidence.priorCount ? (
                    <li className="rounded-full border px-3 py-1">
                      Compared with {evidence.priorCount}-month average
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}
          </div>
        </div>

        {msgs.isLoading ? (
          <Skeleton className="h-24 max-w-3xl rounded-2xl bg-muted" />
        ) : null}

        {items.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#064581] px-5 py-3.5 text-[17px] font-medium text-white sm:max-w-xl">
                {m.text}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <Avatar />
              <div
                className="min-w-0 max-w-3xl flex-1 space-y-2"
                lang={
                  m.coach?.language === "bn" || m.coach?.language === "en"
                    ? m.coach.language
                    : undefined
                }
              >
                {m.coach ? (
                  <p className="flex flex-wrap items-center gap-2 pt-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold tracking-wide uppercase">
                      Reply
                    </span>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-semibold",
                        (TONES[m.coach.tone] ?? TONES.neutral).cls,
                      )}
                    >
                      {(TONES[m.coach.tone] ?? TONES.neutral).label}
                    </span>
                    <span className="rounded-md border px-2 py-0.5">
                      {LANG_LABEL[m.coach.language] ?? m.coach.language}
                    </span>
                  </p>
                ) : null}
                <Analysis text={m.text} coach={m.coach} goalAction={m.goalAction} onConfirmDelete={confirmDeleteFromChat} confirming={Boolean(confirmingId)} addMoneyAction={m.addMoneyAction} onConfirmAddMoney={m.role === "assistant" ? confirmAddMoneyFromChat(m.text) : undefined} />
              </div>
            </div>
          ),
        )}

        {pending ? (
          <>
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#064581] px-5 py-3.5 text-[17px] font-medium text-white sm:max-w-xl">
                {pending}
              </p>
            </div>
            <div
              className="flex gap-3"
              role="status"
              aria-label="Assistant is thinking"
            >
              <Avatar />
              <div className="w-full max-w-xl space-y-2.5 rounded-2xl bg-secondary/80 p-5">
                <Skeleton className="h-4 w-1/3 bg-muted" />
                <Skeleton className="h-4 w-full bg-muted" />
                <Skeleton className="h-4 w-4/5 bg-muted" />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="border-t px-4 pt-4 pb-3 sm:px-8">
        {error ? (
          <Alert
            variant={error.status === 503 ? "warning" : "destructive"}
            className="mb-3"
          >
            <AlertTitle>
              {ERROR_TITLES[error.status] ?? "Could not send"}
            </AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {items.length === 0 && !pending && !msgs.isLoading ? (
          <div className="flex flex-wrap gap-2 pb-3">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                disabled={Boolean(pending)}
                onClick={() => send(s)}
                className="rounded-full border border-primary/25 bg-card px-4 py-2 text-left text-sm text-foreground transition hover:border-primary hover:bg-secondary disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border-2 border-primary/40 bg-card py-2 pr-2 pl-4 shadow-md transition-all hover:border-primary/60 focus-within:border-primary focus-within:shadow-lg focus-within:ring-4 focus-within:ring-primary/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={MAX_MESSAGE + 50}
            disabled={Boolean(pending)}
            placeholder="Ask about your spending, savings or goals..."
            aria-label="Your question for the finance assistant"
            className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/80 disabled:opacity-60"
          />
          {input.trim().length > MAX_MESSAGE - 100 ? (
            <span
              className={cn(
                "mb-3 text-xs tabular-nums text-muted-foreground",
                input.trim().length > MAX_MESSAGE &&
                  "font-semibold text-destructive",
              )}
            >
              {input.trim().length}/{MAX_MESSAGE}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => send()}
            disabled={Boolean(pending) || !input.trim()}
            aria-label="Send question"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#064581] text-white transition hover:bg-[#0755a4] disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            Answers are estimates based on your Hishab transactions. Not
            financial advice.
          </p>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={clearChat}
              disabled={clear.isPending}
              className="inline-flex shrink-0 items-center gap-1 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" /> <span className="text-[14px]">Clear chat</span>
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Forecast & risk tab: the previous page content, unchanged in behaviour.
// (The navbar pill "Generate AI insights" sends people here, so it must stay.)
// ---------------------------------------------------------------------------

const RISKS = ["low", "medium", "high"];
const safeRisk = (r) => (RISKS.includes(r) ? r : "low");
const weekKey = (d) => String(d ?? "").slice(0, 10);

function rowsFromSaved(weeks) {
  return (weeks ?? []).map((w) => {
    const income = Number(w?.predictedInflow) || 0;
    const expense = Number(w?.predictedOutflow) || 0;
    return {
      weekStart: w?.weekStart,
      income,
      expense,
      net: income - expense,
      risk: safeRisk(w?.shortfallRisk),
      balance: w?.predictedBalance ?? null,
    };
  });
}

function rowsFromLive(weeks, balances) {
  return (weeks ?? []).map((w) => {
    const income = Number(w?.predictedIncome) || 0;
    const expense = Number(w?.predictedExpense) || 0;
    const net = Number(w?.estimatedNetCashflow);
    return {
      weekStart: w?.weekStart,
      income,
      expense,
      net: Number.isFinite(net) ? net : income - expense,
      risk: safeRisk(w?.risk),
      balance: balances.get(weekKey(w?.weekStart)) ?? null,
    };
  });
}

const worstRisk = (rows) =>
  rows.some((r) => r.risk === "high")
    ? "high"
    : rows.some((r) => r.risk === "medium")
      ? "medium"
      : "low";

function InsightsView() {
  const [live, setLive] = useState(null); // last fresh analysis (this session)
  const [liveAt, setLiveAt] = useState(null);
  const latest = useLatestInsights(); // last ForecastSnapshot saved in MongoDB
  const generate = useGenerateInsights();

  const saved = latest.data?.forecast ?? null;
  const balances = new Map(
    (saved?.weeks ?? []).map((w) => [
      weekKey(w?.weekStart),
      w?.predictedBalance ?? null,
    ]),
  );
  const liveWeeks = live?.mlInsights?.forecast?.weeks;
  const rows = liveWeeks
    ? rowsFromLive(liveWeeks, balances)
    : rowsFromSaved(saved?.weeks);
  const hasRows = rows.length > 0;

  const overall = live?.mlInsights?.overallRisk ?? null;
  const quality = live?.mlInsights?.dataQuality ?? null;
  const unusual = live?.mlInsights?.unusualExpenses ?? null;
  const latestError = latest.error
    ? toApiError(latest.error, "Could not load saved insights.")
    : null;
  const generateError = generate.error
    ? toApiError(generate.error, "Could not generate insights.")
    : null;
  const isLoading =
    (latest.isPending && !live) || (generate.isPending && !hasRows);
  const showEmpty =
    !hasRows &&
    !isLoading &&
    (latestError?.status === 404 || latestError?.status === 400);

  const handleGenerate = () =>
    generate.mutate(undefined, {
      onSuccess: (data) => {
        setLive(data);
        setLiveAt(new Date().toISOString());
      },
    });

  const spin = generate.isPending ? "animate-spin" : "";

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Personalized from your transaction history
          {liveAt
            ? ` \u00B7 Generated ${formatDateTime(liveAt)}`
            : saved?.generatedAt
              ? ` \u00B7 Last saved ${formatDateTime(saved.generatedAt)}`
              : ""}
        </p>
        <Button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="h-10 rounded-xl bg-[#064581] px-4 text-white hover:bg-[#0755a4]"
        >
          <RefreshCw className={spin} aria-hidden="true" />
          {generate.isPending ? "Refreshing\u2026" : "Refresh insights"}
        </Button>
      </div>

      {generateError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not generate insights</AlertTitle>
          <AlertDescription>{generateError.message}</AlertDescription>
        </Alert>
      ) : null}
      {isLoading ? <InsightsSkeleton /> : null}
      {!isLoading && latestError && !showEmpty ? (
        <Alert variant={latestError.status === 503 ? "warning" : "destructive"}>
          <AlertTitle>
            {latestError.status === 401
              ? "Please log in"
              : latestError.status === 503
                ? "Service unavailable"
                : "Something went wrong"}
          </AlertTitle>
          <AlertDescription>
            {latestError.status === 401
              ? "Log in to your Hishab account to view AI insights."
              : latestError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {showEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CircleAlert className="size-6 text-primary" aria-hidden="true" />
            <p className="text-base font-medium">
              {latestError?.status === 400
                ? "Add transactions to unlock AI insights"
                : "No insights yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {latestError?.status === 400
                ? "Add at least one transaction before generating AI insights."
                : "Generate your first forecast. It takes a few seconds."}
            </p>
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              <RefreshCw className={spin} aria-hidden="true" />
              {generate.isPending ? "Generating\u2026" : "Generate insights"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && hasRows ? (
        <>
          <OverallRiskCard
            level={overall?.level ? safeRisk(overall.level) : worstRisk(rows)}
            reason={
              overall?.reason ??
              "Worst weekly risk from your last saved forecast. Refresh for a fresh assessment."
            }
            subtitle={live ? "Fresh analysis" : "From last saved forecast"}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Pills = ({ label, value, onChange, options }) => (
  <div
    role="group"
    aria-label={label}
    className="inline-grid grid-flow-col gap-1 rounded-xl bg-muted p-1"
  >
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        aria-pressed={value === o.id}
        onClick={() => onChange(o.id)}
        className={cn(
          "h-9 rounded-lg px-3.5 text-sm font-semibold transition",
          value === o.id
            ? "bg-card text-[#064581] shadow-sm dark:text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const AiAssistant = () => {
  const [tab, setTab] = useState("chat");
  const [language, setLanguage] = useState("auto");

  return (
    <div className="mx-auto w-full max-w-350">
      <section
        aria-label="Finance assistant"
        className="flex h-[calc(100svh-12rem)] min-h-155 flex-col overflow-hidden rounded-2xl bg-card shadow-panel ring-1 ring-foreground/10"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-[#064581] text-accent">
              <Sparkles className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-extrabold text-[#064581] dark:text-primary">
                Finance Assistant
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  className="size-2 rounded-full bg-success"
                  aria-hidden="true"
                />
                Reads your transactions, forecast and goals
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-semibold text-primary xl:inline-flex">
              <ShieldCheck className="size-4" aria-hidden="true" /> Answers use
              your real data
            </span>
            {tab === "chat" ? (
              <Pills
                label="Answer language"
                value={language}
                onChange={setLanguage}
                options={LANGUAGES}
              />
            ) : null}
            <Pills
              label="View"
              value={tab}
              onChange={setTab}
              options={[
                { id: "chat", label: "Chat" },
                { id: "insights", label: "Forecast & risk" },
              ]}
            />
          </div>
        </header>

        {tab === "chat" ? <ChatView language={language} /> : <InsightsView />}
      </section>
    </div>
  );
};

export default AiAssistant;
