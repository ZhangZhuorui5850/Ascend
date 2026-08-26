class SessionActivityTracker {
  constructor(idleMs = 60_000) {
    this.idleMs = idleMs;
    this.sessions = new Map();
  }

  start(key, initialSeconds = 0, now = Date.now()) {
    const current = this.sessions.get(key);
    if (current) return current.seconds;
    const seconds = Math.max(0, Math.round(Number(initialSeconds) || 0));
    this.sessions.set(key, { seconds, lastActivityAt: now, lastTickAt: now });
    return seconds;
  }

  mark(key, now = Date.now()) {
    const session = this.sessions.get(key);
    if (session) session.lastActivityAt = now;
  }

  tick(key, focused, now = Date.now()) {
    const session = this.sessions.get(key);
    if (!session) return 0;
    const elapsedSeconds = Math.max(0, Math.floor((now - session.lastTickAt) / 1000));
    session.lastTickAt = now;
    if (focused && now - session.lastActivityAt < this.idleMs) session.seconds += elapsedSeconds;
    return session.seconds;
  }

  seconds(key) {
    return this.sessions.get(key)?.seconds || 0;
  }

  end(key) {
    const seconds = this.seconds(key);
    this.sessions.delete(key);
    return seconds;
  }

  clear() {
    this.sessions.clear();
  }
}

module.exports = { SessionActivityTracker };
