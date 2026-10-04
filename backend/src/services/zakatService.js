/**
 * Deterministic Zakat calculation (no LLM, no database, no guessing).
 *
 * All formulas are fixed here so they can be unit-tested in isolation:
 *   goldValue      = goldGrams  × goldBdtPerGram
 *   silverValue    = silverGrams × silverBdtPerGram
 *   gross          = cash + gold + silver + business(BDT) + foreign(BDT)
 *                    + pension(BDT, only what the user chooses to include)
 *   net            = max(0, gross - liabilities)
 *   goldNisab      = 87.48  × goldBdtPerGram
 *   silverNisab    = 612.36 × silverBdtPerGram
 *   eligible       = yearCompleted === true && net >= selectedNisab
 *   zakat          = eligible ? net × 0.025 : 0
 *
 * Stateless: pensionBdt is request-scoped only. It is never written to
 * MongoDB, never logged, and never cached — it lives and dies inside one
 * request/response cycle, exactly like every other Zakat input.
 */

export const GOLD_NISAB_GRAMS = 87.48;
export const SILVER_NISAB_GRAMS = 612.36;
export const ZAKAT_RATE = 0.025;
export const MAX_INPUT_VALUE = 1e12;
export const MAX_FOREIGN_ASSETS = 20;

export const ZAKAT_YEAR_TYPES = ["hijri", "gregorian"];
export const NISAB_BASES = ["gold", "silver"];

export const ZAKAT_DISCLAIMER =
  "This is an estimate based on values you entered and available market/reference data. Whether a specific pension balance should be included may depend on personal circumstances; consult a qualified scholar for personal religious guidance.";

const isValidAmount = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_INPUT_VALUE;

const checkAmount = (value, label, errors, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) errors.push(`${label} is required.`);
    return 0;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!isValidAmount(n)) {
    errors.push(`${label} must be a non-negative number.`);
    return 0;
  }
  return n;
};

/**
 * Validate the POST /api/zakat/calculate body.
 * Never reads or accepts a user ID from the body (auth comes from the JWT).
 * Returns { ok, errors, value } where value holds sanitized numbers.
 */
export const validateZakatInput = (body) => {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["Request body must be a JSON object."], value: null };
  }

  const { zakatYearType, yearCompleted, nisabBasis } = body;
  if (!ZAKAT_YEAR_TYPES.includes(zakatYearType)) {
    errors.push("zakatYearType must be 'hijri' or 'gregorian'.");
  }
  if (typeof yearCompleted !== "boolean") {
    errors.push("yearCompleted must be true or false.");
  }
  if (!NISAB_BASES.includes(nisabBasis)) {
    errors.push("nisabBasis must be 'gold' or 'silver'.");
  }

  const cashBdt = checkAmount(body.cashBdt, "cashBdt", errors);
  const goldGrams = checkAmount(body.goldGrams, "goldGrams", errors);
  const silverGrams = checkAmount(body.silverGrams, "silverGrams", errors);
  const deductibleLiabilitiesBdt = checkAmount(
    body.deductibleLiabilitiesBdt,
    "deductibleLiabilitiesBdt",
    errors
  );
  // Temporary optional field: pension funds the user chooses to include.
  // Request-scoped only — never persisted, never logged.
  const pensionBdt = checkAmount(body.pensionBdt, "pensionBdt", errors);

  // Business amount: optional { amount, currency }. Defaults to 0 BDT.
  let businessAmount = 0;
  let businessCurrency = "BDT";
  if (body.businessAmount !== undefined && body.businessAmount !== null) {
    const b = body.businessAmount;
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      errors.push("businessAmount must be an object with amount and currency.");
    } else {
      businessAmount = checkAmount(b.amount, "businessAmount.amount", errors);
      businessCurrency = String(b.currency || "BDT").trim().toUpperCase();
    }
  }

  // Foreign assets: optional list of { amount, currency, label? }.
  const foreignAssets = [];
  if (body.foreignAssets !== undefined && body.foreignAssets !== null) {
    if (!Array.isArray(body.foreignAssets)) {
      errors.push("foreignAssets must be an array.");
    } else if (body.foreignAssets.length > MAX_FOREIGN_ASSETS) {
      errors.push(`foreignAssets must have at most ${MAX_FOREIGN_ASSETS} entries.`);
    } else {
      body.foreignAssets.forEach((item, i) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`foreignAssets[${i}] must be an object.`);
          return;
        }
        const amount = checkAmount(item.amount, `foreignAssets[${i}].amount`, errors);
        const currency = String(item.currency || "").trim().toUpperCase();
        if (!currency) errors.push(`foreignAssets[${i}].currency is required.`);
        const label =
          typeof item.label === "string" ? item.label.trim().slice(0, 80) : "";
        foreignAssets.push({ amount, currency, label });
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors, value: null };

  return {
    ok: true,
    errors: [],
    value: {
      zakatYearType,
      yearCompleted,
      nisabBasis,
      cashBdt,
      goldGrams,
      silverGrams,
      businessAmount,
      businessCurrency,
      foreignAssets,
      deductibleLiabilitiesBdt,
      pensionBdt,
    },
  };
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Pure deterministic calculation. All currency conversions must already be
 * done by the caller (businessBdt, foreignAssetsBdt). Market prices are
 * passed in for nisab thresholds. No I/O, no randomness.
 */
export const calculateZakat = (input, market) => {
  const goldValueBdt = input.goldGrams * market.goldBdtPerGram;
  const silverValueBdt = input.silverGrams * market.silverBdtPerGram;

  const grossZakatableAssetsBdt =
    input.cashBdt +
    goldValueBdt +
    silverValueBdt +
    input.businessBdt +
    input.foreignAssetsBdt +
    input.pensionBdt;

  const netZakatableWealthBdt = Math.max(
    0,
    grossZakatableAssetsBdt - input.deductibleLiabilitiesBdt
  );

  const goldNisabBdt = GOLD_NISAB_GRAMS * market.goldBdtPerGram;
  const silverNisabBdt = SILVER_NISAB_GRAMS * market.silverBdtPerGram;
  const selectedNisabBdt = input.nisabBasis === "gold" ? goldNisabBdt : silverNisabBdt;

  const eligible =
    input.yearCompleted === true && netZakatableWealthBdt >= selectedNisabBdt;
  const zakatAmountBdt = eligible ? netZakatableWealthBdt * ZAKAT_RATE : 0;

  return {
    cashBdt: round2(input.cashBdt),
    goldValueBdt: round2(goldValueBdt),
    silverValueBdt: round2(silverValueBdt),
    businessValueBdt: round2(input.businessBdt),
    foreignAssetsBdt: round2(input.foreignAssetsBdt),
    pensionBdt: round2(input.pensionBdt),
    grossZakatableAssetsBdt: round2(grossZakatableAssetsBdt),
    deductibleLiabilitiesBdt: round2(input.deductibleLiabilitiesBdt),
    netZakatableWealthBdt: round2(netZakatableWealthBdt),
    selectedNisabBdt: round2(selectedNisabBdt),
    eligible,
    zakatAmountBdt: round2(zakatAmountBdt),
  };
};
