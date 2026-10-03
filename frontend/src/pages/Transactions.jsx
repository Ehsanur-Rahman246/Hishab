import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Banknote,
  Briefcase,
  Bus,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Film,
  Funnel,
  GraduationCap,
  HeartPulse,
  Loader2,
  PiggyBank,
  Plus,
  Receipt,
  ReceiptText,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
} from "@/hooks/useTransactions";
import { formatBDT, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants (these mirror the backend: models/Transaction.js + controller)
// ---------------------------------------------------------------------------

const TAKA = "\u09F3";
const MINUS = "\u2212";

// The backend caps `limit` at 200. Search and sort run on the loaded page, so
// a large page keeps them useful; pagination kicks in beyond this.
const PAGE_SIZE = 100;

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Healthcare",
  "Education",
  "Savings",
  "Cash Out",
  "Send Money",
  "Mobile Recharge",
  "Other",
];

const CATEGORY_ICONS = {
  Food: UtensilsCrossed,
  Transport: Bus,
  Shopping: ShoppingBag,
  Bills: Receipt,
  Entertainment: Film,
  Healthcare: HeartPulse,
  Education: GraduationCap,
  Savings: PiggyBank,
  "Cash Out": Banknote,
  "Send Money": Send,
  "Mobile Recharge": Smartphone,
  Other: Tag,
};

const RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "high", label: "Highest amount" },
  { value: "low", label: "Lowest amount" },
];

const SORTERS = {
  newest: (a, b) => new Date(b.date) - new Date(a.date),
  oldest: (a, b) => new Date(a.date) - new Date(b.date),
  high: (a, b) => b.amount - a.amount,
  low: (a, b) => a.amount - b.amount,
};

// Shared look for every filter control so the bar lines up like the design.
const CONTROL =
  "h-12 w-full rounded-xl border border-input bg-card text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Start of the chosen range as an ISO string (undefined = no lower bound).
// Built from local midnight so the value (and the react-query key) stays
// stable across renders instead of changing every millisecond.
function rangeStart(range) {
  if (range === "all") return undefined;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "month") {
    start.setDate(1);
  } else {
    const days = RANGES.find((r) => r.value === range)?.days ?? 30;
    start.setDate(start.getDate() - days);
  }
  return start.toISOString();
}

// "all" | "type:income" | "type:expense" | "cat:Food"  ->  API params
function filterParams(filter) {
  if (filter.startsWith("type:")) return { type: filter.slice(5) };
  if (filter.startsWith("cat:")) return { category: filter.slice(4) };
  return {};
}

const toInputDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

// <input type="date"> gives "YYYY-MM-DD". Sending that raw would be parsed as
// UTC midnight and can show up as the previous day for some time zones, so
// send "now" for today and local noon for any other day.
function toIsoDate(inputDate) {
  if (inputDate === toInputDate()) return new Date().toISOString();
  const [y, m, d] = inputDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;

const titleOf = (tx) => tx.description || tx.subcategory || tx.category;

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function SelectControl({ icon: Icon, label, value, onChange, children }) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(CONTROL, "cursor-pointer appearance-none pr-10 pl-11")}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

