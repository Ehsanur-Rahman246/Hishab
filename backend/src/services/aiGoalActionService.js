import Goal from "../models/Goal.js";

// ---------------------------------------------------------------------------
// Deterministic, LLM-free goal-delete intent handling for the AI chat.
// The LLM never chooses database IDs: the backend loads only the
// authenticated user's goals and resolves the requested goal server-side.
// ---------------------------------------------------------------------------

const DELETE_KEYWORDS = [
  "delete",
  "deletes",
  "deleting",
  "deleted",
  "remove",
  "cancel",
  "ডিলিট",
  "ডিলেট",
  "মুছে",
  "মুছে ফেল",
  "বাতিল",
];

const CONFIRM_LEADS = [
  "yes",
  "yeah",
  "yep",
  "yup",
  "ok",
  "okay",
  "confirm",
  "confirmed",
  "sure",
  "ha",
  "haa",
  "hyan",
  "হ্যাঁ",
  "হ্যা",
  "হুম",
  "ঠিক আছে",
  "আচ্ছা",
  "করো",
];

const FILLER_PATTERN =
  /delete|deletes|deleting|deleted|remove|removes|cancel|cancels|ডিলিট|ডিলেট|মুছে|ফেলো|ফেলুন|বাতিল|goal|গোল|goals|my|mine|the|this|that|please|amar|amader|tomar|apnar|আমার|আমাদের|তোমার|আপনার|টা|টি|টাকে|টিকে|টার|ta|ti|take|kore|করে|dao|দাও|দিন|দেন|korun|করুন|ektu|একটু|please/gi;

const CONFIRM_PREFIX =
  /^\s*(yes|yeah|yep|yup|ok|okay|confirm(?:ed|ing)?|sure|do it|ha+\b|haa+\b|হ্যাঁ|হ্যা|হুম|ঠিক আছে|আচ্ছা)[\s,।!:.—-]*/i;

export const isGoalDeleteMessage = (message = "") => {
  const lower = String(message || "").toLowerCase();
  if (!lower.trim()) return false;
  if (/ডিলিট|ডিলেট|মুছে|বাতিল/.test(String(message))) return true;
  return /\bdelete[sd]?\b|\bdeleting\b|\bremove\b|\bcancel(?:led|ling)?\b/.test(lower);
};

export const isDeleteConfirmationMessage = (message = "") => {
  const text = String(message || "").trim();
  if (!text) return false;
  if (CONFIRM_PREFIX.test(text)) return true;
  const lower = text.toLowerCase();
  // "yes, delete X" / "haa delete kore dao" style explicit confirmations.
  if (/^(yes|yeah|yep|ok|okay|ha+|হ্যাঁ|হ্যা)\b.*(delete|ডিলিট|মুছে)/i.test(text)) return true;
  if (/(confirm).*(delete|goal)/i.test(lower)) return true;
  return false;
};

