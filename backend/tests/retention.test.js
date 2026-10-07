// Retention cleanup eligibility + immutable-ledger protection (deterministic).
// Run: node --test tests/retention.test.js (replica-set backed)

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import ChatMessage from "../src/models/ChatMessage.js";
import ForecastSnapshot from "../src/models/ForecastSnapshot.js";
import Alert from "../src/models/Alert.js";
import GoalTransfer from "../src/models/GoalTransfer.js";
import Transaction from "../src/models/Transaction.js";
import Goal from "../src/models/Goal.js";
import {
  cleanupRetention,
  isEligibleForCleanup,
  retentionConfig,
} from "../src/services/retentionService.js";

let replset;
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
    ChatMessage.deleteMany({}), ForecastSnapshot.deleteMany({}), Alert.deleteMany({}),
    GoalTransfer.deleteMany({}), Transaction.deleteMany({}), Goal.deleteMany({}),
  ]);
});

const old = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe("retention policy", () => {
  it("eligibility helper respects cutoffs", () => {
    assert.equal(isEligibleForCleanup(old(100), 90), true);
    assert.equal(isEligibleForCleanup(old(10), 90), false);
    assert.equal(isEligibleForCleanup(null, 90), false);
    const cfg = retentionConfig();
    assert.ok(cfg.chatDays > 0 && cfg.forecastDays > 0 && cfg.alertDays > 0);
  });

  it("cleanup deletes expired chat/alerts/old forecasts but NEVER ledger rows", async () => {
    const u = new mongoose.Types.ObjectId();
    const g = new mongoose.Types.ObjectId();
    await ChatMessage.create({ user: u, role: "user", text: "old", createdAt: old(100), updatedAt: old(100) });
    await ChatMessage.create({ user: u, role: "user", text: "new" });
    const wk = (d) => ({ weekStart: d, predictedInflow: 1, predictedOutflow: 1, predictedBalance: 1, shortfallRisk: "low" });
    const oldSnap = await ForecastSnapshot.create({
      user: u, modelUsed: "m", horizonWeeks: 1, generatedAt: old(200), weeks: [wk(old(200))],
    });
    await oldSnap.updateOne({ createdAt: old(200) });
    const latest = await ForecastSnapshot.create({
      user: u, modelUsed: "m", horizonWeeks: 1, generatedAt: old(200), weeks: [wk(new Date())],
    });
    await Alert.create({
      user: u, type: "other", title: "t", message: "old read resolved",
      read: true, resolved: true, sourceKey: "test:old", createdAt: old(100), updatedAt: old(100),
    });
    await Alert.create({ user: u, type: "other", title: "t", message: "unread stays", sourceKey: "test:new" });
    await GoalTransfer.create({
      user: u, goal: g, type: "manual_contribution", amount: 100, cycleKey: "manual:x",
      walletBalanceBefore: 500, walletBalanceAfter: 400, createdAt: old(400),
    });
    await Transaction.create({ user: u, type: "expense", category: "Food", amount: 50, date: old(400), description: "old" });

    const out = await cleanupRetention(new Date());
    assert.equal(out.chatDeleted, 1);
    assert.equal(out.alertsDeleted, 1);
    assert.ok(out.forecastsDeleted >= 1);
    // latest snapshot survives even though it is old-dated
    assert.ok(await ForecastSnapshot.findById(latest._id));
    // immutable financial records survive
    assert.equal(await GoalTransfer.countDocuments({}), 1);
    assert.equal(await Transaction.countDocuments({}), 1);
    assert.deepEqual(out.protected, ["GoalTransfer", "Transaction"]);
    // fresh rows survive
    assert.equal(await ChatMessage.countDocuments({}), 1);
    assert.equal(await Alert.countDocuments({}), 1);
  });
});
