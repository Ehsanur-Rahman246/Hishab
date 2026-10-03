import {
  SUPPORTED_CURRENCIES,
  convertToBdt,
  getMetalPrices,
} from "../services/marketDataService.js";
import {
  NISAB_BASES,
  ZAKAT_DISCLAIMER,
  ZAKAT_RATE,
  ZAKAT_YEAR_TYPES,
  calculateZakat,
  validateZakatInput,
} from "../services/zakatService.js";

// POST /api/zakat/calculate (protected)
// Stateless, deterministic Zakat estimate. Nothing is written to MongoDB,
// nothing is logged except error status, and values live only in this
// request/response cycle. The user is identified via req.user.userId solely
// for authentication — no user ID is ever accepted from the request body.
export const calculateZakatEstimate = async (req, res) => {
  try {
    const checked = validateZakatInput(req.body);
    if (!checked.ok) {
      return res.status(400).json({
        success: false,
        message: checked.errors[0] || "Invalid request.",
        errors: checked.errors,
      });
    }
    const v = checked.value;

    // Currency allow-list check (BDT + supported ISO codes). This runs
    // before any market-data call so typos fail fast with a clear message.
    const usedCurrencies = new Set([
      v.businessCurrency,
      ...v.foreignAssets.map((a) => a.currency),
    ]);
    for (const code of usedCurrencies) {
      if (!SUPPORTED_CURRENCIES.includes(code)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported currency: ${code}. Supported: ${SUPPORTED_CURRENCIES.join(", ")}.`,
        });
      }
    }

    // Market data: live when configured and valid, otherwise clearly-labeled
    // reference values. Frontend must render source/isLive honestly.
    const marketData = await getMetalPrices();

    // Convert business + foreign amounts to BDT. Each conversion carries its
    // own transparency metadata (rate, source, date, live/reference flag).
    const foreignConversions = [];
    let businessValueBdt = 0;
    try {
      if (req.body?.businessAmount !== undefined && req.body?.businessAmount !== null) {
        const c = await convertToBdt(v.businessAmount, v.businessCurrency);
        businessValueBdt = c.convertedBdt;
        foreignConversions.push({
          inputCurrency: c.inputCurrency,
          inputAmount: c.inputAmount,
          rateToBdt: c.rateToBdt,
          convertedBdt: c.convertedBdt,
          source: c.source,
          isLive: c.isLive,
          rateDate: c.rateDate,
        });
      }
      let foreignAssetsBdt = 0;
      for (const asset of v.foreignAssets) {
        const c = await convertToBdt(asset.amount, asset.currency);
        foreignAssetsBdt += c.convertedBdt;
        foreignConversions.push({
          inputCurrency: c.inputCurrency,
          inputAmount: c.inputAmount,
          rateToBdt: c.rateToBdt,
          convertedBdt: c.convertedBdt,
          source: c.source,
          isLive: c.isLive,
          rateDate: c.rateDate,
        });
      }

      const grossPreview =
        v.cashBdt +
        v.goldGrams * marketData.goldBdtPerGram +
        v.silverGrams * marketData.silverBdtPerGram +
        businessValueBdt +
        foreignAssetsBdt;
      if (v.interestAmountToExcludeBdt > grossPreview) {
        return res.status(400).json({
          success: false,
          message: "Interest to exclude cannot exceed total assets.",
        });
      }

      const result = calculateZakat(
        {
          zakatYearType: v.zakatYearType,
          yearCompleted: v.yearCompleted,
          nisabBasis: v.nisabBasis,
          cashBdt: v.cashBdt,
          goldGrams: v.goldGrams,
          silverGrams: v.silverGrams,
          businessBdt: businessValueBdt,
          foreignAssetsBdt,
          deductibleLiabilitiesBdt: v.deductibleLiabilitiesBdt,
          interestAmountToExcludeBdt: v.interestAmountToExcludeBdt,
        },
        {
          goldBdtPerGram: marketData.goldBdtPerGram,
          silverBdtPerGram: marketData.silverBdtPerGram,
        }
      );

      return res.status(200).json({
        success: true,
        calculation: {
          currency: "BDT",
          zakatYearType: v.zakatYearType,
          yearCompleted: v.yearCompleted,
          nisabBasis: v.nisabBasis,
          marketData: {
            goldBdtPerGram: marketData.goldBdtPerGram,
            silverBdtPerGram: marketData.silverBdtPerGram,
            source: marketData.source,
            isLive: marketData.isLive,
            ...(marketData.isLive
              ? { fetchedAt: marketData.fetchedAt }
              : { referenceDate: marketData.referenceDate }),
          },
          foreignConversions,
          breakdown: {
            cashBdt: result.cashBdt,
            goldValueBdt: result.goldValueBdt,
            silverValueBdt: result.silverValueBdt,
            businessValueBdt: result.businessValueBdt,
            foreignAssetsBdt: result.foreignAssetsBdt,
            grossZakatableAssetsBdt: result.grossZakatableAssetsBdt,
            interestExcludedBdt: result.interestExcludedBdt,
            deductibleLiabilitiesBdt: result.deductibleLiabilitiesBdt,
            netZakatableWealthBdt: result.netZakatableWealthBdt,
            selectedNisabBdt: result.selectedNisabBdt,
          },
          eligible: result.eligible,
          zakatRate: ZAKAT_RATE,
          zakatAmountBdt: result.zakatAmountBdt,
          disclaimer: ZAKAT_DISCLAIMER,
        },
      });
    } catch (error) {
      // Currency errors from convertToBdt are user errors, not crashes.
      if (error?.message?.startsWith("Unsupported currency")) {
        return res.status(400).json({ success: false, message: error.message });
      }
      // Never log request amounts — status only.
      console.error("Zakat calculation failed.");
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  } catch (error) {
    console.error("Zakat calculation failed.");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Re-exported so docs/tests reference one place for accepted values.
export const zakatOptions = { ZAKAT_YEAR_TYPES, NISAB_BASES, SUPPORTED_CURRENCIES };
