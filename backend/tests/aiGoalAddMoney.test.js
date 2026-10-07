import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Goal from "../src/models/Goal.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import ChatMessage from "../src/models/ChatMessage.js";
import PendingGoalAction from "../src/models/PendingGoalAction.js";
import GoalActionAudit from "../src/models/GoalActionAudit.js";
import {
  isGoalAddMoneyMessage,
  parseGoalAddMoneyIntent,
} from "../src/services/aiGoalActionService.js";
import { handleCoachGoalAddMoneyMessage } from "../src/controllers/aiGoalControllers.js";

let replset;
const futureDate = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(uri);
}, { timeout: 120000 });

after(async () => {
  await mongoose.disconnect();
  if (replset) await replset.stop();
}, { timeout: 60000 });

beforeEach(async () => {
  await Promise.all([
    Goal.deleteMany({}),
    Wallet.deleteMany({}),
    Transaction.deleteMany({}),
    GoalTransfer.deleteMany({}),
    ChatMessage.deleteMany({}),
    PendingGoalAction.deleteMany({}),
    GoalActionAudit.deleteMany({}),
  ]);
});

const newUser = () => new mongoose.Types.ObjectId();
const makeWallet = (userId, balance) =>
  Wallet.create({ user: userId, walletNumber: `W-${userId}-${Date.now()}-${Math.random()}`, balance });
const makeGoal = (userId, overrides = {}) =>
  Goal.create({
    user: userId,
    title: overrides.title ?? "Goal",
    targetAmount: overrides.targetAmount ?? 10000,
    savedAmount: overrides.savedAmount ?? 0,
    targetDate: overrides.targetDate ?? futureDate(),
    status: overrides.status ?? "active",
    automation: { enabled: false },
  });

describe("ai add-money parsing (no DB)", () => {
  it("parses Bangla conditional + English commands, ignores coaching questions", () => {
    const bn = parseGoalAddMoneyIntent("আমার wallet এ 500 টাকার বেশি থাকলে iPhone goal এ 500 টাকা add করে দাও");
    assert.ok(bn);
    assert.equal(bn.amount, 500);
    assert.equal(bn.conditionThreshold, 500);
    assert.match(bn.goalHint.toLowerCase(), /iphone/);

    const en = parseGoalAddMoneyIntent("If my wallet balance is more than 500, add 500 BDT to my iPhone goal.");
    assert.ok(en);
    assert.equal(en.amount, 500);
    assert.equal(en.conditionThreshold, 500);
    assert.match(en.goalHint.toLowerCase(), /iphone/);

    const plain = parseGoalAddMoneyIntent("Add 1000 taka to my Emergency Fund goal.");
    assert.ok(plain);
    assert.equal(plain.amount, 1000);
    assert.equal(plain.conditionThreshold, null);
    assert.match(plain.goalHint.toLowerCase(), /emergency/);

    // Not add-money commands.
    assert.equal(isGoalAddMoneyMessage("Why did my expenses increase this month?"), false);
    assert.equal(isGoalAddMoneyMessage("How much can I save next month?"), false);
    assert.equal(isGoalAddMoneyMessage("আমার খরচ কোথায় বেশি?"), false);
    assert.equal(isGoalAddMoneyMessage("Delete my iPhone goal"), false);
    assert.equal(isGoalAddMoneyMessage("Yes, delete iPhone goal"), false);
  });
});

