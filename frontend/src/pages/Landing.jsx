import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  Languages,
  Menu,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  ReceiptText,
  Wallet,
  X,
} from "lucide-react";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#ai-coach", label: "AI Coach" },
];

const FEATURES = [
  {
    icon: Receipt,
    title: "Smart expense tracking",
    body: "Record every taka in seconds and see exactly where your money goes, grouped into clear categories.",
  },
  {
    icon: TrendingUp,
    title: "4-week ML forecast",
    body: "Look ahead with a four-week cash-flow outlook built from your own transaction history.",
  },
  {
    icon: BellRing,
    title: "Unusual spending alerts",
    body: "Get flagged when a purchase looks out of pattern, so surprises never slip past you.",
  },
  {
    icon: Languages,
    title: "Bangla, English & mixed AI coach",
    body: "Ask in বাংলা, English, or Banglish. Your coach answers in the language you use.",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    step: "Step 1",
    title: "Create account",
    body: "Sign up with your name, Bangladeshi mobile number, and a 6-digit PIN. A wallet is created for you automatically.",
  },
  {
    icon: ReceiptText,
    step: "Step 2",
    title: "Add transactions",
    body: "Log income and expenses as they happen. The more you track, the sharper your insights become.",
  },
  {
    icon: Sparkles,
    step: "Step 3",
    title: "Get AI insights",
    body: "Generate your forecast, review unusual spending, and chat with the AI coach about your next move.",
  },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Hishab home">
      <span
        className="flex size-9 items-center justify-center rounded-xl bg-[#0756A6] text-white"
        aria-hidden="true"
      >
        <Wallet className="size-5" />
      </span>
      <span className="font-heading text-xl font-extrabold tracking-tight text-[#17212B]">
        Hishab
        <span className="text-[#0756A6]">.</span>
      </span>
    </Link>
  );
}

