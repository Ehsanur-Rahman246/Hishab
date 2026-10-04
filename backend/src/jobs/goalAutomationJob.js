import cron from "node-cron";
import {
  previousMonthlyCycleKey,
  previousWeeklyCycleKey,
  runMonthlyCycleForAllUsers,
  runReleasesForAllUsers,
  runWeeklyCycleForAllUsers,
} from "../services/goalAutomationService.js";

// In-process guard: node-cron can overlap a slow run with the next tick,
// and nodemon restarts must not double-process. Cycle keys + the
// GoalTransfer unique index are the real duplicate guard; this flag only
// avoids wasted overlapping work inside one process.
let running = false;
let registered = false;

const guarded = (name, fn) => async () => {
  if (running) {
    console.log(`[goal-automation] ${name} skipped: previous run still in progress.`);
    return;
  }
  running = true;
  try {
    await fn();
  } catch (err) {
    console.error(`[goal-automation] ${name} failed:`, err?.message || err);
  } finally {
    running = false;
  }
};

export const registerGoalAutomationJobs = () => {
  if (registered) return;
  registered = true;

  if (process.env.GOAL_AUTOMATION_DISABLED === "1") {
    console.log("[goal-automation] disabled via GOAL_AUTOMATION_DISABLED=1.");
    return;
  }

  // Daily release checker — 00:15 Asia/Dhaka.
  cron.schedule(
    "15 0 * * *",
    guarded("daily-release", async () => {
      const summary = await runReleasesForAllUsers(new Date());
      console.log("[goal-automation] daily release:", JSON.stringify(summary));
    }),
    { timezone: "Asia/Dhaka" }
  );

  // Weekly auto-save — Sunday 00:05 Asia/Dhaka, processes the week just ended.
  cron.schedule(
    "5 0 * * 0",
    guarded("weekly-autosave", async () => {
      const now = new Date();
      const cycleKey = previousWeeklyCycleKey(now);
      const summary = await runWeeklyCycleForAllUsers(cycleKey, now);
      console.log("[goal-automation] weekly:", JSON.stringify(summary));
    }),
    { timezone: "Asia/Dhaka" }
  );

  // Monthly auto-save — 1st of month 00:10 Asia/Dhaka, previous month cycle.
  cron.schedule(
    "10 0 1 * *",
    guarded("monthly-autosave", async () => {
      const now = new Date();
      const cycleKey = previousMonthlyCycleKey(now);
      const summary = await runMonthlyCycleForAllUsers(cycleKey);
      console.log("[goal-automation] monthly:", JSON.stringify(summary));
    }),
    { timezone: "Asia/Dhaka" }
  );

  console.log("[goal-automation] scheduler registered (Asia/Dhaka).");
};
