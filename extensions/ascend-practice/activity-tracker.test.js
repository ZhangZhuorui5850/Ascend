const assert = require("node:assert/strict");
const test = require("node:test");
const { SessionActivityTracker } = require("./activity-tracker");

test("counts focused active time and pauses after idle timeout", () => {
  const tracker = new SessionActivityTracker(60_000);
  tracker.start("session", 5, 0);
  assert.equal(tracker.tick("session", true, 10_000), 15);
  assert.equal(tracker.tick("session", false, 20_000), 15);
  assert.equal(tracker.tick("session", true, 70_000), 15);
  tracker.mark("session", 70_000);
  assert.equal(tracker.tick("session", true, 75_000), 20);
  assert.equal(tracker.end("session"), 20);
});
