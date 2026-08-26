const assert = require("node:assert/strict");
const vscode = require("vscode");

async function run() {
  const extension = vscode.extensions.getExtension("zzr.ascend-practice");
  assert.ok(extension, "Ascend Practice extension should be discoverable");
  await extension.activate();
  assert.equal(extension.isActive, true);
  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "ascendPractice.openProblem",
    "ascendPractice.sync",
    "ascendPractice.recordResult",
    "ascendPractice.submitFormal",
    "ascendPractice.switchServer",
    "ascendPractice.switchViewMode",
    "ascendPractice.selectCurrentCourse",
    "ascendPractice.moveToFolder",
  ]) {
    assert.ok(commands.includes(command), `${command} should be registered`);
  }
}

module.exports = { run };
