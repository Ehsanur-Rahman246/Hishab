// Concise in-app Trust & Safety notice (mirrors README privacy section).
// Truthful: states what is stored/sent/never sent, retention, and that demo
// data is synthetic. Makes no promises about guarantees that are not built.
export function TrustAndSafety({ compact = false }) {
  return (
    <section
      aria-label="Trust and safety"
      className="rounded-2xl border bg-card p-5 text-sm"
    >
      <h3 className="font-heading text-base font-bold">Trust &amp; Safety</h3>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
        <li>
          Stored: transaction records, wallet/goal records, forecast snapshots,
          alerts, chat messages, goal-transfer audit records.
        </li>
        <li>
          The external AI sees aggregated, minimised context only — never raw
          transactions, phone numbers, passwords/PINs, JWTs, wallet numbers, or
          secrets.
        </li>
        <li>
          Chat keeps ~90 days, forecasts ~180 days (latest kept), resolved
          alerts ~90 days. Money-transfer audit records are immutable and never
          deleted by cleanup.
        </li>
        <li>
          No self-serve export/delete yet: use Clear chat for messages, or
          Delete account (PIN-confirmed) for profile data. Audit rows remain as
          financial evidence.
        </li>
        {!compact ? (
          <li>
            All demo accounts, screenshots, seed data, fixtures, and evaluation
            numbers are synthetic — they do not represent real customers.
          </li>
        ) : null}
        <li>
          Forecasts show confidence (high/medium/low) with reasons; low
          confidence falls back to a labelled average with a “Review manually”
          action. The AI never moves money — transfers need your explicit
          Confirm.
        </li>
      </ul>
    </section>
  );
}
