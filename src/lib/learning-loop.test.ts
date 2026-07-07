import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMistakeOutcomeWithDb, applyReviewOutcomeWithDb, reattemptMistakeWithDb } from "./repository";

function createKnowledgeTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE knowledge_points (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '未学',
      mastery INTEGER NOT NULL DEFAULT 0,
      reviews INTEGER NOT NULL DEFAULT 0,
      last_review TEXT,
      next_review TEXT
    );

    CREATE TABLE mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      subject_code TEXT,
      knowledge_point_id TEXT,
      title TEXT NOT NULL,
      cause TEXT NOT NULL DEFAULT '',
      next_review TEXT,
      graduated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      knowledge_point_id TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    );
  `);
}

describe("learning loop outcomes", () => {
  it("turns strong review scores into higher mastery and later review dates", () => {
    const db = new Database(":memory:");
    createKnowledgeTable(db);
    db.prepare("INSERT INTO knowledge_points (id, mastery, reviews, status) VALUES ('kp-1', 68, 2, '学习中')").run();

    applyReviewOutcomeWithDb(db, { knowledgePointId: "kp-1", day: "2026-07-07", score: 3 });

    expect(db.prepare("SELECT mastery, reviews, status, last_review, next_review FROM knowledge_points WHERE id = 'kp-1'").get()).toEqual({
      mastery: 84,
      reviews: 3,
      status: "已掌握",
      last_review: "2026-07-07",
      next_review: "2026-07-23",
    });
  });

  it("turns mistakes into lower mastery and a next-day review", () => {
    const db = new Database(":memory:");
    createKnowledgeTable(db);
    db.prepare("INSERT INTO knowledge_points (id, mastery, reviews, status) VALUES ('kp-2', 55, 1, '学习中')").run();

    applyMistakeOutcomeWithDb(db, { knowledgePointId: "kp-2", day: "2026-07-07" });

    expect(db.prepare("SELECT mastery, status, next_review FROM knowledge_points WHERE id = 'kp-2'").get()).toEqual({
      mastery: 40,
      status: "学习中",
      next_review: "2026-07-08",
    });
  });

  it("graduates a reattempted mistake and records a review outcome", () => {
    const db = new Database(":memory:");
    createKnowledgeTable(db);
    db.prepare("INSERT INTO knowledge_points (id, mastery, reviews, status) VALUES ('kp-3', 40, 1, '学习中')").run();
    db.prepare(`
      INSERT INTO mistakes (id, day, knowledge_point_id, title, next_review, graduated)
      VALUES (7, '2026-07-06', 'kp-3', 'PCA mistake', '2026-07-07', 0)
    `).run();

    const result = reattemptMistakeWithDb(db, { id: 7, day: "2026-07-07", score: 3 });

    expect(result).toMatchObject({ id: 7, graduated: 1 });
    expect(db.prepare("SELECT mastery, reviews, status FROM knowledge_points WHERE id = 'kp-3'").get()).toEqual({
      mastery: 56,
      reviews: 2,
      status: "学习中",
    });
    expect(db.prepare("SELECT score, note FROM review_events WHERE knowledge_point_id = 'kp-3'").get()).toEqual({
      score: 3,
      note: "错题回炉",
    });
  });
});