function PreviewCard() {
  return (
    <div
      className="w-full rounded-2xl border border-[#d7e5f5] bg-white p-5 shadow-[0_18px_50px_-20px_rgba(7,86,166,0.35)]"
      role="img"
      aria-label="Preview of a Hishab financial insights card showing sample forecast data"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-[#0756A6] uppercase">
          Hishab insights
        </p>
        <span className="rounded-full bg-[#EAF3FC] px-2.5 py-1 text-[11px] font-semibold text-[#064581]">
          Preview — sample data
        </span>
      </div>

      <p className="mt-3 text-sm text-[#5b6b7f]">This month&apos;s balance</p>
      <p className="font-heading text-3xl font-extrabold text-[#17212B]">
        ৳ 24,580
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
        <TrendingUp className="size-3.5" aria-hidden="true" />
        On track · ৳ 6,200 expected left over
      </p>

      <div className="mt-4 rounded-xl bg-[#F5F7FA] p-3">
        <p className="text-xs font-semibold text-[#064581]">
          4-week forecast
        </p>
        <div className="mt-2 flex items-end gap-2" aria-hidden="true">
          {[42, 68, 55, 84].map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-md ${i === 3 ? "bg-[#FFD21F]" : "bg-[#0756A6]"}`}
                style={{ height: `${h}px`, opacity: i === 3 ? 1 : 0.85 }}
              />
              <span className="text-[10px] font-medium text-[#5b6b7f]">
                W{i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <BellRing
          className="mt-0.5 size-4 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-[#17212B]">
          <span className="font-semibold">Unusual spending:</span> dining out
          is 2.4× your weekly average.
        </p>
      </div>

      <div className="mt-3 rounded-xl bg-[#064581] p-3 text-white">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Bot className="size-4 text-[#FFD21F]" aria-hidden="true" />
          AI coach
        </p>
        <p className="mt-1 text-xs leading-relaxed text-blue-50">
          “আপনি এই মাসে ৳৩,০০০ সেভ করতে পারবেন যদি weekend খরচ একটু কমান।”
        </p>
      </div>
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-svh bg-[#F5F7FA] text-[#17212B]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#0756A6] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#d7e5f5] bg-white/95 backdrop-blur">
        <nav
          className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
          aria-label="Primary"
        >
          <Logo />

          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md text-sm font-medium text-[#3d4f63] transition-colors hover:text-[#0756A6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-2.5 md:flex">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-[#0756A6] transition-colors hover:bg-[#EAF3FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFD21F] px-4 py-2 text-sm font-bold text-[#17212B] shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
            >
              Get started
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-lg text-[#064581] hover:bg-[#EAF3FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6] md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </nav>

        {menuOpen && (
          <div
            id="mobile-menu"
            className="border-t border-[#d7e5f5] bg-white px-4 pt-2 pb-4 md:hidden"
          >
            <div className="flex flex-col">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-sm font-medium text-[#3d4f63] hover:bg-[#EAF3FC] hover:text-[#0756A6]"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2">
                <Link
                  to="/login"
                  className="rounded-lg border border-[#0756A6] px-4 py-2.5 text-center text-sm font-semibold text-[#0756A6]"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-[#FFD21F] px-4 py-2.5 text-center text-sm font-bold text-[#17212B]"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-white">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3FC] px-3 py-1.5 text-xs font-semibold text-[#064581]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Bangla + English AI financial coach
              </p>
              <h1 className="font-heading mt-4 text-4xl leading-[1.05] font-extrabold tracking-tight text-[#064581] sm:text-5xl">
                Your money.
                <br />
                Clearer decisions.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#3d4f63] sm:text-lg">
                Track everyday transactions, see a 4-week forecast, catch
                unusual spending early, and ask your bilingual AI coach
                anything — in বাংলা, English, or mixed.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0756A6] px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-10px_rgba(7,86,166,0.7)] transition-transform hover:-translate-y-px hover:bg-[#064581] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
                >
                  Create free account
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#0756A6] bg-white px-6 py-3.5 text-sm font-bold text-[#0756A6] transition-colors hover:bg-[#EAF3FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
                >
                  Log in
                </Link>
              </div>
              <ul className="mt-6 flex flex-col gap-2 text-sm text-[#3d4f63] sm:flex-row sm:flex-wrap sm:gap-x-5">
                {[
                  "Free to start",
                  "Wallet created automatically",
                  "Private to your account",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check
                      className="size-4 text-[#0756A6]"
                      aria-hidden="true"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <PreviewCard />
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
          aria-labelledby="features-heading"
        >
          <p className="text-xs font-bold tracking-widest text-[#0756A6] uppercase">
            Features
          </p>
          <h2
            id="features-heading"
            className="font-heading mt-2 max-w-2xl text-2xl font-extrabold text-[#064581] sm:text-3xl"
          >
            Everything you need for calmer money days
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#3d4f63] sm:text-base">
            Built around your real spending — not generic tips. Every forecast
            and alert is generated from your own transactions.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl border border-[#d7e5f5] bg-white p-5 shadow-[0_8px_28px_rgba(13,57,117,0.07)] transition-transform hover:-translate-y-1"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#0756A6] text-white">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading mt-4 text-base font-bold text-[#17212B]">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#3d4f63]">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="border-y border-[#d7e5f5] bg-[#EAF3FC]"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20">
            <p className="text-xs font-bold tracking-widest text-[#0756A6] uppercase">
              How it works
            </p>
            <h2
              id="how-heading"
              className="font-heading mt-2 text-2xl font-extrabold text-[#064581] sm:text-3xl"
            >
              From signup to insight in three steps
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="relative rounded-2xl bg-white p-6 shadow-[0_8px_28px_rgba(13,57,117,0.07)]"
                >
                  <span
                    className="absolute top-5 right-5 rounded-full bg-[#FFD21F] px-2.5 py-1 text-[11px] font-extrabold text-[#17212B]"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#064581] text-white">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-xs font-bold tracking-wide text-[#0756A6] uppercase">
                    {s.step}
                  </p>
                  <h3 className="font-heading mt-1 text-lg font-bold text-[#17212B]">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#3d4f63]">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* AI Coach */}
        <section
          id="ai-coach"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
          aria-labelledby="coach-heading"
        >
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold tracking-widest text-[#0756A6] uppercase">
                AI Coach
              </p>
              <h2
                id="coach-heading"
                className="font-heading mt-2 text-2xl font-extrabold text-[#064581] sm:text-3xl"
              >
                Ask the way you speak
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#3d4f63] sm:text-base">
                “আমি কি এই মাসে ৫০০০ টাকা জমাতে পারবো?” or “Can I afford a
                weekend trip?” — your coach reads your recent spending and
                forecast, then answers clearly in your language.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  "Personal answers from your transactions and forecast",
                  "Forecast, unusual spending, and budget questions welcome",
                  "Gentle, practical guidance — no jargon",
                ].map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-2 text-sm text-[#17212B]"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#FFD21F]">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0756A6] px-6 py-3 text-sm font-bold text-white hover:bg-[#064581] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
              >
                <Bot className="size-4" aria-hidden="true" />
                Meet your AI coach
              </Link>
            </div>

            <div
              className="rounded-2xl border border-[#d7e5f5] bg-white p-5 shadow-[0_8px_28px_rgba(13,57,117,0.07)]"
              aria-label="Example conversation with the AI coach"
            >
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0756A6] px-4 py-2.5 text-sm text-white">
                  Eid er age ki 8000 taka jomano possible?
                </p>
              </div>
              <div className="mt-3 flex justify-start">
                <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-[#F5F7FA] px-4 py-2.5 text-sm leading-relaxed text-[#17212B]">
                  হ্যাঁ, possible! গত ৪ সপ্তাহে আপনার গড় সাপ্তাহিক সেভিং
                  ৳২,৩০০। Dining খরচ ২০% কমালে ৫ সপ্তাহে ৳৮,০০০ হয়ে যাবে। ✨
                </p>
              </div>
              <div className="mt-3 flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0756A6] px-4 py-2.5 text-sm text-white">
                  What if I skip online shopping this week?
                </p>
              </div>
              <div className="mt-3 flex justify-start">
                <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-[#F5F7FA] px-4 py-2.5 text-sm leading-relaxed text-[#17212B]">
                  That alone would add about ৳1,800 to your buffer and move
                  Week 3 from medium to low risk.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section
          className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:pb-20"
          aria-labelledby="trust-heading"
        >
          <div className="rounded-2xl border border-[#d7e5f5] bg-white p-6 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF3FC] text-[#0756A6]">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="trust-heading"
                  className="font-heading text-xl font-extrabold text-[#064581] sm:text-2xl"
                >
                  Your data stays private
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#3d4f63] sm:text-base">
                  You log in to your own account, and every forecast, alert,
                  and coach answer is computed from your transactions only.
                  Other users never see your data, and you only ever see
                  yours. Always keep your 6-digit PIN secret and never share
                  it with anyone.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:pb-20">
          <div className="rounded-2xl bg-[#064581] px-6 py-10 text-center sm:px-12 sm:py-14">
            <h2 className="font-heading mx-auto max-w-xl text-2xl font-extrabold text-white sm:text-3xl">
              Start seeing your money clearly today
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-blue-100 sm:text-base">
              Create your free Hishab account and meet the coach that speaks
              your language.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFD21F] px-6 py-3.5 text-sm font-extrabold text-[#17212B] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Create free account
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#d7e5f5] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-heading text-base font-extrabold text-[#064581]">
              Hishab.
            </p>
            <p className="mt-1 text-sm text-[#3d4f63]">
              Built for smarter everyday money decisions
            </p>
          </div>
          <nav className="flex items-center gap-5" aria-label="Footer">
            <Link
              to="/login"
              className="text-sm font-semibold text-[#0756A6] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold text-[#0756A6] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
