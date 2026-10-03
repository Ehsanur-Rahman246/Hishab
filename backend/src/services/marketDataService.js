/**
 * Privacy-first market data service for the Zakat Calculator.
 *
 * The React frontend must NEVER call a market/metal/FX API directly —
 * all market-data requests go through the Node backend via this module.
 *
 * Rules enforced here:
 * - Live provider values are preferred when configured AND valid.
 * - Otherwise clearly-labeled CURRENT REFERENCE (demo) values are used.
 * - The app NEVER invents, guesses, zeroes, or randomizes a price, and
 *   NEVER presents a reference value as live data.
 * - In-memory cache only (no MongoDB writes), with timeouts on every fetch.
 * - No user asset data is logged here (only provider status/errors).
 *
 * ---------------------------------------------------------------------------
 * EXACT LOCATIONS OF REFERENCE VALUES (update them here when needed):
 * - REFERENCE_GOLD_BDT_PER_GRAM  (24K gold, BDT per gram)
 * - REFERENCE_SILVER_BDT_PER_GRAM (BDT per gram)
 * - REFERENCE_MARKET_DATE         (YYYY-MM-DD string for metals + FX)
 * - REFERENCE_FX_TO_BDT           (per-currency reference rates to BDT)
 * ---------------------------------------------------------------------------
 *
 * Live metals provider contract (configure via METALS_API_BASE_URL +
 * METALS_API_KEY). The endpoint is fetched with GET and must return JSON in
 * ONE of these shapes (values in BDT per gram unless stated):
 *   1. { "goldBdtPerGram": 18500, "silverBdtPerGram": 250 }
 *      (snake_case variants gold_bdt_per_gram / silver_bdt_per_gram also work)
 *   2. { "rates": { "XAU_BDT": 18500, "XAG_BDT": 250 } }
 *   3. { "gold_usd_per_oz": 2600, "silver_usd_per_oz": 31,
 *        "usd_bdt": 122 }  (troy-oz values converted via 31.1034768 g/oz)
 * The API key is sent as an `x-api-key` header. Any other shape, missing
 * fields, or non-positive numbers are treated as INVALID and fall back to
 * the reference values below.
 *
 * Live FX provider contract (Frankfurter-compatible):
 *   GET {FX_API_BASE_URL}/latest?base={CUR}&symbols=BDT
 *   -> { "rates": { "BDT": 122 } }  (units of BDT per 1 CUR)
 * If FX_API_BASE_URL is unset, or a request times out / fails / returns an
 * invalid rate, the REFERENCE_FX_TO_BDT value for that currency is used and
 * marked as demo_reference. An optional generic fallback provider can be set
 * via FX_FALLBACK_API_BASE_URL (+ FX_FALLBACK_API_KEY, sent as `apikey`
 * query param); it is tried before the reference values.
 */

// --- Reference (demo) market values — NOT live prices -----------------------
export const REFERENCE_GOLD_BDT_PER_GRAM = 18500; // 24K gold, BDT per gram
export const REFERENCE_SILVER_BDT_PER_GRAM = 250; // BDT per gram
export const REFERENCE_MARKET_DATE = "2026-10-04"; // YYYY-MM-DD
export const REFERENCE_METALS_SOURCE = "demo_reference";

// --- Reference (demo) FX rates to BDT — NOT live exchange rates -------------
export const REFERENCE_FX_TO_BDT = {
  USD: 122,
  GBP: 165,
  EUR: 142,
  AED: 33.25,
  SAR: 32.53,
  INR: 1.45,
};
export const REFERENCE_FX_SOURCE = "demo_reference";

// Currencies the calculator accepts. BDT is the base (rate is always 1).
export const SUPPORTED_CURRENCIES = ["BDT", "USD", "GBP", "EUR", "AED", "SAR", "INR"];

const TROY_OZ_TO_GRAMS = 31.1034768;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours (within the 1–6h window)

