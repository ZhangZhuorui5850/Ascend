const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.VSCODE_ESM_ENTRYPOINT;
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");
  await runTests({
    version: "1.134.0",
    extensionDevelopmentPath,
    extensionTestsPath,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
