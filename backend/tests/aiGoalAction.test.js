import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Goal from "../src/models/Goal.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import ChatMessage from "../src/models/ChatMessage.js";
import {
  extractGoalTitleHint,
  isDeleteConfirmationMessage,
  isGoalDeleteMessage,
  resolveGoalFromHint,
} from "../src/services/aiGoalActionService.js";
import { handleCoachGoalDeleteMessage } from "../src/controllers/aiGoalControllers.js";

let replset;
const futureDate = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

before(async () => {
  // Reuse a separate in-memory replica set (transactions required).
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
    status: "active",
    automation: { enabled: false },
  });

describe("ai goal-action parsing (no DB)", () => {
  it("detects Bangla + English delete intents, ignores coaching questions", () => {
    assert.equal(isGoalDeleteMessage("Delete my iPhone goal"), true);
    assert.equal(isGoalDeleteMessage("আমার iPhone goal টা delete করে দাও"), true);
    assert.equal(isGoalDeleteMessage("iPhone goal ডিলিট করো"), true);
    assert.equal(isGoalDeleteMessage("Where am I spending the most?"), false);
    assert.equal(isGoalDeleteMessage("আমার খরচ কোথায় বেশি?"), false);
  });

  it("distinguishes proposals from explicit confirmations", () => {
    assert.equal(isDeleteConfirmationMessage("Delete my iPhone goal"), false);
    assert.equal(isDeleteConfirmationMessage("Yes, delete iPhone goal"), true);
    assert.equal(isDeleteConfirmationMessage("হ্যাঁ, iPhone goal delete করো"), true);
  });

  it("extracts title hints in both languages", () => {
    assert.match(extractGoalTitleHint("Delete my iPhone goal").toLowerCase(), /iphone/);
    assert.match(extractGoalTitleHint("আমার iPhone goal টা delete করে দাও").toLowerCase(), /iphone/);
  });

  it("resolves exact / ambiguous / none without touching IDs", () => {
    const goals = [{ title: "iPhone" }, { title: "Bike" }];
    assert.equal(resolveGoalFromHint(goals, "iphone").kind, "single");
    const dup = [{ title: "Cox Trip" }, { title: "Sylhet Trip" }];
    // "trip" is a substring of both, exact-match of neither -> ambiguous
    assert.equal(resolveGoalFromHint(dup, "trip").kind, "ambiguous");
    assert.equal(resolveGoalFromHint(goals, "laptop").kind, "none");
  });
});

describe("ai chat goal deletion flow", () => {
  it("e. AI exact-match request requires confirmation (never deletes)", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "iPhone", savedAmount: 1200 });

    const out = await handleCoachGoalDeleteMessage({
      userId: String(user),
      message: "Delete my iPhone goal",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.action, "confirm_required");
    assert.equal(out.deleted, false);

    // Nothing moved: goal intact, wallet intact, no ledger.
    assert.equal((await Goal.countDocuments({ user })).toString(), "1");
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
  });

  it("f. ambiguous AI request does not delete", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    await makeGoal(user, { title: "Cox Trip" });
    await makeGoal(user, { title: "Sylhet Trip" });

    const out = await handleCoachGoalDeleteMessage({
      userId: String(user),
      message: "Delete my Trip goal",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.action, "ambiguous");
    assert.equal(out.deleted, false);
    assert.ok(out.matches.length >= 2);

    assert.equal(await Goal.countDocuments({ user }), 2);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
  });

  it("g. AI confirmed deletion refunds via the shared deletion service", async () => {
    const user = newUser();
    await makeWallet(user, 3000);
    await makeGoal(user, { title: "iPhone", savedAmount: 800 });

    const out = await handleCoachGoalDeleteMessage({
      userId: String(user),
      message: "Yes, delete iPhone goal",
      language: "auto",
    });
    assert.equal(out.handled, true);
    assert.equal(out.deleted, true);
    assert.equal(out.goalTitle, "iPhone");
    assert.equal(Number(out.refundedAmount), 800);
    assert.match(out.reply, /iPhone/);
    assert.match(out.reply, /800/);

    // Shared-service effects: wallet +800, one cancel ledger, one income tx.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 3800);
    const ledgers = await GoalTransfer.find({ user, type: "goal_cancelled_refund" });
    assert.equal(ledgers.length, 1);
    const txs = await Transaction.find({ user, type: "income", category: "Savings" });
    assert.equal(txs.length, 1);
    assert.match(txs[0].description, /Goal cancelled and funds returned to wallet: iPhone/);
    assert.equal(await Goal.countDocuments({ user }), 0);
  });

  it("h. AI confirm cannot delete another user's goal", async () => {
    const userA = newUser();
    const userB = newUser();
    await makeWallet(userA, 5000);
    await makeWallet(userB, 5000);
    const otherGoal = await makeGoal(userA, { title: "Secret", savedAmount: 900 });

    // Attacker only knows the title, not the ID: resolution is scoped to
    // their own goals, so nothing matches and nothing is deleted.
    const out = await handleCoachGoalDeleteMessage({
      userId: String(userB),
      message: "Yes, delete Secret goal",
      language: "en",
    });
    assert.equal(out.handled, true);
    assert.equal(out.deleted, false);
    assert.equal(out.action, "not_found");

    assert.ok(await Goal.findById(otherGoal._id));
    assert.equal(Number((await Wallet.findOne({ user: userA })).balance), 5000);
    assert.equal(Number((await Wallet.findOne({ user: userB })).balance), 5000);
  });
});
