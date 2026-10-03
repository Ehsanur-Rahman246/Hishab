import { Link } from "react-router";
import { Bot, ShieldCheck, TrendingUp, Wallet } from "lucide-react";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-svh bg-[#F5F7FA]">
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#0756A6] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to form
      </a>

      <div className="mx-auto grid min-h-svh w-full max-w-6xl lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-[#064581] p-10 text-white lg:flex">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFD21F]"
            aria-label="Hishab home"
          >
            <span
              className="flex size-10 items-center justify-center rounded-xl bg-white text-[#064581]"
              aria-hidden="true"
            >
              <Wallet className="size-5" />
            </span>
            <span className="font-heading text-2xl font-extrabold tracking-tight">
              Hishab<span className="text-[#FFD21F]">.</span>
            </span>
          </Link>

          <div className="max-w-md">
            <h1 className="font-heading text-3xl leading-tight font-extrabold">
              Your money.
              <br />
              Clearer decisions.
            </h1>
            <p className="mt-3 leading-relaxed text-blue-100">
              Track spending, see your 4-week forecast, and ask the bilingual
              AI coach — all from your own transactions.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: TrendingUp,
                  text: "4-week forecast from your real history",
                },
                { icon: Bot, text: "Bangla, English & mixed AI coach" },
                { icon: ShieldCheck, text: "Insights stay private to you" },
              ].map((row) => (
                <li key={row.text} className="flex items-center gap-3 text-sm">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10"
                    aria-hidden="true"
                  >
                    <row.icon className="size-4 text-[#FFD21F]" />
                  </span>
                  {row.text}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-blue-200">
            Built for smarter everyday money decisions
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col bg-[#F5F7FA]">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-8 lg:hidden">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
              aria-label="Hishab home"
            >
              <span
                className="flex size-9 items-center justify-center rounded-xl bg-[#0756A6] text-white"
                aria-hidden="true"
              >
                <Wallet className="size-5" />
              </span>
              <span className="font-heading text-xl font-extrabold text-[#17212B]">
                Hishab<span className="text-[#0756A6]">.</span>
              </span>
            </Link>
          </div>

          <main
            id="auth-form"
            className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#d7e5f5] bg-white p-6 shadow-[0_18px_50px_-20px_rgba(7,86,166,0.35)] sm:p-8">
              <h2 className="font-heading text-2xl font-extrabold text-[#064581]">
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#3d4f63]">
                {subtitle}
              </p>
              <div className="mt-6">{children}</div>
              {footer ? <div className="mt-6">{footer}</div> : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
