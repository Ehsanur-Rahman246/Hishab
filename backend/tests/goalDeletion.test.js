import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Goal from "../src/models/Goal.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import {
  executeGoalDeletion,
  processReleasesForUser,
} from "../src/services/goalAutomationService.js"; 

let replset;

const futureDate = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
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
  ]);
});

const newUser = () => new mongoose.Types.ObjectId();

const makeWallet = (userId, balance) =>
  Wallet.create({ user: userId, walletNumber: `W-${userId}-${Date.now()}-${Math.random()}`, balance });

const makeGoal = (userId, overrides = {}) =>
  Goal.create({
    user: userId,
    title: overrides.title ?? "Test Goal",
    targetAmount: overrides.targetAmount ?? 10000,
    savedAmount: overrides.savedAmount ?? 0,
    targetDate: overrides.targetDate ?? futureDate(),
    status: overrides.status ?? "active",
    automation: { enabled: false },
  });

describe("goal deletion with refund", () => {
  it("a. deleting zero-balance goal works without refund transaction", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    const goal = await makeGoal(user, { savedAmount: 0 });

    const res = await executeGoalDeletion({ userId: String(user), goalId: String(goal._id) });
    assert.equal(res.status, "deleted");
    assert.equal(res.refundedAmount, 0);

    const wallet = await Wallet.findOne({ user });
    assert.equal(Number(wallet.balance), 5000);

    const ledgers = await GoalTransfer.find({ user, goal: goal._id });
    assert.equal(ledgers.length, 0);

    const txs = await Transaction.find({ user });
    assert.equal(txs.length, 0);

    const gone = await Goal.findById(goal._id);
    assert.equal(gone, null);
  });

  it("b. deleting funded goal refunds wallet + one ledger + one income transaction", async () => {
    const user = newUser();
    await makeWallet(user, 4000);
    const goal = await makeGoal(user, { title: "iPhone", savedAmount: 2500 });

    const res = await executeGoalDeletion({ userId: String(user), goalId: String(goal._id) });
    assert.equal(res.status, "deleted");
    assert.equal(res.refundedAmount, 2500);

    const wallet = await Wallet.findOne({ user });
    assert.equal(Number(wallet.balance), 6500);

    const ledgers = await GoalTransfer.find({ user, goal: goal._id });
    assert.equal(ledgers.length, 1);
    assert.equal(ledgers[0].type, "goal_cancelled_refund");
    assert.equal(Number(ledgers[0].amount), 2500);

    const txs = await Transaction.find({ user });
    assert.equal(txs.length, 1);
    assert.equal(txs[0].type, "income");
    assert.equal(txs[0].category, "Savings");
    assert.equal(Number(txs[0].amount), 2500);
    assert.match(txs[0].description, /Goal cancelled and funds returned to wallet: iPhone/);

    // Audit history preserved (ledger + transaction still exist after goal row gone).
    const gone = await Goal.findById(goal._id);
    assert.equal(gone, null);
    assert.equal((await GoalTransfer.find({ user })).length, 1);
    assert.equal((await Transaction.find({ user })).length, 1);
  });

  it("c. retry/concurrent delete does not double-refund", async () => {
    const user = newUser();
    await makeWallet(user, 1000);
    const goal = await makeGoal(user, { title: "Bike", savedAmount: 1500 });

    const [r1, r2] = await Promise.all([
      executeGoalDeletion({ userId: String(user), goalId: String(goal._id) }),
      executeGoalDeletion({ userId: String(user), goalId: String(goal._id) }),
    ]);
    const refunded = [r1, r2].map((r) => Number(r.refundedAmount) || 0);
    // Exactly one winner refunds; the other is a duplicate with same amount.
    assert.ok(refunded.includes(1500));

    const wallet = await Wallet.findOne({ user });
    assert.equal(Number(wallet.balance), 2500); // 1000 + 1500 once, never 4000

    const ledgers = await GoalTransfer.find({ user, goal: goal._id, type: "goal_cancelled_refund" });
    assert.equal(ledgers.length, 1);

    const txs = await Transaction.find({ user, category: "Savings", type: "income" });
    assert.equal(txs.length, 1);

    // Retry after hard-delete returns duplicate, still no second refund.
    const retry = await executeGoalDeletion({ userId: String(user), goalId: String(goal._id) });
    assert.equal(retry.status, "duplicate");
    assert.equal(Number(retry.refundedAmount), 1500);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 2500);
    assert.equal((await GoalTransfer.find({ user, type: "goal_cancelled_refund" })).length, 1);
  });

  it("d. target-date release and delete race does not double-refund", async () => {
    const user = newUser();
    await makeWallet(user, 2000);
    const goal = await makeGoal(user, { title: "Due Goal", savedAmount: 3000, targetDate: pastDate() });
    const now = new Date();

    const [releaseRes, deleteRes] = await Promise.all([
      processReleasesForUser(String(user), now),
      executeGoalDeletion({ userId: String(user), goalId: String(goal._id) }),
    ]);
    void releaseRes;
    void deleteRes;

    const wallet = await Wallet.findOne({ user });
    // Exactly one refund of 3000 regardless of who won the race.
    assert.equal(Number(wallet.balance), 5000);

    const releases = await GoalTransfer.find({ user, goal: goal._id, type: "goal_release" });
    const cancels = await GoalTransfer.find({ user, goal: goal._id, type: "goal_cancelled_refund" });
    assert.equal(releases.length + cancels.length, 1);

    const incomes = await Transaction.find({ user, type: "income", category: "Savings" });
    assert.equal(incomes.length, 1);
    assert.equal(Number(incomes[0].amount), 3000);
  });

  it("h. one user cannot delete another user's goal", async () => {
    const userA = newUser();
    const userB = newUser();
    await makeWallet(userA, 5000);
    await makeWallet(userB, 5000);
    const goal = await makeGoal(userA, { title: "Private", savedAmount: 1000 });

    await assert.rejects(
      executeGoalDeletion({ userId: String(userB), goalId: String(goal._id) }),
      /Goal not found/
    );

    // Nothing moved for either wallet; goal untouched; no ledger.
    assert.equal(Number((await Wallet.findOne({ user: userA })).balance), 5000);
    assert.equal(Number((await Wallet.findOne({ user: userB })).balance), 5000);
    assert.ok(await Goal.findById(goal._id));
    assert.equal(await GoalTransfer.countDocuments({}), 0);
    assert.equal(await Transaction.countDocuments({}), 0);
  });
});
