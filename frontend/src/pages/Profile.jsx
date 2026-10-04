import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  ChartLine,
  ChevronRight,
  KeyRound,
  LogOut,
  Moon,
  Plus,
  Sparkles,
  Target,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAlerts } from "@/hooks/useAlerts";
import { useCurrentUser, useDeleteAccount, useLogout } from "@/hooks/useAuth";
import { useForecasts } from "@/hooks/useForecasts";
import { useGoals } from "@/hooks/useGoals";
import { useAddMoney, useWallet, useWithdrawMoney } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { formatBDTWhole, formatDate } from "@/lib/format";

// Every value on this page comes from an existing endpoint:
//   useCurrentUser -> GET /api/auth/me   { uid, name, phone }
//   useWallet      -> GET /api/wallet    { walletNumber, balance, currency, createdAt }
//   useGoals       -> GET /api/goals     goals[].status
//   useAlerts      -> GET /api/alerts    alerts[].read
//   useForecasts   -> GET /api/forecasts weeks[].shortfallRisk
// Rows for features the backend does not have yet (change PIN, KYC, limits...)
// are shown as disabled "Coming soon" rows, so nothing on the page is invented.

const RISK_RANK = { low: 0, medium: 1, high: 2 };
const RISK_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" };

const initials = (name) =>
  String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

