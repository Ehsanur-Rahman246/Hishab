import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Goal from "../src/models/Goal.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import { executeManualContribution } from "../src/services/goalAutomationService.js";

let replset;
const futureDate = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

before(
  async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri());
    // make sure unique indexes exist before racing requests
    await Promise.all([Goal.init(), Wallet.init(), GoalTransfer.init()]);
  },
  { timeout: 120000 },
);

after(
  async () => {
    await mongoose.disconnect();
    if (replset) await replset.stop();
  },
  { timeout: 60000 },
);

beforeEach(async () => {
  await Promise.all([
    Goal.deleteMany({}),
    Wallet.deleteMany({}),
    Transaction.deleteMany({}),
    GoalTransfer.deleteMany({}),
  ]);
});

const newUser = () => new mongoose.Types.ObjectId();
const makeWallet = (userId, balance) =>
  Wallet.create({
    user: userId,
    walletNumber: `W-${userId}-${Math.random()}`,
    balance,
  });
const makeGoal = (userId, o = {}) =>
  Goal.create({
    user: userId,
    title: o.title ?? "Goal",
    targetAmount: o.targetAmount ?? 10000,
    savedAmount: o.savedAmount ?? 0,
    targetDate: futureDate(),
    status: "active",
    automation: { enabled: false },
  });

describe("manual contribution consistency", () => {
  it("concurrent contributions never overspend or desync the ledger", async () => {
    const user = newUser();
    const goal = await makeGoal(user, { targetAmount: 2000 });
    await makeWallet(user, 1000);

    const results = await Promise.allSettled([
      executeManualContribution({
        userId: String(user),
        goalId: String(goal._id),
        amount: 800,
        idempotencyKey: "concurrent-a",
      }),
      executeManualContribution({
        userId: String(user),
        goalId: String(goal._id),
        amount: 800,
        idempotencyKey: "concurrent-b",
      }),
    ]);

    const ok = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "contributed",
    );
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.statusCode, 400);

    const wallet = await Wallet.findOne({ user });
    const updated = await Goal.findById(goal._id);
    const transfers = await GoalTransfer.find({
      user,
      goal: goal._id,
      type: "manual_contribution",
    });

    assert.ok(Number(wallet.balance) >= 0);
    assert.equal(Number(wallet.balance) + Number(updated.savedAmount), 1000);
    assert.equal(transfers.length, 1);
    assert.equal(
      transfers.reduce((s, t) => s + Number(t.amount), 0),
      Number(updated.savedAmount),
    );
    assert.equal(
      await Transaction.countDocuments({
        user,
        category: "Savings",
        type: "expense",
      }),
      1,
    );
  });

  it("same idempotency key twice moves money once", async () => {
    const user = newUser();
    const goal = await makeGoal(user);
    await makeWallet(user, 1000);
    const args = {
      userId: String(user),
      goalId: String(goal._id),
      amount: 300,
      idempotencyKey: "same-key",
    };

    const first = await executeManualContribution(args);
    const second = await executeManualContribution(args);
    assert.equal(first.status, "contributed");
    assert.equal(second.status, "duplicate");

    assert.equal(Number((await Wallet.findOne({ user })).balance), 700);
    assert.equal(Number((await Goal.findById(goal._id)).savedAmount), 300);
    assert.equal(
      await GoalTransfer.countDocuments({ user, type: "manual_contribution" }),
      1,
    );
    assert.equal(
      await Transaction.countDocuments({ user, category: "Savings" }),
      1,
    );
  });

  it("insufficient balance changes nothing", async () => {
    const user = newUser();
    const goal = await makeGoal(user);
    await makeWallet(user, 200);

    await assert.rejects(
      executeManualContribution({
        userId: String(user),
        goalId: String(goal._id),
        amount: 1000,
        idempotencyKey: "poor",
      }),
      /Insufficient wallet balance/,
    );
    assert.equal(Number((await Wallet.findOne({ user })).balance), 200);
    assert.equal(Number((await Goal.findById(goal._id)).savedAmount), 0);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(await Transaction.countDocuments({ user }), 0);
  });
});