// In-memory cache only. Key -> { value, expiresAt }. Never persisted.
const cache = new Map();

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const cacheSet = (key, value) => {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Exported for tests only (lets suites reset the in-memory cache).
export const clearMarketDataCache = () => cache.clear();

const fetchJsonWithTimeout = async (url, headers = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`provider status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// Pull the first positive number found at any of the given key paths.
const pickPositive = (obj, paths) => {
  for (const path of paths) {
    const v = path.reduce(
      (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
      obj
    );
    const n = Number(v);
    if (isPositiveNumber(n)) return n;
  }
  return null;
};

/**
 * Try the configured live metals provider. Returns
 * { goldBdtPerGram, silverBdtPerGram } on success, or null when the provider
 * is not configured, unreachable, timed out, or returned invalid data.
 * Never throws; never logs secrets.
 */
const fetchLiveMetals = async () => {
  const baseUrl = (process.env.METALS_API_BASE_URL || "").trim();
  const apiKey = (process.env.METALS_API_KEY || "").trim();
  if (!baseUrl || !apiKey) return null;

  let data;
  try {
    data = await fetchJsonWithTimeout(baseUrl, { "x-api-key": apiKey });
  } catch (error) {
    console.error("Live metals provider failed:", error?.message || error);
    return null;
  }

  // Shape 1: direct BDT-per-gram values.
  let gold = pickPositive(data, [["goldBdtPerGram"], ["gold_bdt_per_gram"]]);
  let silver = pickPositive(data, [["silverBdtPerGram"], ["silver_bdt_per_gram"]]);
  if (gold && silver) return { goldBdtPerGram: gold, silverBdtPerGram: silver };

  // Shape 2: nested rates map.
  gold = pickPositive(data, [["rates", "XAU_BDT"], ["data", "XAU_BDT"]]);
  silver = pickPositive(data, [["rates", "XAG_BDT"], ["data", "XAG_BDT"]]);
  if (gold && silver) return { goldBdtPerGram: gold, silverBdtPerGram: silver };

  // Shape 3: USD per troy ounce + USD/BDT rate.
  const goldOz = pickPositive(data, [["gold_usd_per_oz"], ["gold", "usd_per_oz"]]);
  const silverOz = pickPositive(data, [["silver_usd_per_oz"], ["silver", "usd_per_oz"]]);
  const usdBdt = pickPositive(data, [["usd_bdt"], ["USD_BDT"], ["rates", "USD_BDT"]]);
  if (goldOz && silverOz && usdBdt) {
    return {
      goldBdtPerGram: (goldOz / TROY_OZ_TO_GRAMS) * usdBdt,
      silverBdtPerGram: (silverOz / TROY_OZ_TO_GRAMS) * usdBdt,
    };
  }

  console.error("Live metals provider returned an unrecognized payload.");
  return null;
};

/**
 * Gold + silver price per gram in BDT.
 * Live data when available, otherwise the clearly-labeled reference values.
 * Never throws.
 */
export const getMetalPrices = async () => {
  const cached = cacheGet("metals");
  if (cached) return cached;

  const live = await fetchLiveMetals();
  const result = live
    ? {
        goldBdtPerGram: live.goldBdtPerGram,
        silverBdtPerGram: live.silverBdtPerGram,
        source: (process.env.METALS_API_BASE_URL || "live-metals-provider").trim(),
        isLive: true,
        fetchedAt: new Date().toISOString(),
      }
    : {
        goldBdtPerGram: REFERENCE_GOLD_BDT_PER_GRAM,
        silverBdtPerGram: REFERENCE_SILVER_BDT_PER_GRAM,
        source: REFERENCE_METALS_SOURCE,
        isLive: false,
        referenceDate: REFERENCE_MARKET_DATE,
      };

  cacheSet("metals", result);
  return result;
};

/**
 * Fetch a live BDT-per-unit rate for `currency` from a Frankfurter-compatible
 * endpoint. Returns the rate or null (not configured / failed / invalid).
 * Never throws; never logs secrets.
 */
const fetchLiveFxRate = async (baseUrl, apiKey, currency) => {
  if (!baseUrl) return null;
  const url = `${baseUrl.replace(/\/+$/, "")}/latest?base=${encodeURIComponent(
    currency
  )}&symbols=BDT`;
  const headers = apiKey ? { "x-api-key": apiKey } : {};
  // Some generic providers expect the key as a query param instead.
  const keyedUrl = apiKey ? `${url}&apikey=${encodeURIComponent(apiKey)}` : url;

  for (const candidate of apiKey ? [url, keyedUrl] : [url]) {
    try {
      const data = await fetchJsonWithTimeout(candidate, headers);
      const rate = Number(data?.rates?.BDT);
      if (isPositiveNumber(rate)) return rate;
    } catch (error) {
      console.error(
        `Live FX provider failed for ${currency}:`,
        error?.message || error
      );
    }
  }
  return null;
};

/**
 * Convert a foreign amount to BDT.
 * Always resolves (live rate preferred, reference fallback); result carries
 * full transparency metadata. Only throws for unsupported currency codes.
 */
export const convertToBdt = async (amount, currency) => {
  const code = String(currency || "").trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(code)) {
    throw new Error(`Unsupported currency: ${code || "(empty)"}`);
  }

  const inputAmount = Number(amount);
  if (code === "BDT") {
    return {
      inputCurrency: "BDT",
      inputAmount,
      rateToBdt: 1,
      convertedBdt: inputAmount,
      source: "base_currency",
      isLive: true,
      rateDate: new Date().toISOString().slice(0, 10),
    };
  }

  const cacheKey = `fx:${code}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { ...cached, inputCurrency: code, inputAmount, convertedBdt: inputAmount * cached.rateToBdt };
  }

  const primaryBase = (process.env.FX_API_BASE_URL || "").trim();
  let rate = await fetchLiveFxRate(primaryBase, "", code);
  let source = primaryBase || "live-fx-provider";
  let isLive = rate !== null;

  if (rate === null) {
    const fallbackBase = (process.env.FX_FALLBACK_API_BASE_URL || "").trim();
    const fallbackKey = (process.env.FX_FALLBACK_API_KEY || "").trim();
    rate = await fetchLiveFxRate(fallbackBase, fallbackKey, code);
    source = fallbackBase || source;
    isLive = rate !== null;
  }

  let rateDate;
  if (rate === null) {
    rate = REFERENCE_FX_TO_BDT[code];
    source = REFERENCE_FX_SOURCE;
    isLive = false;
    rateDate = REFERENCE_MARKET_DATE;
  } else {
    rateDate = new Date().toISOString().slice(0, 10);
  }

  const result = { rateToBdt: rate, source, isLive, rateDate };
  cacheSet(cacheKey, result);
  return { ...result, inputCurrency: code, inputAmount, convertedBdt: inputAmount * rate };
};