function TransactionRow({ tx, onDelete }) {
  const income = tx.type === "income";
  const Icon = income ? Briefcase : (CATEGORY_ICONS[tx.category] ?? Tag);
  const DirectionIcon = income ? ArrowDownLeft : ArrowUpRight;
  const title = titleOf(tx);

  return (
    <li className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-primary before:opacity-0 before:transition-opacity hover:bg-secondary/60 hover:before:opacity-100 sm:gap-4 sm:px-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 sm:w-56 sm:flex-none lg:w-72">
        <p className="truncate text-[15px] font-semibold text-foreground">
          {title}
        </p>
        {/* the category pill and date columns are hidden on phones, so fold
            them under the title there */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
          {tx.category} &middot; {formatDate(tx.date)}
        </p>
      </div>

      <div className="hidden w-36 shrink-0 justify-center sm:flex">
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-4 py-1 text-center text-xs font-medium text-foreground">
          {tx.category}
        </span>
      </div>

      <time
        dateTime={tx.date}
        className="hidden w-28 shrink-0 text-sm text-muted-foreground md:ml-auto md:block"
      >
        {formatDate(tx.date)}
      </time>

      <p
        className={cn(
          "flex w-28 shrink-0 items-center justify-end gap-1.5 text-[15px] font-bold tabular-nums sm:ml-auto sm:w-36 md:ml-0",
          income ? "text-success" : "text-foreground",
        )}
      >
        <DirectionIcon className="size-3.5" aria-hidden="true" />
        <span>
          {income ? "+" : MINUS}
          {formatBDT(tx.amount)}
        </span>
      </p>

      <button
        type="button"
        onClick={() => onDelete(tx)}
        aria-label={`Delete ${title}`}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-panel ring-1 ring-foreground/10 sm:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate font-heading text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading transactions" className="divide-y">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-12 rounded-xl bg-muted" />
          <Skeleton className="h-5 w-40 flex-1 rounded-md bg-muted sm:max-w-56" />
          <Skeleton className="hidden h-6 w-24 rounded-full bg-muted sm:block" />
          <Skeleton className="h-5 w-24 rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered, onReset, onAdd }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary">
        <ReceiptText className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg text-foreground">
        {filtered ? "No matching transactions" : "No transactions yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Nothing fits these filters. Try a wider date range or clear the filters."
          : "Add your first payment or deposit and it will show up here."}
      </p>
      {filtered ? (
        <Button variant="outline" className="mt-5 h-10 rounded-xl px-5" onClick={onReset}>
          Clear filters
        </Button>
      ) : (
        <Button
          className="mt-5 h-10 rounded-xl bg-[#064581] px-5 text-white hover:bg-[#0755a4]"
          onClick={onAdd}
        >
          <Plus aria-hidden="true" /> Add transaction
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add transaction dialog
// ---------------------------------------------------------------------------

const defaultCategory = (type) => (type === "income" ? "Other" : "Food");

function AddTransactionDialog({ open, onOpenChange, onCreated }) {
  const create = useCreateTransaction();

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(defaultCategory("expense"));
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toInputDate());
  const [error, setError] = useState("");

  const reset = () => {
    setType("expense");
    setAmount("");
    setCategory(defaultCategory("expense"));
    setDescription("");
    setDate(toInputDate());
    setError("");
  };

  const handleOpenChange = (next) => {
    if (create.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const changeType = (next) => {
    setType(next);
    // only swap the category if the person hasn't chosen one themselves
    setCategory((c) => (c === defaultCategory(type) ? defaultCategory(next) : c));
  };

  const submit = (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!date) {
      setError("Pick a date.");
      return;
    }
    setError("");

    create.mutate(
      {
        type,
        category,
        amount: value,
        date: toIsoDate(date),
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(type === "income" ? "Income added" : "Expense added");
          reset();
          onOpenChange(false);
          onCreated?.();
        },
        onError: (err) =>
          setError(errorMessage(err, "Could not save the transaction. Please try again.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-[#064581] dark:text-primary">
              Add transaction
            </DialogTitle>
            <DialogDescription>
              Expenses reduce your wallet balance and income increases it.
            </DialogDescription>
          </DialogHeader>

          <div
            role="group"
            aria-label="Transaction type"
            className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
          >
            {["expense", "income"].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => changeType(t)}
                className={cn(
                  "h-10 rounded-lg text-sm font-semibold capitalize transition",
                  type === t
                    ? "bg-card text-[#064581] shadow-sm dark:text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tx-amount">Amount</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-semibold text-muted-foreground"
                aria-hidden="true"
              >
                {TAKA}
              </span>
              <input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(CONTROL, "h-11 pl-9")}
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tx-category">Category</Label>
              <select
                id="tx-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={cn(CONTROL, "h-11 cursor-pointer px-3")}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-date">Date</Label>
              <input
                id="tx-date"
                type="date"
                max={toInputDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={cn(CONTROL, "h-11 px-3")}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tx-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <input
              id="tx-description"
              type="text"
              maxLength={500}
              placeholder="e.g. Groceries at Shwapno"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(CONTROL, "h-11 px-3")}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4"
              onClick={() => handleOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-10 rounded-xl bg-[#064581] px-5 text-white hover:bg-[#0755a4]"
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {create.isPending ? "Saving..." : "Save transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("30d");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const from = useMemo(() => rangeStart(range), [range]);
  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...filterParams(filter),
      ...(from ? { from } : {}),
    }),
    [page, filter, from],
  );

  const { data, isLoading, isFetching, error, refetch } = useTransactions(params);
  const remove = useDeleteTransaction();

  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const pagination = data?.pagination;

  // The API filters by type, category and date. Free-text search and sorting
  // are applied here, to the page that is loaded.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? transactions.filter((tx) =>
          [tx.description, tx.subcategory, tx.category, tx.type, String(tx.amount)]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q)),
        )
      : transactions;
    return [...matches].sort(SORTERS[sort]);
  }, [transactions, search, sort]);

  const totals = useMemo(() => {
    let income = 0;
    let spent = 0;
    for (const tx of visible) {
      if (tx.type === "income") income += tx.amount;
      else spent += tx.amount;
    }
    return { income, spent, net: income - spent };
  }, [visible]);

  const hasFilters = Boolean(search.trim()) || filter !== "all" || range !== "all";

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setRange("all");
    setSort("newest");
    setPage(1);
  };

  // changing a server-side filter always goes back to the first page
  const onServerFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete._id, {
      onSuccess: () => {
        toast.success("Transaction deleted");
        // don't strand the person on a page that just became empty
        if (transactions.length === 1 && page > 1) setPage(page - 1);
        setToDelete(null);
      },
      onError: (err) =>
        toast.error(errorMessage(err, "Could not delete the transaction.")),
    });
  };

  const total = pagination?.total ?? transactions.length;
  const pages = pagination?.pages ?? 1;
  const firstShown = (page - 1) * PAGE_SIZE + 1;
  const lastShown = firstShown + transactions.length - 1;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl font-extrabold text-[#064581] sm:text-4xl dark:text-primary">
            Transactions
          </h2>
          <span className="mt-2 block h-1 w-12 rounded-full bg-accent" aria-hidden="true" />
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Every payment and deposit in your wallet.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="h-12 rounded-xl bg-[#064581] px-6 text-[15px] font-semibold text-white shadow-sm hover:bg-[#0755a4]"
        >
          <Plus aria-hidden="true" /> Add transaction
        </Button>
      </div>

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={ArrowDownLeft}
          label="Income"
          value={formatBDT(totals.income)}
          hint={`${RANGES.find((r) => r.value === range)?.label ?? ""}`}
        />
        <StatCard
          icon={ArrowUpRight}
          label="Spending"
          value={formatBDT(totals.spent)}
          hint={`${RANGES.find((r) => r.value === range)?.label ?? ""}`}
        />
        <StatCard
          icon={Wallet}
          label="Net"
          value={`${totals.net < 0 ? MINUS : ""}${formatBDT(Math.abs(totals.net))}`}
          hint={totals.net >= 0 ? "You are saving" : "Spending exceeds income"}
        />
      </section>

      <section
        aria-label="Transactions list"
        className="overflow-hidden rounded-2xl bg-card shadow-panel ring-1 ring-foreground/10"
      >
        <div className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search transactions"
              placeholder="Search transactions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(CONTROL, "pr-4 pl-11")}
            />
          </div>

          <SelectControl
            icon={Funnel}
            label="Filter by type or category"
            value={filter}
            onChange={onServerFilter(setFilter)}
          >
            <option value="all">All</option>
            <optgroup label="Type">
              <option value="type:income">Income</option>
              <option value="type:expense">Expenses</option>
            </optgroup>
            <optgroup label="Category">
              {CATEGORIES.map((c) => (
                <option key={c} value={`cat:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
          </SelectControl>

          <SelectControl
            icon={CalendarDays}
            label="Date range"
            value={range}
            onChange={onServerFilter(setRange)}
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectControl>

          <SelectControl
            icon={ArrowUpDown}
            label="Sort transactions"
            value={sort}
            onChange={setSort}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectControl>
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <CircleAlert className="size-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg text-foreground">Transactions unavailable</h3>
            <p role="alert" className="mt-1 max-w-sm text-sm text-muted-foreground">
              {errorMessage(error, "We could not load your transactions. Please try again.")}
            </p>
            <Button className="mt-5 h-10 rounded-xl px-5" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            filtered={hasFilters}
            onReset={resetFilters}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <ul
            aria-busy={isFetching}
            className={cn("divide-y transition-opacity", isFetching && "opacity-60")}
          >
            {visible.map((tx) => (
              <TransactionRow key={tx._id} tx={tx} onDelete={setToDelete} />
            ))}
          </ul>
        )}

        {!isLoading && !error && transactions.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground sm:px-5">
            <p>
              {search.trim()
                ? `${visible.length} of ${transactions.length} on this page match`
                : `Showing ${firstShown}\u2013${lastShown} of ${total}`}
              {pages > 1 ? " \u00B7 search and sort apply to this page" : ""}
            </p>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-lg"
                  aria-label="Previous page"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span className="min-w-20 text-center tabular-nums">
                  Page {page} of {pages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-lg"
                  aria-label="Next page"
                  disabled={page >= pages || isFetching}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <AddTransactionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => setPage(1)}
      />

      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${titleOf(toDelete)} (${toDelete.type === "income" ? "+" : MINUS}${formatBDT(
                    toDelete.amount,
                  )}) will be removed and your wallet balance adjusted to match.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4"
              onClick={() => setToDelete(null)}
              disabled={remove.isPending}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="h-10 rounded-xl px-4"
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}