describe("ai chat add-money flow (confirm-first: chat proposes, token confirms)", () => {
  it("2. exact goal + amount PROPOSES without moving money; token confirm moves it once", async () => {
    const { confirmGoalContribution } = await import("../src/services/goalActionProposalService.js");
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "iPhone", savedAmount: 0 });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "Add 1000 taka to my iPhone goal.",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.added, false);
    assert.equal(out.action, "confirm_required");
    assert.ok(out.confirmationToken);
    assert.match(out.reply, /iPhone/);
    assert.match(out.reply, /1,000/);
    // No money moved on propose.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(Number((await Goal.findOne({ user })).savedAmount), 0);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);

    const { result } = await confirmGoalContribution({
      userId: String(user), confirmationToken: out.confirmationToken, idempotencyKey: "key-exact-1",
    });
    assert.equal(result.status, "contributed");
    assert.equal(Number((await Wallet.findOne({ user })).balance), 4000);
    assert.equal(Number((await Goal.findOne({ user })).savedAmount), 1000);
    const ledgers = await GoalTransfer.find({ user, type: "manual_contribution" });
    assert.equal(ledgers.length, 1);
    assert.equal(Number(ledgers[0].amount), 1000);
    const txs = await Transaction.find({ user, type: "expense", category: "Savings" });
    assert.equal(txs.length, 1);
    assert.equal(Number(txs[0].amount), 1000);
  });

  it("2b. Bangla conditional command proposes when balance is strictly greater", async () => {
    const { confirmGoalContribution } = await import("../src/services/goalActionProposalService.js");
    const user = newUser();
    await makeWallet(user, 1000);
    await makeGoal(user, { title: "iPhone", savedAmount: 0 });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "আমার wallet এ 500 টাকার বেশি থাকলে iPhone goal এ 500 টাকা add করে দাও",
      language: "auto",
    });
    assert.equal(out.added, false);
    assert.equal(out.action, "confirm_required");
    assert.equal(Number((await Wallet.findOne({ user })).balance), 1000);
    await confirmGoalContribution({ userId: String(user), confirmationToken: out.confirmationToken });
    assert.equal(Number((await Wallet.findOne({ user })).balance), 500);
    assert.equal(Number((await Goal.findOne({ user })).savedAmount), 500);
  });

  it("3. condition fails when balance is equal to or below the threshold", async () => {
    for (const balance of [500, 400]) {
      await Promise.all([
        Goal.deleteMany({}),
        Wallet.deleteMany({}),
        Transaction.deleteMany({}),
        GoalTransfer.deleteMany({}),
        ChatMessage.deleteMany({}),
      ]);
      const user = newUser();
      await makeWallet(user, balance);
      await makeGoal(user, { title: "iPhone", savedAmount: 0 });

      const out = await handleCoachGoalAddMoneyMessage({
        userId: String(user),
        message: "আমার wallet এ 500 টাকার বেশি থাকলে iPhone goal এ 500 টাকা add করে দাও",
        language: "auto",
      });
      assert.equal(out.handled, true);
      assert.equal(out.added, false);
      assert.equal(out.action, "condition_failed");

      assert.equal(Number((await Wallet.findOne({ user })).balance), balance);
      assert.equal(Number((await Goal.findOne({ user })).savedAmount), 0);
      assert.equal(await GoalTransfer.countDocuments({ user }), 0);
      assert.equal(await Transaction.countDocuments({ user }), 0);
    }
  });

  it("4. insufficient wallet balance fails safely", async () => {
    const user = newUser();
    await makeWallet(user, 200);
    await makeGoal(user, { title: "iPhone", savedAmount: 0 });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "Add 1000 taka to my iPhone goal.",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.added, false);
    assert.equal(out.action, "failed");

    assert.equal(Number((await Wallet.findOne({ user })).balance), 200);
    assert.equal(Number((await Goal.findOne({ user })).savedAmount), 0);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(await Transaction.countDocuments({ user }), 0);
  });

  it("5. ambiguous goal title does not move money", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "Cox Trip" });
    await makeGoal(user, { title: "Sylhet Trip" });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "Add 500 taka to my Trip goal.",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.added, false);
    assert.equal(out.action, "ambiguous");
    assert.ok(out.matches.length >= 2);

    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(await Transaction.countDocuments({ user }), 0);
  });

  it("5b. unknown goal explains not-found without moving money", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "iPhone" });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "Add 500 taka to my Laptop goal.",
      language: "en",
    });
    assert.equal(out.action, "not_found");
    assert.equal(out.added, false);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
  });

  it("5c. inactive goals cannot receive money", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "Old", status: "released", savedAmount: 100 });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: "Add 500 taka to my Old goal.",
      language: "en",
    });
    assert.equal(out.action, "inactive");
    assert.equal(out.added, false);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
  });

  it("6. another user's goal can never be found or modified", async () => {
    const userA = newUser();
    const userB = newUser();
    await makeWallet(userA, 5000);
    await makeWallet(userB, 5000);
    await makeGoal(userA, { title: "Secret", savedAmount: 100 });

    const out = await handleCoachGoalAddMoneyMessage({
      userId: String(userB),
      message: "Add 500 taka to my Secret goal.",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.added, false);
    assert.equal(out.action, "not_found");

    assert.equal(Number((await Wallet.findOne({ user: userA })).balance), 5000);
    assert.equal(Number((await Wallet.findOne({ user: userB })).balance), 5000);
    assert.equal(Number((await Goal.findOne({ user: userA })).savedAmount), 100);
    assert.equal(await GoalTransfer.countDocuments({}), 0);
    assert.equal(await Transaction.countDocuments({}), 0);
  });

  it("7. token replay + idempotent retry cannot duplicate a transfer", async () => {
    const { confirmGoalContribution } = await import("../src/services/goalActionProposalService.js");
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "iPhone", savedAmount: 0 });

    const msg = "Add 1000 taka to my iPhone goal.";
    const first = await handleCoachGoalAddMoneyMessage({
      userId: String(user),
      message: msg,
      language: "en",
    });
    assert.equal(first.added, false);
    assert.equal(first.action, "confirm_required");

    const c1 = await confirmGoalContribution({
      userId: String(user), confirmationToken: first.confirmationToken, idempotencyKey: "key-dup-1",
    });
    assert.equal(c1.result.status, "contributed");

    // Replaying the same token is rejected (one-time-use).
    await assert.rejects(
      confirmGoalContribution({ userId: String(user), confirmationToken: first.confirmationToken }),
      /already used/,
    );
    // Retrying the money step with the same idempotency key also collapses.
    const { executeManualContribution } = await import("../src/services/goalAutomationService.js");
    const goal = await Goal.findOne({ user });
    const dup = await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 1000, idempotencyKey: "key-dup-1",
    });
    assert.equal(dup.status, "duplicate");

    assert.equal(Number((await Wallet.findOne({ user })).balance), 4000);
    assert.equal(Number((await Goal.findOne({ user })).savedAmount), 1000);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "manual_contribution" }), 1);
    assert.equal(await Transaction.countDocuments({ user, type: "expense", category: "Savings" }), 1);
  });
});