// ---------------------------------------------------------------------------
// Row: icon, title, live subtitle, and a chevron / toggle / badge on the right.
// ---------------------------------------------------------------------------
function Row({ icon: Icon, title, subtitle, to, onClick, right, disabled = false, danger = false }) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          danger ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary",
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate font-medium", danger && "text-destructive")}>{title}</span>
        {subtitle ? <span className="block truncate text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
      {right === undefined ? (
        disabled ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            Coming soon
          </span>
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )
      ) : (
        right
      )}
    </>
  );

  const base =
    "flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-panel ring-1 ring-foreground/10";
  const interactive =
    "transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (to) {
    return (
      <Link to={to} className={cn(base, interactive)}>
        {body}
      </Link>
    );
  }
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={cn(base, interactive)}>
        {body}
      </button>
    );
  }
  // static row (toggle or disabled)
  return <div className={cn(base, disabled && "opacity-60")}>{body}</div>;
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h2 className="px-1 font-heading text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function MiniStat({ label, value, loading, to }) {
  return (
    <Link
      to={to}
      className="min-w-0 rounded-xl bg-muted/60 px-3 py-2 text-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {loading ? (
        <Skeleton className="mx-auto h-6 w-10 rounded-md bg-muted" />
      ) : (
        <p className="font-heading text-lg font-extrabold leading-tight tabular-nums">{value}</p>
      )}
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function DetailLine({ label, value, compact = false }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b last:border-b-0", compact ? "py-1.5" : "py-2.5")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium tabular-nums">{value || "\u2014"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Profile() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  const userQuery = useCurrentUser();
  const walletQuery = useWallet();
  const goalsQuery = useGoals();
  const alertsQuery = useAlerts();
  const forecastsQuery = useForecasts();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showBalance, setShowBalance] = useState(false); // balance stays hidden until tapped
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [moneyMode, setMoneyMode] = useState(null); // null | "add" | "withdraw"
  const [amount, setAmount] = useState("");
  const [moneyError, setMoneyError] = useState("");
  const addMoney = useAddMoney();
  const withdrawMoney = useWithdrawMoney();

  const user = userQuery.data;
  const wallet = walletQuery.data?.wallet;
  const activeGoals = (goalsQuery.data?.goals ?? []).filter((g) => g.status === "active");
  const unread = (alertsQuery.data?.alerts ?? []).filter((a) => !a.read).length;
  const latest = forecastsQuery.data?.forecasts?.[0];
  const worst = (latest?.weeks ?? []).reduce(
    (w, wk) => (RISK_RANK[wk.shortfallRisk] > RISK_RANK[w] ? wk.shortfallRisk : w),
    "low",
  );

  const handleLogout = () =>
    logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });

  const closeDelete = (open) => {
    setDeleteOpen(open);
    if (!open) {
      setPin("");
      setDeleteError("");
    }
  };

  const handleDelete = () => {
    setDeleteError("");
    deleteAccount.mutate(pin, {
      onSuccess: () => {
        toast.success("Your account has been deleted");
        navigate("/login", { replace: true });
      },
      onError: (err) =>
        setDeleteError(err?.response?.data?.message || "Could not delete your account. Please try again."),
    });
  };

  const moneyMutation = moneyMode === "withdraw" ? withdrawMoney : addMoney;

  const closeMoney = (open) => {
    if (!open) {
      setMoneyMode(null);
      setAmount("");
      setMoneyError("");
    }
  };

  const submitMoney = (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMoneyError("Enter an amount greater than zero.");
      return;
    }
    setMoneyError("");
    moneyMutation.mutate(
      { amount: value },
      {
        onSuccess: () => {
          toast.success(moneyMode === "withdraw" ? `${formatBDTWhole(value)} withdrawn` : `${formatBDTWhole(value)} added`);
          closeMoney(false);
        },
        onError: (err) => setMoneyError(err?.response?.data?.message || "Something went wrong. Please try again."),
      },
    );
  };

  if (userQuery.isPending) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[320px_1fr]" role="status" aria-label="Loading profile">
        <Skeleton className="h-64 rounded-xl bg-muted" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div className="mx-auto max-w-md rounded-xl bg-card p-8 text-center shadow-panel ring-1 ring-foreground/10">
        <h2 className="text-lg">Profile unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground" role="alert">
          We could not load your profile. Please try again.
        </p>
        <Button className="mt-4" onClick={() => userQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:h-[calc(100svh-87px-4rem)] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      {/* Tall card, grouped top to bottom: who you are, money + actions, shortcuts, details, sign out. */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 shadow-panel ring-1 ring-foreground/10">
        <div className="flex items-center gap-3">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-heading text-lg font-extrabold text-primary-foreground ring-4 ring-secondary"
            aria-hidden="true"
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-base font-extrabold leading-tight tracking-tight">{user.name}</h1>
          </div>
        </div>

        {/* Balance hero: the one thing on this card that should catch the eye. */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary to-[#0d3975] p-4 text-primary-foreground shadow-md">
          <span className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-white/10" aria-hidden="true" />
          <span className="pointer-events-none absolute -right-2 -bottom-10 size-24 rounded-full bg-white/5" aria-hidden="true" />
          <p className="relative flex items-center gap-1.5 text-xs font-medium opacity-80">
            <Wallet className="size-3.5" aria-hidden="true" /> Total balance
          </p>
          {walletQuery.isPending ? (
            <Skeleton className="relative mt-1.5 h-10 w-40 rounded-md bg-white/20" />
          ) : (
            <button
              type="button"
              onClick={() => wallet && setShowBalance((v) => !v)}
              disabled={!wallet}
              aria-pressed={showBalance}
              aria-label={showBalance ? "Hide balance" : "Tap to view balance"}
              className="relative mt-0.5 grid w-full cursor-pointer items-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-default"
            >
              {/* Hint wipes out left to right... */}
              <span
                aria-hidden={showBalance}
                className={`col-start-1 row-start-1 text-sm font-semibold opacity-90 transition-[clip-path] duration-500 ease-in-out motion-reduce:transition-none ${
                  showBalance ? "[clip-path:inset(0_0_0_100%)]" : "[clip-path:inset(0_0_0_0)]"
                }`}
              >
                Tap to view balance
              </span>
              {/* ...while the balance wipes in over the same space. */}
              <span
                aria-hidden={!showBalance}
                className={`col-start-1 row-start-1 font-heading text-4xl font-extrabold leading-tight tracking-tight tabular-nums transition-[clip-path] duration-500 ease-in-out motion-reduce:transition-none ${
                  showBalance ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_100%_0_0)]"
                }`}
              >
                {wallet ? formatBDTWhole(wallet.balance) : "\u2014"}
              </span>
            </button>
          )}
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMoneyMode("add")}
              disabled={!wallet}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" /> Add money
            </button>
            <button
              type="button"
              onClick={() => setMoneyMode("withdraw")}
              disabled={!wallet}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/15 text-sm font-semibold transition-colors hover:bg-white/25 disabled:opacity-50"
            >
              <ArrowUpRight className="size-4" aria-hidden="true" /> Withdraw
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Active goals" to="/goals" loading={goalsQuery.isPending} value={activeGoals.length} />
          <MiniStat label="Unread alerts" to="/notifications" loading={alertsQuery.isPending} value={unread} />
        </div>

        <div className="mt-3 text-sm">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account details</p>
          <DetailLine compact label="Wallet number" value={wallet?.walletNumber} />
          <DetailLine compact label="Member since" value={wallet?.createdAt ? formatDate(wallet.createdAt) : null} />
        </div>

        <Button
          variant="outline"
          onClick={handleLogout}
          disabled={logout.isPending}
          className="mt-auto h-9 w-full rounded-xl"
        >
          <LogOut aria-hidden="true" />
          {logout.isPending ? "Signing out\u2026" : "Sign out"}
        </Button>
      </aside>

      <div className="min-h-0 space-y-6 lg:overflow-y-auto lg:p-1 lg:pr-3">
        <Section title="Account">
          <Row
            icon={User}
            title="Personal information"
            subtitle={`${user.name} \u2022 ${user.phone}`}
            onClick={() => setDetailsOpen(true)}
          />
          <Row
            icon={Wallet}
            title="Wallet"
            subtitle={
              wallet
                ? wallet.walletNumber
                : walletQuery.isPending
                  ? "Loading\u2026"
                  : "Wallet not available"
            }
            to="/transactions"
          />
        </Section>

        <Section title="My money">
          <Row
            icon={Target}
            title="Goals"
            subtitle={
              goalsQuery.isPending
                ? "Loading\u2026"
                : activeGoals.length
                  ? `${activeGoals.length} active ${activeGoals.length === 1 ? "goal" : "goals"}`
                  : "No active goals yet"
            }
            to="/goals"
          />
          <Row
            icon={ArrowLeftRight}
            title="Transactions"
            subtitle="Income and expenses"
            to="/transactions"
          />
          <Row
            icon={ChartLine}
            title="Forecast"
            subtitle={latest ? `${RISK_LABEL[worst] ?? "Low risk"} over the next ${latest.horizonWeeks} weeks` : "Not generated yet"}
            to="/forecast"
          />
          <Row icon={Sparkles} title="AI Assistant" subtitle="Ask about spending, savings and goals" to="/ai-assistant" />
        </Section>

        <Section title="Notifications">
          <Row
            icon={Bell}
            title="Alerts"
            subtitle={alertsQuery.isPending ? "Loading\u2026" : unread ? `${unread} unread` : "You are all caught up"}
            to="/notifications"
            right={
              unread ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid min-w-6 place-items-center rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground tabular-nums">
                    {unread}
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
                </span>
              ) : undefined
            }
          />
        </Section>

        <Section title="Security">
          <Row icon={KeyRound} title="Change PIN" subtitle="Your 6-digit login PIN" disabled />
        </Section>

        <Section title="App preferences">
          <Row
            icon={Moon}
            title="Dark mode"
            subtitle={resolvedTheme === "dark" ? "On" : "Off"}
            right={
              <Switch
                checked={resolvedTheme === "dark"}
                onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
                aria-label="Dark mode"
              />
            }
          />
        </Section>

        <Section title="Danger zone">
          <Row
            icon={Trash2}
            title="Delete account"
            subtitle="Permanently removes your wallet, transactions, goals and forecasts"
            onClick={() => setDeleteOpen(true)}
            danger
            right={null}
          />
        </Section>
      </div>

      {/* Personal information */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personal information</DialogTitle>
            <DialogDescription>Details saved with your Hishab account.</DialogDescription>
          </DialogHeader>
          <div className="text-sm">
            <DetailLine label="Full name" value={user.name} />
            <DetailLine label="Phone number" value={user.phone} />
            <DetailLine label="Account ID" value={user.uid} />
            <DetailLine label="Wallet number" value={wallet?.walletNumber} />
            <DetailLine label="Currency" value={wallet?.currency} />
            <DetailLine label="Member since" value={wallet?.createdAt ? formatDate(wallet.createdAt) : null} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Add money / Withdraw: POST /api/wallet/add-money and /withdraw */}
      <Dialog open={moneyMode !== null} onOpenChange={closeMoney}>
        <DialogContent>
          <form onSubmit={submitMoney} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{moneyMode === "withdraw" ? "Withdraw money" : "Add money"}</DialogTitle>
              <DialogDescription>
                Current balance: {wallet ? formatBDTWhole(wallet.balance) : "\u2014"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="money-amount" className="text-sm font-medium">
                Amount (BDT)
              </label>
              <Input
                id="money-amount"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={Boolean(moneyError)}
              />
              {moneyError ? (
                <p className="text-sm text-destructive" role="alert">
                  {moneyError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeMoney(false)} disabled={moneyMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!amount || moneyMutation.isPending}>
                {moneyMutation.isPending ? "Saving\u2026" : moneyMode === "withdraw" ? "Withdraw" : "Add money"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete account: backend requires the PIN */}
      <Dialog open={deleteOpen} onOpenChange={closeDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your wallet, transactions, goals, alerts, forecasts and chat history. It cannot be
              undone. Enter your 6-digit PIN to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="delete-pin" className="text-sm font-medium">
              PIN
            </label>
            <Input
              id="delete-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              aria-invalid={Boolean(deleteError)}
            />
            {deleteError ? (
              <p className="text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDelete(false)} disabled={deleteAccount.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!/^\d{6}$/.test(pin) || deleteAccount.isPending}
            >
              {deleteAccount.isPending ? "Deleting\u2026" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}