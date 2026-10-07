import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const toggleSrc = read("src/components/dashboard/BalancePrivacyToggle.jsx");
const layoutSrc = read("src/components/AppLayout.jsx");

describe("balance privacy toggle", () => {
  it("1. balance is hidden initially", () => {
    assert.ok(toggleSrc.includes("useState(false)"), "visibility state must default to hidden");
    assert.ok(toggleSrc.includes("Balance hidden"), "must show 'Balance hidden' text");
    assert.ok(toggleSrc.includes("Tap to view balance"), "must show a 'Tap to view balance' button");
    assert.ok(toggleSrc.includes('aria-label={revealed ? "Hide balance" : "View balance"}'), "button must expose an accessible label");
  });

  it("2. clicking reveals the actual formatted balance", () => {
    assert.ok(toggleSrc.includes("useWallet"), "must use the existing wallet data hook");
    assert.ok(toggleSrc.includes("data?.wallet?.balance"), "must read the authenticated user's own wallet balance");
    assert.ok(toggleSrc.includes("formatBDT(balance)"), "must format the revealed balance with the shared BDT formatter");
    assert.ok(toggleSrc.includes("setRevealed"), "tap must flip the visibility state");
    assert.ok(toggleSrc.includes("<EyeOff"), "revealed state must switch the icon to EyeOff");
    assert.ok(toggleSrc.includes('"Hide balance"'), "accessible label must change to 'Hide balance'");
  });

  it("3. clicking again hides it", () => {
    assert.ok(toggleSrc.includes("setRevealed((v) => !v)"), "tap must toggle (re-hide on second tap)");
    assert.ok(toggleSrc.includes("<Eye"), "hidden state must show the Eye icon");
    assert.ok(toggleSrc.includes("aria-pressed={revealed}"), "toggle state must be exposed to assistive tech");
  });

  it("4. wallet balance is never shown before explicit user action", () => {
    // The only place the balance value is rendered must sit behind the revealed guard.
    const formatIdx = toggleSrc.indexOf("formatBDT(balance)");
    assert.ok(formatIdx !== -1, "formatted balance must be rendered");
    const guardIdx = toggleSrc.lastIndexOf("revealed ?", formatIdx);
    assert.ok(guardIdx !== -1 && guardIdx < formatIdx, "balance must render only when revealed is true");
    assert.ok(!/localStorage\s*\.\s*(get|set|remove)Item/.test(toggleSrc), "revealed state must not persist to localStorage");
    assert.ok(!toggleSrc.includes("useMutation") && !toggleSrc.includes("api.post"), "must never write balance state to the backend");
    assert.ok(!toggleSrc.includes("walletApi") && !toggleSrc.includes("api/"), "must reuse the existing wallet hook, not a new endpoint");
  });

  it("5. loading and error states are safe", () => {
    assert.ok(toggleSrc.includes("isPending") && toggleSrc.includes("Skeleton"), "loading must show a skeleton");
    assert.ok(toggleSrc.includes('aria-label="Loading balance"'), "loading state must be announced");
    assert.ok(toggleSrc.includes("isError") && toggleSrc.includes("Balance unavailable"), "failure must show a safe 'Balance unavailable' state");
    // The failure branch must not render any balance value.
    const unavailableIdx = toggleSrc.indexOf("Balance unavailable");
    const errorBranchStart = toggleSrc.lastIndexOf("if (isError", unavailableIdx);
    const errorBranch = toggleSrc.slice(errorBranchStart, unavailableIdx + 100);
    assert.ok(!errorBranch.includes("formatBDT"), "error state must not render a stale or guessed value");
  });

  it("6. header placement, tooltip, and theming", () => {
    assert.ok(layoutSrc.includes("BalancePrivacyToggle"), "Dashboard header must render the control");
    assert.ok(layoutSrc.includes("{onDashboard ? <BalancePrivacyToggle /> : null}"), "control must sit with the dashboard header actions");
    assert.ok(toggleSrc.includes("Your balance is hidden by default for privacy."), "must include the privacy tooltip text");
    assert.ok(toggleSrc.includes('role="tooltip"'), "tooltip must use the tooltip role");
    assert.ok(toggleSrc.includes("title={TOOLTIP_TEXT}"), "button must carry a native tooltip for hover/focus");
    assert.ok(!/bg-\[#[0-9a-fA-F]{3,6}\]/.test(toggleSrc), "must use theme tokens (no hardcoded colors) for light/dark mode");
    assert.ok(toggleSrc.includes("focus-visible:"), "must keep a visible keyboard focus state");
    assert.ok(toggleSrc.includes('type="button"'), "must be a real button for keyboard access");
  });
});
