/** Print deterministic synthetic experiment results (for report embedding). */
import { runSyntheticExperiment } from "../src/services/experimentService.js";
import { SYNTHETIC_PARTICIPANTS } from "../src/services/experimentFixtures.js";

const result = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
console.log(JSON.stringify(result, null, 2));
