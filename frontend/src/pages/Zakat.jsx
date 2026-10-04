import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  CircleAlert,
  Coins,
  HandCoins,
  Info,
  Landmark,
  Loader2,
  Lock,
  MoonStar,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalculateZakat } from "@/hooks/useZakat";
import { formatBDT, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const CURRENCIES = ["BDT", "USD", "GBP", "EUR", "AED", "SAR", "INR"];

const CONTROL =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const initialForm = () => ({
  zakatYearType: "hijri",
  yearCompleted: false,
  nisabBasis: "silver",
  cashBdt: "",
  goldGrams: "",
  silverGrams: "",
  businessAmount: "",
  businessCurrency: "BDT",
  foreignRows: [{ id: 1, amount: "", currency: "USD", label: "" }],
  deductibleLiabilitiesBdt: "",
  pensionBdt: "",
});

const parseNonNegative = (raw, label, errors) => {
  if (raw === "" || raw === null || raw === undefined) return 0;
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a non-negative number.`);
    return 0;
  }
  return n;
};

function MarketBadge({ isLive }) {
  return isLive ? (
    <Badge className="border-success/30 bg-success/10 text-success hover:bg-success/10">
      Live market data
    </Badge>
  ) : (
    <Badge className="border-[#FFD21F]/70 bg-[#fff6cc] text-[#5c4a00] dark:bg-[#FFD21F]/15 dark:text-[#FFD21F]/80">
      Reference market value
    </Badge>
  );
}

function MarketPanel({ market, loading, loadError }) {
  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading market data">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (!market) {
    return (
      <p className="text-sm text-muted-foreground">
        {loadError || "Market data will appear here."}
      </p>
    );
  }
  const dateLabel = market.isLive
    ? formatDate(market.fetchedAt)
    : formatDate(market.referenceDate);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MarketBadge isLive={market.isLive} />
        <span className="text-xs text-muted-foreground">
          {market.isLive
            ? `Fetched ${dateLabel}`
            : `Reference date ${dateLabel}`}
        </span>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-muted px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Coins className="size-3.5" aria-hidden="true" /> Gold (24K) per
            gram
          </dt>
          <dd className="mt-0.5 text-base font-bold text-[#064581] dark:text-primary">
            {formatBDT(market.goldBdtPerGram)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Coins className="size-3.5" aria-hidden="true" /> Silver per gram
          </dt>
          <dd className="mt-0.5 text-base font-bold text-[#064581] dark:text-primary">
            {formatBDT(market.silverBdtPerGram)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Source: {market.source}</p>
      {!market.isLive && (
        <p className="flex items-start gap-1.5 rounded-xl border border-[#FFD21F]/70 bg-[#fff6cc] text-[#5c4a00] dark:bg-[#FFD21F]/15 dark:text-[#FFD21F]/80">
          <Info className="my-0.5 mx-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Showing reference prices because live market data isn't connected.
          Treat figures as estimates.
        </p>
      )}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  min = 0,
  readOnly = false,
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        placeholder="0"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        className={cn(
          "h-11 rounded-xl text-[15px]",
          readOnly && "cursor-not-allowed bg-muted font-semibold",
        )}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function Zakat() {
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState([]);
  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [result, setResult] = useState(null);
  const idCounter = useRef(2);
  const resultRef = useRef(null);
  const calc = useCalculateZakat();
  const marketCall = useCalculateZakat();

  const set = (patch) => {
    setResult(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const setRow = (id, patch) => {
    setResult(null);
    setForm((f) => ({
      ...f,
      foreignRows: f.foreignRows.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    }));
  };

  // Load market/reference prices on mount with a zero-value estimate.
  // Nothing personal is sent; the response marketData feeds the panel below.
  useEffect(() => {
    let cancelled = false;
    marketCall.mutate(
      {
        zakatYearType: "hijri",
        yearCompleted: false,
        nisabBasis: "silver",
        cashBdt: 0,
        goldGrams: 0,
        silverGrams: 0,
        deductibleLiabilitiesBdt: 0,
        pensionBdt: 0,
      },
      {
        onSuccess: (data) => {
          if (!cancelled) {
            setMarket(data?.calculation?.marketData ?? null);
            setMarketLoading(false);
          }
        },
        onError: () => {
          if (!cancelled) {
            setMarketError(
              "Could not load market data. You can still calculate below.",
            );
            setMarketLoading(false);
          }
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = [];
    const foreignAssets = [];
    form.foreignRows.forEach((row, i) => {
      const rawAmount = String(row.amount ?? "").trim();
      const label = String(row.label ?? "").trim();
      if (rawAmount === "" && label === "") return; // empty row: skip
      const amount = parseNonNegative(
        row.amount,
        `Foreign asset #${i + 1}`,
        errors,
      );
      if (!row.currency)
        errors.push(`Foreign asset #${i + 1} needs a currency.`);
      foreignAssets.push({ amount, currency: row.currency, label });
    });

    const payload = {
      zakatYearType: form.zakatYearType,
      yearCompleted: form.yearCompleted,
      nisabBasis: form.nisabBasis,
      cashBdt: parseNonNegative(form.cashBdt, errors),
      goldGrams: parseNonNegative(form.goldGrams, "Gold", errors),
      silverGrams: parseNonNegative(form.silverGrams, "Silver", errors),
      businessAmount: {
        amount: parseNonNegative(
          form.businessAmount,
          "Business amount",
          errors,
        ),
        currency: form.businessCurrency,
      },
      foreignAssets,
      deductibleLiabilitiesBdt: parseNonNegative(
        form.deductibleLiabilitiesBdt,
        "Deductible liabilities",
        errors,
      ),
      pensionBdt: parseNonNegative(
        form.pensionBdt,
        "Pension amount",
        errors,
      ),
    };
    setFieldErrors(errors);
    setResult(null);
    if (errors.length > 0) return;

    calc.mutate(payload, {
      onSuccess: (data) => {
        setMarket(data?.calculation?.marketData ?? null);
        setResult(data?.calculation ?? null);
        setMarketLoading(false);
      },
    });
  };

  const calcError =
    calc.isError && !calc.isPending
      ? calc.error?.response?.data?.message ||
        "Calculation failed. Please try again."
      : "";
  const calcErrorList = calc.error?.response?.data?.errors ?? [];
  const pending = calc.isPending;
  const calcData = result;

  const breakdownRows = calcData
    ? [
        {
          icon: Wallet,
          label: "Cash (BDT)",
          value: calcData.breakdown.cashBdt,
        },
        {
          icon: Coins,
          label: "Gold value",
          value: calcData.breakdown.goldValueBdt,
        },
        {
          icon: Coins,
          label: "Silver value",
          value: calcData.breakdown.silverValueBdt,
        },
        {
          icon: Landmark,
          label: "Business value",
          value: calcData.breakdown.businessValueBdt,
        },
        {
          icon: Banknote,
          label: "Foreign assets",
          value: calcData.breakdown.foreignAssetsBdt,
        },
        {
          icon: HandCoins,
          label: "Pension amount",
          value: calcData.breakdown.pensionBdt,
        },
      ]
    : [];

  const conversions =
    calcData?.foreignConversions?.filter((c) => c.inputCurrency !== "BDT") ??
    [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Header */}
      <section className="overflow-hidden rounded-2xl bg-[#064581] p-6 text-white sm:p-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#FFD21F] px-3 py-1 text-xs font-bold text-[#17212B]">
          <HandCoins className="size-3.5" aria-hidden="true" /> Zakat Calculator
        </p>
        <h1 className="font-heading mt-3 text-2xl font-extrabold sm:text-3xl">
          Zakat Calculator
        </h1>
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/90">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Your entered Zakat details are calculated temporarily and are not saved.
        </p>
      </section>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#064581] dark:text-primary">
              <MoonStar className="size-5" aria-hidden="true" /> Calculation
              settings
            </CardTitle>
            <CardDescription>
              Year type, completion, and nisab basis for this estimate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Zakat year</legend>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="Zakat year type"
              >
                {[
                  { value: "hijri", label: "Hijri year", hint: "Lunar year" },
                  {
                    value: "gregorian",
                    label: "English year",
                    hint: "Gregorian year",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={form.zakatYearType === opt.value}
                    onClick={() => set({ zakatYearType: opt.value })}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]",
                      form.zakatYearType === opt.value
                        ? "border-primary bg-brand-soft dark:bg-primary/15"
                        : "border-input bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="block text-sm font-semibold text-foreground">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-input bg-card px-3 py-2.5 has-checked:border-primary has-checked:bg-brand-soft dark:has-checked:bg-primary/15">
              <input
                type="checkbox"
                checked={form.yearCompleted}
                onChange={(e) => set({ yearCompleted: e.target.checked })}
                className="mt-1 size-4 accent-[#0756A6]"
              />
              <span className="text-sm">
                <span className="font-semibold text-foreground">
                  I confirm one selected year has completed
                </span>
                <span className="block text-xs text-muted-foreground">
                  Zakat applies only after a full year of ownership.
                </span>
              </span>
            </label>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Nisab basis</legend>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="Nisab basis"
              >
                {[
                  {
                    value: "silver",
                    label: "Silver nisab",
                    hint: "612.36 g silver",
                  },
                  { value: "gold", label: "Gold nisab", hint: "87.48 g gold" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={form.nisabBasis === opt.value}
                    onClick={() => set({ nisabBasis: opt.value })}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]",
                      form.nisabBasis === opt.value
                        ? "border-primary bg-brand-soft dark:bg-primary/15"
                        : "border-input bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="block text-sm font-semibold text-foreground">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="rounded-2xl border border-input bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Metal prices
              </h3>
              <div className="mt-2">
                <MarketPanel
                  market={market}
                  loading={marketLoading}
                  loadError={marketError}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#064581] dark:text-primary">
              <Wallet className="size-5" aria-hidden="true" /> Assets
            </CardTitle>
            <CardDescription>
              Values stay on this page only and are sent once for calculation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="zakat-cash"
                label="Cash in BDT (৳)"
                value={form.cashBdt}
                onChange={(v) => set({ cashBdt: v })}
              />
              <NumberField
                id="zakat-gold"
                label="Gold (grams)"
                value={form.goldGrams}
                onChange={(v) => set({ goldGrams: v })}
                hint="24K equivalent"
              />
              <NumberField
                id="zakat-silver"
                label="Silver (grams)"
                value={form.silverGrams}
                onChange={(v) => set({ silverGrams: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="zakat-business"
                label="Business amount"
                value={form.businessAmount}
                onChange={(v) => set({ businessAmount: v })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="zakat-business-ccy">Business currency</Label>
                <select
                  id="zakat-business-ccy"
                  value={form.businessCurrency}
                  onChange={(e) => set({ businessCurrency: e.target.value })}
                  className={CONTROL}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl bg-muted p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Banknote className="size-4" aria-hidden="true" /> Foreign
                  assets
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set({
                      foreignRows: [
                        ...form.foreignRows,
                        {
                          id: idCounter.current++,
                          amount: "",
                          currency: "USD",
                          label: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden="true" /> Add asset
                </Button>
              </div>
              {form.foreignRows.map((row, i) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-xl border border-input bg-card p-3 sm:grid-cols-[1fr_130px_auto] sm:items-end"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`zakat-fa-amount-${row.id}`}>
                      Amount {i + 1}
                    </Label>
                    <Input
                      id={`zakat-fa-amount-${row.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) =>
                        setRow(row.id, { amount: e.target.value })
                      }
                      className="h-11 rounded-xl text-[15px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`zakat-fa-ccy-${row.id}`}>Currency</Label>
                    <select
                      id={`zakat-fa-ccy-${row.id}`}
                      value={row.currency}
                      onChange={(e) =>
                        setRow(row.id, { currency: e.target.value })
                      }
                      className={CONTROL}
                    >
                      {CURRENCIES.filter((c) => c !== "BDT").map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5 sm:min-w-32">
                      <Label htmlFor={`zakat-fa-label-${row.id}`}>
                        Label (optional)
                      </Label>
                      <Input
                        id={`zakat-fa-label-${row.id}`}
                        type="text"
                        maxLength={80}
                        placeholder="Savings account"
                        value={row.label}
                        onChange={(e) =>
                          setRow(row.id, { label: e.target.value })
                        }
                        className="h-11 rounded-xl text-[15px]"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove foreign asset ${i + 1}`}
                      onClick={() =>
                        set({
                          foreignRows: form.foreignRows.filter(
                            (r) => r.id !== row.id,
                          ),
                        })
                      }
                      className="mt-6 shrink-0 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Converted to BDT automatically. Reference rates are labeled when
                live FX is not connected.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="zakat-liabilities"
                label="Deductible liabilities (BDT)"
                value={form.deductibleLiabilitiesBdt}
                onChange={(v) => set({ deductibleLiabilitiesBdt: v })}
                hint="Debts due within the year"
              />
              <NumberField
                id="zakat-pension"
                label="Accessible pension amount (BDT)"
                value={form.pensionBdt}
                onChange={(v) => set({ pensionBdt: v })}
                hint="Enter only pension funds you choose to include in this estimate. This value is not saved."
              />
            </div>
            <p className="flex items-start gap-1.5 rounded-xl bg-brand-soft dark:bg-primary/15 px-3 py-2 text-xs leading-relaxed text-[#064581] dark:text-primary">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Net zakatable wealth is calculated as total zakatable assets
              minus deductible liabilities. No other deductions are applied.
            </p>
          </CardContent>
        </Card>

        {fieldErrors.length > 0 && (
          <Alert variant="destructive" role="alert">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Please fix the following</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {fieldErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {calcError && (
          <Alert variant="destructive" role="alert">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Calculation failed</AlertTitle>
            <AlertDescription>
              {calcError}
              {calcErrorList.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {calcErrorList.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl bg-[#0756A6] text-base font-bold text-white hover:bg-[#064581] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
        >
          {pending ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />{" "}
              Calculating…
            </>
          ) : (
            <>
              <Calculator className="size-5" aria-hidden="true" /> Calculate
              Zakat
            </>
          )}
        </Button>
      </form>

      {/* Result */}
      {calcData && (
        <section
          ref={resultRef}
          aria-live="polite"
          aria-label="Zakat result"
          className="scroll-mt-24 space-y-6"
        >
          <Card className="overflow-hidden">
            <div
              className={cn(
                "h-2 w-full",
                calcData.eligible ? "bg-emerald-500" : "bg-[#FFD21F]",
              )}
              aria-hidden="true"
            />
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                {calcData.eligible ? (
                  <Badge className="border-success/30 bg-success/10 text-success hover:bg-success/10">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />{" "}
                    Zakat due — eligible
                  </Badge>
                ) : (
                  <Badge className="border-[#FFD21F] bg-[#fff6cc] text-[#5c4a00]">
                    Not eligible
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {calcData.zakatYearType === "hijri"
                    ? "Hijri year"
                    : "English year"}
                  {" · "}
                  {calcData.nisabBasis === "gold"
                    ? "Gold nisab"
                    : "Silver nisab"}
                  {` · Rate ${calcData.zakatRate * 100}%`}
                </span>
              </div>
              <CardTitle className="mt-2 text-[#064581] dark:text-primary">
                Estimated Zakat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="font-heading text-4xl font-extrabold text-foreground">
                {formatBDT(calcData.zakatAmountBdt)}
              </p>
              {!calcData.yearCompleted && (
                <p className="rounded-xl border-[#FFD21F] bg-[#fff6cc] text-[#5c4a00] dark:bg-[#FFD21F]/15 dark:text-[#FFD21F]">
                  One full year has not completed, so no Zakat is due yet — the
                  estimate above is ৳0 regardless of wealth.
                </p>
              )}

              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Scale className="size-4" aria-hidden="true" /> Calculation
                  breakdown
                </h3>
                <dl className="mt-2 divide-y divide-border rounded-xl border border-input">
                  {breakdownRows.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden="true" /> {label}
                      </dt>
                      <dd className="font-semibold text-foreground">
                        {formatBDT(value)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 bg-muted px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">
                      Gross zakatable assets
                    </dt>
                    <dd className="font-semibold text-foreground">
                      {formatBDT(calcData.breakdown.grossZakatableAssetsBdt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">
                      Deductible liabilities
                    </dt>
                    <dd className="font-semibold text-foreground">
                      −{formatBDT(calcData.breakdown.deductibleLiabilitiesBdt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-brand-soft dark:bg-primary/15 px-3 py-2 text-sm">
                    <dt className="font-semibold text-[#064581] dark:text-primary">
                      Net zakatable wealth
                    </dt>
                    <dd className="font-bold text-[#064581] dark:text-primary">
                      {formatBDT(calcData.breakdown.netZakatableWealthBdt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">
                      Selected nisab ({calcData.nisabBasis})
                    </dt>
                    <dd className="font-semibold text-foreground">
                      {formatBDT(calcData.breakdown.selectedNisabBdt)}
                    </dd>
                  </div>
                </dl>
              </div>

              {conversions.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Banknote className="size-4" aria-hidden="true" /> Foreign
                    currency conversions
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {conversions.map((c, i) => (
                      <li
                        key={`${c.inputCurrency}-${c.inputAmount}-${i}`}
                        className="rounded-xl border border-input px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {c.inputAmount} {c.inputCurrency} →{" "}
                            {formatBDT(c.convertedBdt)}
                          </span>
                          <MarketBadge isLive={c.isLive} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Rate 1 {c.inputCurrency} = {c.rateToBdt} BDT · Source{" "}
                          {c.source} · {formatDate(c.rateDate)}
                          {!c.isLive && " · Reference rate, not live."}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {calcData.disclaimer}
              </p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
