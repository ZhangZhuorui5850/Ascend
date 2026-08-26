const assert = require("node:assert/strict");
const test = require("node:test");
const { createBoundedOutput, runProcess } = require("./process-runner");

test("bounds stdout and stderr independently", () => {
  const output = createBoundedOutput(4);
  output.appendStdout(Buffer.from("abcdef"));
  output.appendStderr(Buffer.from("123456"));
  assert.equal(output.stdout(), "abcd");
  assert.equal(output.stderr(), "1234");
  assert.equal(output.outputLimited(), true);
});

test("terminates a process after the output limit", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "process.stdout.write('x'.repeat(100000)); setInterval(() => {}, 1000)"],
    "",
    process.cwd(),
    5000,
    { maxOutputBytes: 1024 },
  );
  assert.equal(result.outputLimited, true);
  assert.equal(Buffer.byteLength(result.stdout), 1024);
  assert.equal(result.timedOut, false);
});

test("marks timed out processes", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    "",
    process.cwd(),
    30,
    { maxOutputBytes: 1024 },
  );
  assert.equal(result.timedOut, true);
});