// Strip delete/filler words to get the title hint, e.g.
// "Delete my iPhone goal" -> "iphone"; "আমার iPhone goal টা delete করে দাও" -> "iphone".
export const extractGoalTitleHint = (message = "") => {
  let hint = String(message || "");
  hint = hint.replace(CONFIRM_PREFIX, " ");
  hint = hint.replace(FILLER_PATTERN, " ");
  hint = hint.replace(/[?"'`.,!।:;()[\]{}।\-_\/\\|@#$%^&*+=~<>।]/g, " ");
  hint = hint.replace(/\s+/g, " ").trim();
  return hint;
};

const norm = (s) => String(s || "").trim().toLowerCase();

export const resolveGoalFromHint = (goals = [], hint = "") => {
  const h = norm(hint);
  if (!h) return { kind: "empty", matches: [] };
  // Exact unique title match (case-insensitive).
  const exact = goals.filter((g) => norm(g.title) === h);
  if (exact.length === 1) return { kind: "single", goal: exact[0], matches: exact };
  if (exact.length > 1) return { kind: "ambiguous", matches: exact };
  // Substring match either direction: "iphone goal" <-> "iphone".
  const sub = goals.filter((g) => {
    const t = norm(g.title);
    return t.includes(h) || (h.length >= 2 && h.includes(t));
  });
  if (sub.length === 1) return { kind: "single", goal: sub[0], matches: sub };
  if (sub.length > 1) return { kind: "ambiguous", matches: sub };
  return { kind: "none", matches: [] };
};

export const fetchUserGoalsForChat = async (userId) =>
  Goal.find({ user: userId })
    .select("title targetAmount savedAmount targetDate status")
    .sort({ createdAt: -1 })
    .lean();

const hasBangla = (s) => /[\u0980-\u09FF]/.test(String(s || ""));

export const confirmPromptReply = (goal, language = "auto") => {
  const bn = language === "bn" || (language === "auto" && hasBangla(goal?.title || ""));
  const amount = Number(goal?.savedAmount) || 0;
  if (bn || language === "auto") {
    return `“${goal.title}” goal-এ ৳${amount.toLocaleString("en-BD")} জমা আছে। ডিলিট করলে এই টাকা আপনার wallet-এ ফেরত যাবে। নিশ্চিত করতে লিখুন: Yes, delete ${goal.title} — Are you sure? / আপনি কি নিশ্চিত?`;
  }
  return `Your “${goal.title}” goal has ৳${amount.toLocaleString("en-BD")} saved. Deleting it will return this amount to your wallet. To confirm, reply: Yes, delete ${goal.title}`;
};

export const ambiguousReply = (matches, language = "auto") => {
  const list = matches
    .slice(0, 5)
    .map((g) => `• “${g.title}” — ৳${(Number(g.savedAmount) || 0).toLocaleString("en-BD")} saved`)
    .join("\n");
  if (language === "bn") {
    return `একাধিক goal মিলে গেছে। কোনটি ডিলিট করতে চান, নামটি নির্দিষ্ট করে লিখুন:\n${list}`;
  }
  return `I found more than one matching goal. Please choose exactly which one to delete:\n${list}\nReply with the exact title, e.g. “Yes, delete <title>”. I won't delete anything until you confirm.`;
};

export const notFoundReply = (hint, language = "auto") => {
  if (language === "bn") {
    return hint
      ? `“${hint}” নামে কোনো goal পাওয়া যায়নি। Goals পেজে নামটি দেখে আবার লিখুন।`
      : "কোনো goal-এর নাম বুঝতে পারিনি। Goals পেজের exact নামটি লিখে আবার চেষ্টা করুন।";
  }
  return hint
    ? `I couldn't find any goal matching “${hint}”. Check the exact title on the Goals page and try again.`
    : "I couldn't tell which goal you mean. Please write the exact goal title from the Goals page.";
};

export const deletedReply = (title, refundedAmount, language = "auto") => {
  const amt = `৳${(Number(refundedAmount) || 0).toLocaleString("en-BD")}`;
  const bn = language === "bn" || language === "auto";
  if (bn) {
    return `“${title}” goal ডিলিট করা হয়েছে। ${amt} BDT আপনার wallet-এ ফেরত দেওয়া হয়েছে। / Goal “${title}” deleted — ${amt} BDT refunded to your wallet.`;
  }
  return `Goal “${title}” deleted — ${amt} BDT refunded to your wallet.`;
};

// ---------------------------------------------------------------------------
// Add-money intent (Wallet -> Goal via chat). Deterministic and LLM-free:
// the parser only extracts { amount, conditionThreshold, goalHint } from the
// raw text. All authorization, wallet/goal lookups, condition checks and money
// movement happen server-side in the controller through the shared
// executeManualContribution service.
// ---------------------------------------------------------------------------

const ADD_VERBS = /\badd\b|\bdeposit\b|\bcontribute\b|transfer to|জমা|যোগ কর|save to/i;
const BN_DIGITS = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };

const toLatinDigits = (s) => String(s || "").replace(/[০-৯]/g, (d) => BN_DIGITS[d]);

// A wallet-balance condition exists when the message ties an amount to the
// wallet having "more than" it, e.g. "wallet এ 500 টাকার বেশি থাকলে" or
// "if my wallet balance is more than 500".
const CONDITION_PATTERN =
  /(বেশি\s*(থাকলে|হলে|আছে|হয়)|more\s+than|greater\s+than|over\s+৳?[\d,]+|above\s+৳?[\d,]+|exceed)/i;

export const hasWalletBalanceCondition = (message = "") => {
  const text = String(message || "");
  if (!CONDITION_PATTERN.test(text)) return false;
  return /wallet|ব্যালেন্স|balance/i.test(text);
};

const extractNumbers = (message = "") => {
  const latin = toLatinDigits(String(message || "")).replace(/,/g, "");
  const found = latin.match(/\d+(?:\.\d+)?/g) || [];
  return found.map(Number).filter((n) => Number.isFinite(n) && n > 0);
};

// Parse an add-money command. Returns null when the message is not an
// add-money command, otherwise { amount, conditionThreshold, goalHint }.
// amount is null when no usable amount was found (caller asks for it).
// conditionThreshold is null when no wallet-balance condition was given.
export const parseGoalAddMoneyIntent = (message = "") => {
  const text = String(message || "");
  if (!text.trim()) return null;
  // Never hijack delete intents or plain coaching questions.
  if (isGoalDeleteMessage(text)) return null;
  if (!ADD_VERBS.test(text)) return null;
  // A goal-ish or money-ish noun must be present to avoid matching generic
  // coaching questions such as "How much can I save next month?".
  if (!/goal|গোল|taka|টাকা|bdt|৳|wallet|fund/i.test(text)) return null;

  const numbers = extractNumbers(text);
  if (numbers.length === 0) return { amount: null, conditionThreshold: null, goalHint: "" };

  const conditioned = hasWalletBalanceCondition(text);
  let amount;
  let conditionThreshold = null;
  if (conditioned) {
    // "wallet এ 500 টাকার বেশি থাকলে ... 500 টাকা add": first number is the
    // threshold, last number is the contribution. A single number means the
    // threshold is known but the contribution amount is not.
    conditionThreshold = numbers[0];
    amount = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
  } else {
    amount = numbers[numbers.length - 1];
  }

  // Drop the condition clause (it holds the threshold, not the goal name).
  let work = text;
  if (conditioned) {
    const parts = work.split(/থাকলে|হলে|,/);
    if (parts.length > 1) work = parts.slice(1).join(" ");
  }
  work = toLatinDigits(work);
  // Latin tokens use word boundaries so short fragments (ta/ti/to) never eat
  // letters inside real words (e.g. "taka" or "iPhone"). Bengali particles
  // are stripped separately.
  work = work.replace(
    /\b(add|adds|added|adding|deposit|deposits|contribute|contributes|transfer|to|my|mine|the|this|that|please|into|in|on|onto|for|towards|if|when|than|more|greater|over|above|exceed|only|taka|takas|bdt|wallet|balance|balances|fund|funds|goal|goals|amar|amader|tomar|apnar|ta|ti|take|kore|dao|korun|ektu)\b/gi,
    " "
  );
  work = work.replace(
    /জমা|যোগ|করে|করো|করুন|দাও|দিন|দেন|গোল|আমার|আমাদের|তোমার|আপনার|টাকার|টাকা|টা|টি|টাকে|টিকে|টার|ব্যালেন্স|বেশি|থাকলে|হলে|আছে|হয়|এর|থেকে|শুধু| এ /g,
    " "
  );
  work = work.replace(/[?"'`.,!।:;()[\]{}।\-_\/\\|@#$%^&*+=~<>।]/g, " ");
  work = work.replace(/\d+(?:\.\d+)?/g, " ");
  const goalHint = work.replace(/\s+/g, " ").trim();

  return { amount, conditionThreshold, goalHint };
};

export const isGoalAddMoneyMessage = (message = "") => parseGoalAddMoneyIntent(message) !== null;

const fmtBDT = (n) => `৳${(Number(n) || 0).toLocaleString("en-BD")}`;

export const addedReply = (title, amount, language = "auto") => {
  const amt = fmtBDT(amount);
  if (language === "bn" || language === "auto") {
    return `“${title}” goal-এ ${amt} যোগ করা হয়েছে। Wallet থেকে ${amt} কাটা হয়েছে। / ${amt} added to your “${title}” goal from your wallet.`;
  }
  return `${amt} added to your “${title}” goal from your wallet. Wallet deducted by ${amt}.`;
};

export const addMoneyConditionFailedReply = (threshold, balance, language = "auto") => {
  const t = fmtBDT(threshold);
  const b = fmtBDT(balance);
  if (language === "bn" || language === "auto") {
    return `টাকা যোগ করা হয়নি। শর্ত ছিল wallet ব্যালেন্স ${t}-এর বেশি থাকতে হবে, কিন্তু বর্তমান ব্যালেন্স ${b}। / Not added: your wallet balance (${b}) must be more than ${t} for this command.`;
  }
  return `Not added: this command needs your wallet balance to be more than ${t}, but it is currently ${b}. No money was moved.`;
};

export const addMoneyInactiveGoalReply = (goal, language = "auto") => {
  if (language === "bn" || language === "auto") {
    return `“${goal.title}” goal-এ টাকা যোগ করা যাবে না (status: ${goal.status})। শুধুমাত্র active goal-এ টাকা যোগ করা যায়। / Cannot add money to “${goal.title}” because it is ${goal.status}. Only active goals can receive money.`;
  }
  return `Cannot add money to “${goal.title}” because it is ${goal.status}. Only active goals can receive money.`;
};

export const addMoneyNeedAmountReply = (goalTitle, language = "auto") => {
  if (language === "bn" || language === "auto") {
    return goalTitle
      ? `“${goalTitle}” goal-এ কত টাকা যোগ করব? Amount লিখুন, যেমন: “Add 500 taka to my ${goalTitle} goal”। / How much should I add to “${goalTitle}”? Please write the amount.`
      : "কত টাকা যোগ করব বুঝতে পারিনি। Amount লিখুন, যেমন: “Add 500 taka to my iPhone goal”। / I couldn't tell the amount. Please write it, e.g. “Add 500 taka to my iPhone goal”.";
  }
  return goalTitle
    ? `How much should I add to “${goalTitle}”? Please write the amount, e.g. “Add 500 taka to my ${goalTitle} goal”.`
    : "I couldn't tell the amount. Please write it, e.g. “Add 500 taka to my iPhone goal”.";
};

export const addMoneyAmbiguousReply = (matches, amount, language = "auto") => {
  const list = matches
    .slice(0, 5)
    .map((g) => `• “${g.title}” — ${fmtBDT(g.savedAmount)} saved (${g.status})`)
    .join("\n");
  const amt = amount ? ` ${fmtBDT(amount)}` : "";
  if (language === "bn") {
    return `একাধিক goal মিলে গেছে।${amt} কোনটিতে যোগ করব, বেছে নিন:\n${list}\nকোনো টাকা সরানো হয়নি।`;
  }
  return `I found more than one matching goal. Which one should receive${amt}?\n${list}\nNo money was moved. Please choose exactly one goal.`;
};

export const addMoneyNotFoundReply = (hint, language = "auto") => {
  if (language === "bn") {
    return hint
      ? `“${hint}” নামে কোনো goal পাওয়া যায়নি। Goals পেজে নামটি দেখে আবার লিখুন। কোনো টাকা সরানো হয়নি।`
      : "কোন goal-এ টাকা যোগ করব বুঝতে পারিনি। Goals পেজের exact নামটি লিখুন।";
  }
  return hint
    ? `I couldn't find any goal matching “${hint}”. Check the exact title on the Goals page and try again. No money was moved.`
    : "I couldn't tell which goal should receive the money. Please write the exact goal title from the Goals page.";
};

export const addMoneyFailedReply = (reason, language = "auto") => {
  if (language === "bn" || language === "auto") {
    return `টাকা যোগ করা যায়নি: ${reason} কোনো টাকা সরানো হয়নি। / Could not add money: ${reason} No money was moved.`;
  }
  return `Could not add money: ${reason} No money was moved.`;
};
