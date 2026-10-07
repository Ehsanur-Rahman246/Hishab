import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Goal from "../src/models/Goal.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import Alert from "../src/models/Alert.js";
import ChatMessage from "../src/models/ChatMessage.js";
import PendingGoalAction from "../src/models/PendingGoalAction.js";
import GoalActionAudit from "../src/models/GoalActionAudit.js";
import {
  executeManualContribution,
  processAutoContributionsForUser,
  processReleasesForUser,
  runDueAutomationForUser,
  executeGoalDeletion,
} from "../src/services/goalAutomationService.js";
import { addSavings } from "../src/controllers/goalControllers.js";

let replset;

const futureDate = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

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
    Alert.deleteMany({}),
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
    title: overrides.title ?? "Test Goal",
    targetAmount: overrides.targetAmount ?? 5000,
    savedAmount: overrides.savedAmount ?? 0,
    targetDate: overrides.targetDate ?? futureDate(),
    status: overrides.status ?? "active",
    automation: overrides.automation ?? { enabled: false },
  });

const mkRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

describe("early completion release", () => {
  it("1. exact final contribution debits wallet, then releases everything back at once", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { title: "Bike", targetAmount: 5000, savedAmount: 2000 });

    const res = await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-1",
    });
    assert.equal(res.status, "contributed");
    assert.equal(res.completed, true);
    assert.equal(res.released, true);
    assert.equal(Number(res.releasedAmount), 5000);
    assert.equal(Number(res.transfer.amount), 3000);
    assert.equal(Number(res.walletBalanceAfter), 12000);

    // Wallet: 10000 - 3000 (contribution) + 5000 (release) = 12000.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);

    const g = await Goal.findById(goal._id).lean();
    assert.equal(g.status, "released");
    assert.equal(Number(g.savedAmount), 5000);
    assert.ok(g.completedAt);
    assert.ok(g.releasedAt);
    assert.equal(Number(g.releasedAmount), 5000);
    assert.equal(g.automation.enabled, false);

    const manuals = await GoalTransfer.find({ user, goal: goal._id, type: "manual_contribution" });
    assert.equal(manuals.length, 1);
    assert.equal(Number(manuals[0].amount), 3000);

    const releases = await GoalTransfer.find({ user, goal: goal._id, type: "goal_release" });
    assert.equal(releases.length, 1);
    assert.equal(Number(releases[0].amount), 5000);

    const expenses = await Transaction.find({ user, type: "expense", category: "Savings" });
    assert.equal(expenses.length, 1);
    assert.equal(Number(expenses[0].amount), 3000);
    const incomes = await Transaction.find({ user, type: "income", category: "Savings" });
    assert.equal(incomes.length, 1);
    assert.equal(Number(incomes[0].amount), 5000);
    assert.match(incomes[0].description, /Goal funds released to wallet: Bike/);

    const alerts = await Alert.find({ user, sourceKey: `goal_release:${String(goal._id)}` });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /early/);
  });

  it("1b. add-savings response carries completed/released/releasedAmount/walletBalance", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { title: "Bike", targetAmount: 5000, savedAmount: 2000 });

    const res = mkRes();
    await addSavings(
      { user: { userId: String(user) }, params: { id: String(goal._id) }, body: { amount: 3000, idempotencyKey: "early-1b" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.completed, true);
    assert.equal(res.body.released, true);
    assert.equal(Number(res.body.releasedAmount), 5000);
    assert.equal(Number(res.body.walletBalance), 12000);
    assert.match(res.body.message, /Goal completed early/);
    assert.match(res.body.message, /has been returned to your wallet/);
    assert.equal(res.body.goal.status, "released");
  });

  it("2. overshoot is capped at remaining; exactly targetAmount is released", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { targetAmount: 5000, savedAmount: 4500 });

    const res = await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 2000, idempotencyKey: "early-2",
    });
    assert.equal(res.status, "contributed");
    // Only the remaining 500 was taken.
    assert.equal(Number(res.transfer.amount), 500);
    assert.equal(res.released, true);
    assert.equal(Number(res.releasedAmount), 5000);

    // Wallet: 10000 - 500 + 5000 = 14500.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 14500);
    const g = await Goal.findById(goal._id).lean();
    assert.equal(g.status, "released");
    assert.equal(Number(g.savedAmount), 5000);
    assert.equal((await GoalTransfer.find({ user, goal: goal._id, type: "goal_release" })).length, 1);
  });

  it("3. chat confirm reaching target releases; proposal alone moves nothing", async () => {
    const { proposeGoalContribution, confirmGoalContribution } = await import(
      "../src/services/goalActionProposalService.js"
    );
    const user = newUser();
    await makeWallet(user, 5000);
    const goal = await makeGoal(user, { title: "ChatGoal", targetAmount: 2000, savedAmount: 1000 });

    const proposal = await proposeGoalContribution({
      userId: String(user), goalId: String(goal._id), amount: 1000,
    });
    assert.ok(proposal.confirmationToken);
    // Proposal is read-only: nothing moved.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(Number((await Goal.findById(goal._id).lean()).savedAmount), 1000);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(await Transaction.countDocuments({ user }), 0);

    const { result } = await confirmGoalContribution({
      userId: String(user), confirmationToken: proposal.confirmationToken, idempotencyKey: "early-3",
    });
    assert.equal(result.status, "contributed");
    assert.equal(result.completed, true);
    assert.equal(result.released, true);
    assert.equal(Number(result.releasedAmount), 2000);

    // Wallet: 5000 - 1000 + 2000 = 6000.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 6000);
    assert.equal((await Goal.findById(goal._id).lean()).status, "released");
    assert.equal((await GoalTransfer.find({ user, type: "goal_release" })).length, 1);
    assert.equal((await Transaction.find({ user, type: "income", category: "Savings" })).length, 1);
  });

  it("4. retry, double-click, and concurrent same-key attempts move money once", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { targetAmount: 5000, savedAmount: 2000 });
    const args = { userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-4" };

    // Sequential retry.
    const r1 = await executeManualContribution(args);
    assert.equal(r1.status, "contributed");
    assert.equal(r1.released, true);
    const r2 = await executeManualContribution(args);
    assert.equal(r2.status, "duplicate");

    // Concurrent double-click with a fresh key on a second goal.
    const goal2 = await makeGoal(user, { title: "Second", targetAmount: 5000, savedAmount: 2000 });
    const args2 = { userId: String(user), goalId: String(goal2._id), amount: 3000, idempotencyKey: "early-4b" };
    const [c1, c2] = await Promise.all([
      executeManualContribution(args2),
      executeManualContribution(args2),
    ]);
    const statuses = [c1.status, c2.status].sort();
    assert.deepEqual(statuses, ["contributed", "duplicate"]);

    // Goal 1: 10000 - 3000 + 5000 = 12000; goal 2 same on its own funds:
    // total wallet = 12000 - 3000 + 5000 = 14000.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 14000);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "manual_contribution" }), 2);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_release" }), 2);
    assert.equal(await Transaction.countDocuments({ user, type: "income", category: "Savings" }), 2);
  });

  it("5. scheduler and Run Now after early release skip safely", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { targetAmount: 5000, savedAmount: 2000 });
    await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-5",
    });

    const releases = await processReleasesForUser(String(user), new Date());
    assert.deepEqual(releases, []);
    const summary = await runDueAutomationForUser(String(user), new Date());
    assert.deepEqual(summary.releases, []);
    assert.deepEqual(summary.contributions, []);

    // Nothing moved again: still exactly one release row, wallet untouched.
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_release" }), 1);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);
  });

  it("6. target-date release racing early completion yields exactly one release", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { title: "Racy", targetAmount: 5000, savedAmount: 2000, targetDate: pastDate() });
    const now = new Date();

    const [manualRes, releaseRes] = await Promise.all([
      executeManualContribution({
        userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-6",
      }).catch((e) => ({ status: "threw", message: e?.message })),
      processReleasesForUser(String(user), now),
    ]);
    void manualRes;
    void releaseRes;

    // Exactly one release transaction exists, regardless of who won.
    const releases = await GoalTransfer.find({ user, goal: goal._id, type: "goal_release" });
    assert.equal(releases.length, 1);
    const incomes = await Transaction.find({ user, type: "income", category: "Savings" });
    assert.equal(incomes.length, 1);
    assert.equal((await Goal.findById(goal._id).lean()).status, "released");

    const manuals = await GoalTransfer.find({ user, goal: goal._id, type: "manual_contribution" });
    assert.ok(manuals.length <= 1);
    if (manuals.length === 1) {
      // Manual won: debit 3000, release full 5000.
      assert.equal(Number(releases[0].amount), 5000);
      assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);
    } else {
      // Target-date path won: manual aborted with nothing moved, release 2000.
      assert.equal(Number(releases[0].amount), 2000);
      assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);
    }
  });

  it("7. delete after early release deletes safely without a second refund", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { title: "Gone", targetAmount: 5000, savedAmount: 2000 });
    await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-7",
    });
    assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);

    const del = await executeGoalDeletion({ userId: String(user), goalId: String(goal._id) });
    assert.equal(del.status, "deleted");
    assert.equal(Number(del.refundedAmount), 0);
    assert.equal(del.alreadyReleased, true);

    // Wallet untouched by the delete; no cancel-refund row; release row kept.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_cancelled_refund" }), 0);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_release" }), 1);
    assert.equal(await Goal.findById(goal._id), null);
  });

  it("8. cross-user attempts cannot trigger or inspect a release", async () => {
    const userA = newUser();
    const userB = newUser();
    await makeWallet(userA, 10000);
    await makeWallet(userB, 10000);
    const goal = await makeGoal(userA, { title: "Private", targetAmount: 5000, savedAmount: 2000 });

    await assert.rejects(
      executeManualContribution({ userId: String(userB), goalId: String(goal._id), amount: 3000 }),
      /Goal not found/
    );
    // Attacker-scoped release run sees nothing.
    assert.deepEqual(await processReleasesForUser(String(userB), new Date()), []);

    assert.equal(Number((await Wallet.findOne({ user: userA })).balance), 10000);
    assert.equal(Number((await Wallet.findOne({ user: userB })).balance), 10000);
    assert.equal(Number((await Goal.findById(goal._id).lean()).savedAmount), 2000);
    assert.equal(await GoalTransfer.countDocuments({}), 0);
    assert.equal(await Transaction.countDocuments({}), 0);
  });

  it("9. zero-savedAmount due goal releases status without any money movement", async () => {
    const user = newUser();
    await makeWallet(user, 5000);
    const goal = await makeGoal(user, { targetAmount: 5000, savedAmount: 0, targetDate: pastDate() });

    const out = await processReleasesForUser(String(user), new Date());
    assert.equal(out.length, 1);
    assert.equal(out[0].status, "released");
    assert.equal(Number(out[0].amount), 0);

    const g = await Goal.findById(goal._id).lean();
    assert.equal(g.status, "released");
    assert.equal(Number(g.releasedAmount), 0);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 5000);
    assert.equal(await GoalTransfer.countDocuments({ user }), 0);
    assert.equal(await Transaction.countDocuments({ user }), 0);
    assert.equal(await Alert.countDocuments({ user }), 0);
  });

  it("10. scheduler contribution that completes a goal releases it in the same run", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    await makeGoal(user, {
      title: "Auto",
      targetAmount: 2000,
      savedAmount: 0,
      automation: { enabled: true, frequency: "monthly", percentage: 25, priority: 1, paused: false, lastProcessedCycle: null, enabledAt: new Date() },
    });

    const out = await processAutoContributionsForUser(user, {
      weeklyCycleKey: "test-week", monthlyCycleKey: "test-month",
    });
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].status, "contributed");
    assert.equal(out.results[0].completed, true);
    assert.equal(out.results[0].released, true);
    assert.equal(Number(out.results[0].releasedAmount), 2000);

    // Wallet: 10000 - 2000 + 2000 = 10000.
    assert.equal(Number((await Wallet.findOne({ user })).balance), 10000);
    const g = await Goal.findOne({ user }).lean();
    assert.equal(g.status, "released");
    assert.equal(Number(g.releasedAmount), 2000);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "auto_contribution" }), 1);
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_release" }), 1);
  });

  it("11. released goals accept no new contributions, automation, or releases", async () => {
    const user = newUser();
    await makeWallet(user, 10000);
    const goal = await makeGoal(user, { targetAmount: 5000, savedAmount: 2000 });
    await executeManualContribution({
      userId: String(user), goalId: String(goal._id), amount: 3000, idempotencyKey: "early-11",
    });

    await assert.rejects(
      executeManualContribution({ userId: String(user), goalId: String(goal._id), amount: 100 }),
      /active/
    );
    assert.deepEqual(await processReleasesForUser(String(user), new Date()), []);
    const again = await processAutoContributionsForUser(user, {
      weeklyCycleKey: "w", monthlyCycleKey: "m",
    });
    assert.deepEqual(again.results, []);

    // Single release stands; wallet settled at 12000.
    assert.equal(await GoalTransfer.countDocuments({ user, type: "goal_release" }), 1);
    assert.equal(Number((await Wallet.findOne({ user })).balance), 12000);
  });
});
