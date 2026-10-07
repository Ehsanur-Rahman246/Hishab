// DEMO DATA ONLY. Same seed -> same transactions -> same forecast path.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const generateDemoTransactions = ({ seed = 42, weeks = 8, endMonday = "2026-10-05" } = {}) => {
  const rnd = mulberry32(seed);
  const end = new Date(`${endMonday}T00:00:00Z`).getTime();
  const rows = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = end - w * 7 * 86400000;
    const at = (d) => new Date(monday + d * 86400000 + 10 * 3600000).toISOString();
    rows.push({ type: "income", category: "Other", amount: 20000, date: at(0), description: "Demo salary" });
    rows.push({ type: "expense", category: "Food", amount: Math.round(2500 + rnd() * 800), date: at(1), description: "Demo groceries" });
    rows.push({ type: "expense", category: "Transport", amount: Math.round(600 + rnd() * 200), date: at(2), description: "Demo transport" });
  }
  return rows;
};
// Expected: weeks >= 4 -> modelUsed "linear_regression"; weeks < 4 -> "historical_average_fallback".