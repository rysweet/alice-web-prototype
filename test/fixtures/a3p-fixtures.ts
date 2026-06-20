import * as fs from "fs";
import * as path from "path";

export const REPOSITORY_A3P_FIXTURE = path.resolve(__dirname, "a3p/sanitized-scene.a3p");
export const RUN_EXTERNAL_A3P_FIXTURES = process.env.ALICE_WEB_RUN_EXTERNAL_A3P_FIXTURES === "1";

export const OPTIONAL_EXTERNAL_A3P_FIXTURES = [
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/amazonMinimum.a3p",
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/amazonFull.a3p",
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/chinaFull.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/amazonMinimum.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/iceFull.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/magicMinimum.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/indiaMinimum.a3p",
];

export function readRequiredA3PFixture(filePath = REPOSITORY_A3P_FIXTURE): Buffer {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required repository A3P fixture is missing: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

export function optionalExternalA3PFixtureExists(filePath: string): boolean {
  return RUN_EXTERNAL_A3P_FIXTURES && fs.existsSync(filePath);
}
