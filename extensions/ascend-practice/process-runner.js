const { spawn } = require("node:child_process");

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function runProcess(command, args, input, cwd, timeoutMs, options = {}) {
  const maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const spawnProcess = options.spawnProcess || spawn;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawnProcess(command, args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const output = createBoundedOutput(maxOutputBytes);
    let timedOut = false;
    let settled = false;

    const finish = (code, extraStderr = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (extraStderr) output.appendStderr(Buffer.from(extraStderr));
      resolve({
        code: code ?? -1,
        stdout: output.stdout(),
        stderr: output.stderr(),
        timedOut,
        outputLimited: output.outputLimited(),
        durationMs: Date.now() - startedAt,
      });
    };

    const terminate = () => terminateProcessTree(child, spawnProcess);
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      output.appendStdout(chunk);
      if (output.outputLimited()) terminate();
    });
    child.stderr?.on("data", (chunk) => {
      output.appendStderr(chunk);
      if (output.outputLimited()) terminate();
    });
    child.on("error", (error) => finish(-1, error.message));
    child.on("close", (code) => finish(code));
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

function createBoundedOutput(maxBytes) {
  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let limited = false;

  const append = (chunks, currentBytes, chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = Math.max(0, maxBytes - currentBytes);
    if (bytes.length > remaining) limited = true;
    if (remaining > 0) chunks.push(bytes.subarray(0, remaining));
    return currentBytes + Math.min(bytes.length, remaining);
  };

  return {
    appendStdout(chunk) {
      stdoutBytes = append(stdoutChunks, stdoutBytes, chunk);
    },
    appendStderr(chunk) {
      stderrBytes = append(stderrChunks, stderrBytes, chunk);
    },
    stdout: () => Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: () => Buffer.concat(stderrChunks).toString("utf8"),
    outputLimited: () => limited,
  };
}

function terminateProcessTree(child, spawnProcess = spawn) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try {
      const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      killer.unref?.();
      return;
    } catch {
      child.kill("SIGKILL");
      return;
    }
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  DEFAULT_MAX_OUTPUT_BYTES,
  createBoundedOutput,
  runProcess,
  terminateProcessTree,
};
