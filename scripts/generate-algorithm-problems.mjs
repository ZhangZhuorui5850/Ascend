import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildJudgeProblemDefinitions,
  validateFixtureDefinitions,
} from "./algorithm-problem-fixtures.mjs";

const outputPath = path.resolve(
  process.cwd(),
  "services/judge-gateway/problems.json",
);
const definitions = validateFixtureDefinitions(buildJudgeProblemDefinitions());
writeFileSync(outputPath, `${JSON.stringify(definitions, null, 2)}\n`, "utf8");
console.log(`Generated ${definitions.length} Judge problems at ${outputPath}`);
