import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  ChevronRight,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts } from "@/hooks/useAlerts";
import { useCurrentUser, useDeleteAccount, useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// Data sources (all existing hooks, no new endpoints):
//   useCurrentUser -> GET /api/auth/me      { uid, name, phone }
//   useWallet      -> GET /api/wallet       { walletNumber, balance, currency, isActive, createdAt }
//   useAlerts      -> GET /api/alerts       alerts[].read
//   useLogout      -> POST /api/auth/logout
//   useDeleteAccount -> DELETE /api/auth/delete-account { pin }
// Name/phone are read-only because the backend has no profile-update route yet.

const TABS = [
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "preferences", label: "Preferences", icon: Palette },
];

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

// One settings line: icon + title + helper text on the left, value/control on the right.
function SettingRow({ icon: Icon, title, description, children, danger = false }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
            danger ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", danger && "text-destructive")}>{title}</p>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 text-sm font-medium sm:pl-0">{children}</div>
    </div>
  );
}

function Panel({ title, children, className }) {
  return (
    <section
      className={cn(
        "divide-y divide-border rounded-2xl bg-card p-5 shadow-panel ring-1 ring-foreground/10 sm:p-6",
        className,
      )}
    >
      {title ? (
        <h2 className="pb-4 font-heading text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

function ComingSoon() {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Coming soon</span>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const userQuery = useCurrentUser();
  const alertsQuery = useAlerts();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();

  const [tab, setTab] = useState("security");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const user = userQuery.data;
  const unread = (alertsQuery.data?.alerts ?? []).filter((a) => !a.read).length;
  const currentTheme = theme ?? "system";

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

  if (userQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-5" role="status" aria-label="Loading settings">
        <Skeleton className="h-12 rounded-xl bg-muted" />
        <Skeleton className="h-10 w-72 rounded-lg bg-muted" />
        <Skeleton className="h-96 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-8 text-center shadow-panel ring-1 ring-foreground/10">
        <h2 className="text-lg">Settings unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground" role="alert">
          We could not load your account. Please try again.
        </p>
        <Button className="mt-4" onClick={() => userQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Manage your account details, sign-in security and how Hishab looks on this device.
      </p>

      {/* Security note (true to the backend: bcrypt-hashed PIN + httpOnly JWT cookie) */}
      <div className="flex items-center gap-3 rounded-xl bg-secondary/70 px-4 py-3 text-sm ring-1 ring-primary/10">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <p className="text-secondary-foreground">
          Your 6-digit PIN is stored encrypted and never shown. Never share it with anyone, not even Hishab support.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={active}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </button>
          );
        })}
      </div>

      {/* SECURITY */}
      {tab === "security" ? (
        <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" className="space-y-5">
          <Panel title="Sign-in">
            <SettingRow icon={KeyRound} title="Change PIN" description="Your 6-digit login PIN">
              <span className="tracking-widest text-muted-foreground">{"\u2022".repeat(6)}</span>
              <ComingSoon />
            </SettingRow>
            <SettingRow icon={LogOut} title="Sign out" description="End your session on this device">
              <Button variant="outline" onClick={handleLogout} disabled={logout.isPending} className="h-9 rounded-xl">
                {logout.isPending ? "Signing out\u2026" : "Sign out"}
              </Button>
            </SettingRow>
          </Panel>

          <Panel title="Danger zone" className="ring-destructive/30">
            <SettingRow
              icon={Trash2}
              title="Delete account"
              description="Permanently removes your wallet, transactions, goals, alerts, forecasts and chat history"
              danger
            >
              <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="h-9 rounded-xl">
                Delete account
              </Button>
            </SettingRow>
          </Panel>
        </div>
      ) : null}

      {/* PREFERENCES */}
      {tab === "preferences" ? (
        <div role="tabpanel" id="panel-preferences" aria-labelledby="tab-preferences" className="space-y-5">
          <Panel title="Appearance">
            <SettingRow icon={Palette} title="Theme" description="Choose how Hishab looks on this device">
              <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl bg-muted p-1">
                {THEMES.map(({ id, label, icon: Icon }) => {
                  const active = currentTheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
          </Panel>

          <Panel title="Notifications">
            <SettingRow
              icon={Bell}
              title="Alerts"
              description={alertsQuery.isPending ? "Loading\u2026" : unread ? `${unread} unread` : "You are all caught up"}
            >
              <Link
                to="/notifications"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {unread ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground tabular-nums">
                    {unread}
                  </span>
                ) : null}
                Open alerts
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </SettingRow>
          </Panel>
        </div>
      ) : null}

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
            <label htmlFor="settings-delete-pin" className="text-sm font-medium">
              PIN
            </label>
            <Input
              id="settings-delete-pin"
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