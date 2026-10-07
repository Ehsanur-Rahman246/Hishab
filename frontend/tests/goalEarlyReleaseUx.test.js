import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("goal early-release UX", () => {
  it("1. add-money success shows the early-release message with the returned amount", () => {
    const src = read("src/pages/Goals.jsx");
    assert.ok(src.includes("Goal completed early"), "must show the early-completion toast");
    assert.ok(src.includes("has been returned to your wallet"), "must state funds returned to wallet");
    assert.ok(src.includes("res?.released"), "must branch on the released response flag");
    assert.ok(src.includes("releasedAmount"), "must use the released amount from the response");
  });

  it("2. released goals read as Completed & released, never as locked savings", () => {
    const src = read("src/pages/Goals.jsx");
    assert.ok(src.includes("Completed & released"), "final state must read Completed & released");
    assert.ok(src.includes("Funds returned to wallet"), "released card must confirm funds returned");
    assert.ok(src.includes("returned to wallet"), "released card must show the returned amount line");
  });

  it("3. add-savings refreshes goals, wallet, transactions, alerts, and summaries", () => {
    const src = read("src/hooks/useGoals.js");
    const hook = src.slice(src.indexOf("useAddSavings"));
    for (const key of ["goals", "wallet", "transactions", "alerts", "summaries"]) {
      assert.ok(hook.includes(`"${key}"`), `useAddSavings must invalidate ${key}`);
    }
  });
});
