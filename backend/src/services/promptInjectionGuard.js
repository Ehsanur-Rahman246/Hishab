// Prompt-injection guard for the Hishab AI coach (offline, deterministic).
//
// THREAT MODEL (documented for judges, mirrored in README + report):
//   - Attacker = any authenticated user typing into the chat box. The message
//     is UNTRUSTED DATA, never instructions. It travels inside a single user
//     turn labelled "User message (untrusted text...)"; the system instruction
//     separately orders the model to ignore embedded instructions.
//   - Attack goals: (1) override system rules ("ignore previous rules");
//     (2) exfiltrate hidden prompt / API keys / provider context / another
//     user's data; (3) fabricate balances, transactions, forecasts, goals;
//     (4) smuggle instructions inside otherwise-benign text.
//   - Controls: strict system instruction, untrusted-data labelling in
//     buildCoachPrompt, JSON-schema validation, numerical-grounding guard,
//     server-side JWT scoping (one user never sees another's rows), and this
//     heuristic detector used by tests + safe-refusal path. The LLM can never
//     invoke financial actions directly (deterministic backend services only).
//   - Test command: `npm test -- coachPromptInjection.test.js` (backend).
//
// This module never calls the network and never logs secrets.

const PATTERNS = [
  { id: "override", re: /ignore\s+(all\s+)?(previous|prior|above|earlier).*?(rules|instructions|prompts|policies)|forget\s+(your|all|previous).*?(rules|instructions)/i },
  { id: "override_bn", re: /আগের\s*(নিয়ম|নির্দেশ).*?(ভুলে|উপেক্ষা)|সব\s*নিয়ম\s*(ভুলে|বাদ)/ },
  { id: "reveal_prompt", re: /reveal|disclose|show|print|repeat|output/i, need: /system\s*prompt|hidden\s*(prompt|context|instructions)|initial\s*instructions/ },
  { id: "reveal_prompt_bn", re: /(সিস্টেম|গোপন).*?(প্রম্পট|নির্দেশ)/ },
  { id: "reveal_keys", re: /api[_\s-]?key|secret|password|pin\b|jwt|token|groq/i },
  { id: "other_user", re: /another\s+user|other\s+(user'?s|customer|account)|someone\s+else'?s|different\s+phone/i },
  { id: "fabricate", re: /pretend|fabricate|make\s+up|invent|lie\s+about|say\s+my\s+balance\s+is|claim\s+i\s+have/i },
  { id: "fabricate_bn", re: /বানিয়ে|মিথ্যা\s*ব্যালেন্স|ভুল\s*তথ্য\s*দাও/ },
  { id: "embedded_instruction", re: /\[system\]|\[assistant\]|###\s*system|<<sys>>|<\|system\|>/i },
  { id: "jailbreak", re: /jailbreak|dan\s+mode|developer\s+mode|do\s+anything\s+now|unrestricted/i },
];

export const detectPromptInjection = (message = "") => {
  const text = String(message ?? "");
  const hits = [];
  for (const p of PATTERNS) {
    if (p.need) {
      if (p.re.test(text) && p.need.test(text)) hits.push(p.id);
    } else if (p.re.test(text)) {
      hits.push(p.id);
    }
  }
  // "Ignore previous rules" in Banglish without diacritics.
  if (/ignore/i.test(text) && /previous|ager|ag er/i.test(text) && /rule|niom|nirdesh/i.test(text)) {
    if (!hits.includes("override")) hits.push("override");
  }
  return { flagged: hits.length > 0, reasons: hits };
};

export const isPromptInjectionAttempt = (message = "") =>
  detectPromptInjection(message).flagged;

// Safe refusal (no secrets, no financial facts, no prompt echo).
export const injectionRefusalReply = (language = "auto") => {
  if (language === "bn") {
    return "আমি সিস্টেম নির্দেশ বা গোপন তথ্য দেখাতে পারি না, আর অনুমান করে ব্যালেন্স বা লেনদেন বলি না। আপনার নিজের সেভ করা তথ্যের ভিত্তিতে কী জানতে চান লিখুন।";
  }
  if (language === "en") {
    return "I can't reveal system instructions or private data, and I won't guess balances or transactions. Tell me what you'd like to know from your own saved data.";
  }
  return "Ami system instruction ba private data dekhate parbo na, ar andaje balance/transaction bolbo na. Apnar nijer saved data theke ki jante chan likhun. / I can't reveal hidden instructions or private data, and I won't invent financial facts.";
};

// Secret-leak check for tests: a reply must never contain prompt fragments,
// key-like material, or another user's data markers.
const LEAK_PATTERNS = [
  /you are "hishab ai coach"/i,
  /groq/i,
  /sk-[a-z0-9]{8,}/i,
  /gsk_[a-z0-9]+/i,
  /bearer\s+[a-z0-9._-]+/i,
  /01[3-9]\d{8}/,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/,
];

export const replyLeaksSecrets = (replyText = "") => {
  const text = String(replyText ?? "");
  return LEAK_PATTERNS.some((re) => re.test(text));
};
