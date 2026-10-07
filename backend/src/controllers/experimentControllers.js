import mongoose from "mongoose";
import ExperimentEvent from "../models/ExperimentEvent.js";
import {
  ARMS,
  EXPERIMENT_EVENT_TYPES,
  HYPOTHESIS,
  MIN_ARM_N_FOR_CLAIM,
  MIN_MONTHS_PER_ARM_FOR_RATE,
  SYNTHETIC_EVIDENCE_LABEL,
  VALID_ARMS,
  assignArmBalanced,
  runSyntheticExperiment,
  sanitizeExperimentMetadata,
} from "../services/experimentService.js";
import { SYNTHETIC_PARTICIPANTS, assertAllFixturesSynthetic } from "../services/experimentFixtures.js";

/** GET /api/experiments/arms — exactly what each arm includes/excludes. */
export const getArms = async (_req, res) => {
  return res.status(200).json({
    success: true,
    hypothesis: HYPOTHESIS,
    arms: ARMS,
    eventTypes: EXPERIMENT_EVENT_TYPES,
    isSynthetic: false,
  });
};

/** GET /api/experiments/arm-assignment?index=N — balanced pilot assignment. */
export const getArmAssignment = async (req, res) => {
  const index = Number(req.query.index);
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({
      success: false,
      message: "index must be a non-negative integer enrolment order.",
    });
  }
  return res.status(200).json({
    success: true,
    enrolmentIndex: index,
    arm: assignArmBalanced(index),
    method: "balanced round-robin (control -> rule_based -> hishab_combined)",
    isSynthetic: false,
  });
};

/**
 * POST /api/experiments/events
 * Body: { arm, eventType, workflowVariant?, metadata? }
 * Metadata is allowlist-sanitized; rows are always real-user rows
 * (isSynthetic: false). Synthetic simulations never write here.
 */
export const postExperimentEvent = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const { arm, eventType, workflowVariant = null, metadata = {} } = req.body ?? {};
    if (!VALID_ARMS.includes(String(arm))) {
      return res.status(400).json({
        success: false,
        message: `arm must be one of: ${VALID_ARMS.join(", ")}`,
      });
    }
    if (!EXPERIMENT_EVENT_TYPES.includes(String(eventType))) {
      return res.status(400).json({
        success: false,
        message: `eventType must be one of: ${EXPERIMENT_EVENT_TYPES.join(", ")}`,
      });
    }
    const ev = await ExperimentEvent.create({
      user: userOid,
      arm: String(arm),
      workflowVariant: workflowVariant ? String(workflowVariant).slice(0, 100) : null,
      eventType: String(eventType),
      metadata: sanitizeExperimentMetadata(metadata),
      isSynthetic: false,
    });
    return res.status(201).json({
      success: true,
      event: { id: String(ev._id), arm: ev.arm, eventType: ev.eventType },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/experiments/synthetic-results
 * Deterministic simulation over version-controlled synthetic fixtures.
 * Always labelled synthetic; never real-user proof.
 */
export const getSyntheticResults = async (_req, res) => {
  try {
    assertAllFixturesSynthetic();
    const result = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/experiments/outcomes (real users)
 * Aggregate gate: below MIN_ARM_N_FOR_CLAIM users (or minimum months per
 * arm), returns insufficient_evidence — never a winner, never a CI.
 * Observational only; no causal claim until adequate controlled data exists.
 */
export const getExperimentOutcomes = async (_req, res) => {
  try {
    const rows = await ExperimentEvent.find({ isSynthetic: { $ne: true } })
      .select("user arm eventType createdAt")
      .lean();
    const users = new Set(rows.map((r) => String(r.user)));
    if (users.size < MIN_ARM_N_FOR_CLAIM) {
      return res.status(200).json({
        success: true,
        status: "insufficient_evidence",
        message:
          `Insufficient evidence to estimate impact (need ${MIN_ARM_N_FOR_CLAIM} users with workflow events, ` +
          `have ${users.size}; minimum ${MIN_MONTHS_PER_ARM_FOR_RATE} completed months per arm required for any rate comparison).`,
        sampleUsers: users.size,
        isSynthetic: false,
        syntheticNote: SYNTHETIC_EVIDENCE_LABEL.replace("Synthetic demo", "Synthetic reference"),
      });
    }
    const byArm = {};
    for (const arm of VALID_ARMS) byArm[arm] = rows.filter((r) => r.arm === arm).length;
    return res.status(200).json({
      success: true,
      status: "tracking",
      message:
        "Observational workflow-event tracking only — not proof of causality. See the real-user pilot protocol before any impact claim.",
      sampleUsers: users.size,
      eventsByArm: byArm,
      minUsers: MIN_ARM_N_FOR_CLAIM,
      minMonthsPerArm: MIN_MONTHS_PER_ARM_FOR_RATE,
      isSynthetic: false,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
