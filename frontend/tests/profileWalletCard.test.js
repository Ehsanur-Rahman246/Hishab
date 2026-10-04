import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profileSrc = readFileSync(join(root, "src/pages/Profile.jsx"), "utf8");

// The "Wallet card" is the Profile <Row title="Wallet" .../> linking to
// /transactions. Privacy requirement: it shows the wallet number only —
// never the balance amount.
const walletRowStart = profileSrc.indexOf('title="Wallet"');
assert.ok(walletRowStart !== -1, "Profile page must contain a Wallet row");
const walletRowBlock = profileSrc.slice(walletRowStart, walletRowStart + 800);

describe("profile wallet card privacy", () => {
  it("1. does not render the wallet balance", () => {
    assert.ok(!walletRowBlock.includes("wallet.balance"), "Wallet card must not reference wallet.balance");
    assert.ok(!walletRowBlock.includes("formatBDTWhole"), "Wallet card must not format any amount");
    assert.ok(!walletRowBlock.includes("•"), "Wallet card must not show the 'number • amount' pair");
  });

  it("1. still renders the wallet number", () => {
    assert.ok(walletRowBlock.includes("wallet.walletNumber"), "Wallet card must still render wallet.walletNumber");
    assert.ok(walletRowBlock.includes("Wallet not available"), "Wallet card keeps the not-available fallback");
  });

  it("1. balance display survives elsewhere (dialog + hero untouched)", () => {
    // The add/withdraw dialog and the balance hero still need the formatter.
    assert.ok(profileSrc.includes("formatBDTWhole(wallet.balance)"), "Other Profile balance UI must be unchanged");
  });
});
