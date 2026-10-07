import { test, expect } from "@playwright/test";
import process from "node:process";
import { randomUUID } from "node:crypto";

const API = "http://localhost:5001";
const { DEMO_PHONE, DEMO_PIN, DEMO_GOAL_TITLE } = process.env;

if (!DEMO_PHONE || !DEMO_PIN || !DEMO_GOAL_TITLE) {
  throw new Error(
    "Set DEMO_PHONE, DEMO_PIN, and DEMO_GOAL_TITLE before running Playwright.",
  );
}

// Parses displayed amounts such as "৳30,500".
const num = (value) => Number(value.replace(/[^\d.-]/g, ""));

async function readJson(response, label) {
  if (!response.ok()) {
    throw new Error(
      `${label} failed (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json();
}

test("sign in, forecast, chat, and contribute once", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-phone").fill(DEMO_PHONE);
  await page.locator("#login-pin").fill(DEMO_PIN);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
    { timeout: 5000 },
  );

  await page.getByRole("button", { name: "Log in" }).click();

  const loginResponse = await loginResponsePromise.catch(() => null);

  if (!loginResponse) {
    const formErrors = await page.getByRole("alert").allTextContents();
    throw new Error(
      `Login request was not sent. Check phone/PIN format. Form feedback: ${
        formErrors.join(" | ") || "(none)"
      }`,
    );
  }

  if (!loginResponse.ok()) {
    const body = await loginResponse.json().catch(() => ({}));
    throw new Error(
      `Login failed (${loginResponse.status()}): ${
        body.message || "No error message returned"
      }`,
    );
  }

  await expect(page).toHaveURL(/dashboard/);

  // Read a stable starting point after authentication. The API request shares
  // the browser context's cookies, so it uses the same logged-in session.
  const walletResponse = await page.request.get(`${API}/api/wallet`);
  const { wallet } = await readJson(walletResponse, "Read starting wallet");

  const goalsResponse = await page.request.get(`${API}/api/goals`);
  const { goals } = await readJson(goalsResponse, "Read goals");
  const goal = goals.find((item) => item.title === DEMO_GOAL_TITLE);

  expect(goal, `Could not find goal "${DEMO_GOAL_TITLE}"`).toBeTruthy();

  const walletBefore = Number(wallet.balance);
  const savedBefore = Number(goal.savedAmount);
  const remainingBefore = Number(goal.targetAmount) - savedBefore;

  expect(walletBefore).toBeGreaterThanOrEqual(750);
  expect(remainingBefore).toBeGreaterThanOrEqual(750);

  // Forecast workflow.
  await page.goto("/forecast");
  await expect(page.getByTestId("forecast-week").first()).toBeVisible();

  // Coach workflow.
  await page.goto("/ai-assistant");
  await page.getByLabel(/your question/i).fill("Where am I spending the most?");
  await page.getByRole("button", { name: /send question/i }).click();
  await expect(page.getByTestId("coach-reply").last()).not.toBeEmpty({
    timeout: 45_000,
  });

  // Manual contribution through the UI.
  await page.goto("/goals");
  const card = page.locator("article", { hasText: DEMO_GOAL_TITLE });

  await card.getByRole("button", { name: "Add money" }).click();
  await page.locator("#savings-amount").fill("500");
  await page.getByRole("dialog").getByRole("button", { name: "Add money" }).click();

  await expect
    .poll(async () => num(await page.getByTestId("wallet-balance").innerText()))
    .toBe(walletBefore - 500);

  await expect
    .poll(async () => num(await card.getByTestId("goal-saved").innerText()))
    .toBe(savedBefore + 500);

  // Retry one API contribution using the same idempotency key.
  const body = { amount: 250, idempotencyKey: randomUUID() };

  const firstResponse = await page.request.post(
    `${API}/api/goals/${goal._id}/add-savings`,
    { data: body },
  );
  const first = await readJson(firstResponse, "First contribution request");

  const retryResponse = await page.request.post(
    `${API}/api/goals/${goal._id}/add-savings`,
    { data: body },
  );
  const retry = await readJson(retryResponse, "Contribution retry");

  expect(first.duplicate).toBeUndefined();
  expect(retry.duplicate).toBe(true);

  // Verify final API state: the UI contribution and the first API request
  // moved money; the retry did not.
  const finalWalletResponse = await page.request.get(`${API}/api/wallet`);
  const { wallet: finalWallet } = await readJson(
    finalWalletResponse,
    "Read final wallet",
  );

  const finalGoalsResponse = await page.request.get(`${API}/api/goals`);
  const { goals: finalGoals } = await readJson(
    finalGoalsResponse,
    "Read final goals",
  );
  const finalGoal = finalGoals.find((item) => item._id === goal._id);

  expect(Number(finalWallet.balance)).toBe(walletBefore - 750);
  expect(Number(finalGoal.savedAmount)).toBe(savedBefore + 750);
});