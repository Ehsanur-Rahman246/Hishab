# User Research Protocol — Hishab Shortfall Prevention

Status: **User interviews pending — no qualitative claims are made yet.**

## 1. Primary outcome (fixed for all research)

> Reduce the rate of user-months with a cash-flow shortfall.

**Operational definition (verbatim everywhere):**
Historical cash-flow shortfall month = a completed calendar month where total
recorded expenses exceed total recorded income. Call this "cash-flow
shortfall", not "negative wallet balance", unless a verified month-start
wallet balance and full wallet ledger make actual balance reconstruction
possible. A forecasted shortfall = projected four-week expenses exceed
projected four-week income, or the existing cumulative predicted balance
becomes negative when a reliable current wallet balance is available.

## 2. Research questions

1. Do target users experience month-end / pre-salary cash shortages, and how
   do they discover them today?
2. Which of these would they find most useful: forecast, shortfall alert,
   category explanation, savings goal, anomaly alert — and why?
3. Do they track goals or save regularly today? What blocks them?
4. Do they understand finance terms better in English vs Bangla/Banglish?
5. What wording + action style makes a Shortfall Prevention Plan feel
   trustworthy and doable?
6. What trust / privacy concerns would stop them from using Hishab?

## 3. Minimum research target

- Interview at least **8–12 target MFS users**.
- Include users **with recent shortfall experience** and **varied
  Bangla/English comfort** (Bangla-first, mixed, English-comfortable).
- Record for each: consent, anonymised participant code (e.g. P01…P12),
  shortfall recency, language comfort, feature ranking.
- Report **only aggregated findings** (counts, distributions, themes).
  Never publish raw transcripts with identifiers.

## 4. Method

- 25–35 minute semi-structured interviews, in the participant's preferred
  language (Bangla / English / Banglish).
- Use `docs/INTERVIEW_GUIDE_BN_EN.md` verbatim; neutral probes only.
- Obtain consent with `docs/RESEARCH_CONSENT.md` before recording/notes.
- Two note-takers or one + audio (with permission). Anonymise within 48h.
- Fill one row per participant in
  `docs/USER_RESEARCH_RESULTS_TEMPLATE.md`. No fictional rows.

## 5. Honesty rules (non-negotiable)

- Do NOT fabricate interviews, quotes, survey results, or causality.
- If zero interviews are done, every surface says:
  "User interviews pending — no qualitative claims are made yet."
- Demo/synthetic numbers are labelled **synthetic**. Real-user metrics stay
  **empty / pending** until consented study data exists.
- Before/after shortfall comparisons are **observational**, never causal,
  without a controlled study.

## 6. Data handling

- Store consent forms separately from notes. Notes carry participant codes
  only — no names, phone numbers, NID, or wallet numbers.
- In-app feedback requires an explicit consent checkbox
  (`POST /api/shortfall/feedback` rejects `consent !== true`).
- Only privacy-safe aggregates leave the device boundary:
  useful/not-useful, chosen helpful feature, language, capped free text.

## 7. Done criteria

- [ ] 8–12 consented interviews completed and anonymised.
- [ ] Results template filled with real aggregated counts.
- [ ] Feature-priority ranking updated from interview + in-app feedback
      (with "insufficient feedback" state respected for small samples).
- [ ] Limitations + next steps written in `PRODUCT_OUTCOME_REPORT.md`.
