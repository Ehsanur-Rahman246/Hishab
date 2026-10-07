import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { formatBDT } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TOOLTIP_TEXT = "Your balance is hidden by default for privacy.";

/**
 * Privacy-first wallet balance control for the Dashboard header.
 *
 * - Hidden by default ("Balance hidden" + "Tap to view balance").
 * - Tapping reveals the authenticated user's own wallet balance (existing
 *   useWallet hook only — no new endpoint, no other user's data).
 * - Tapping again hides it immediately (Eye <-> EyeOff, label flips).
 * - In-memory visibility state only: never persisted to backend or
 *   localStorage, so refresh/logout resets to hidden.
 * - Loading shows a skeleton; failure shows "Balance unavailable" and never
 *   renders a stale or guessed value.
 */
export function BalancePrivacyToggle({ className }) {
  // Ephemeral UI state on purpose: hidden again after refresh/logout.
  const [revealed, setRevealed] = useState(false);
  const { data, isPending, isError } = useWallet();

  const rawBalance = data?.wallet?.balance;
  const balance = Number(rawBalance);
  const hasBalance = !isError && Number.isFinite(balance);

  if (isPending) {
    return (
      <span
        role="status"
        aria-label="Loading balance"
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3",
          className,
        )}
      >
        <Skeleton className="h-4 w-20 bg-muted" />
      </span>
    );
  }

  if (isError || !hasBalance) {
    // Safe failure: no balance value (stale or guessed) is ever rendered.
    return (
      <span
        role="status"
        className={cn(
          "inline-flex h-11 items-center rounded-xl border bg-card px-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Balance unavailable
      </span>
    );
  }

  return (
    <span
      className={cn(
        "group relative inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3",
        className,
      )}
    >
      {revealed ? (
        <span
          aria-live="polite"
          className="max-w-36 truncate text-sm font-semibold text-foreground tabular-nums"
        >
          {formatBDT(balance)}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Balance hidden</span>
      )}

      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? "Hide balance" : "View balance"}
        aria-pressed={revealed}
        title={TOOLTIP_TEXT}
        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-semibold text-primary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {revealed ? (
          <EyeOff className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Eye className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="hidden whitespace-nowrap sm:inline">
          {revealed ? "Hide" : "Tap to view balance"}
        </span>
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-50 mt-2 w-max max-w-56 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-muted-foreground opacity-0 shadow-md ring-1 ring-foreground/10 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {TOOLTIP_TEXT}
      </span>
    </span>
  );
}
