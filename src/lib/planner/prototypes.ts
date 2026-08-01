import type Database from "better-sqlite3";
import { createECDH, randomBytes } from "node:crypto";
import webPush from "web-push";

export type PlannerFts5Probe = {
  enabled: boolean;
  asciiMatch: boolean;
  chinesePhraseMatch: boolean;
  chineseShortTokenMatch: boolean;
};

export function probePlannerFts5(db: Database.Database): PlannerFts5Probe {
  const enabled = Boolean(
    (db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled").get() as { enabled: number }).enabled,
  );
  if (!enabled) return { enabled, asciiMatch: false, chinesePhraseMatch: false, chineseShortTokenMatch: false };
  db.exec("CREATE VIRTUAL TABLE planner_fts5_probe USING fts5(title, notes, tokenize='trigram')");
  db.prepare("INSERT INTO planner_fts5_probe(title, notes) VALUES (?, ?)")
    .run("review matrix", "复习线性代数矩阵");
  const matches = (query: string) => Boolean(
    db.prepare("SELECT 1 FROM planner_fts5_probe WHERE planner_fts5_probe MATCH ? LIMIT 1").get(query),
  );
  const result = {
    enabled,
    asciiMatch: matches("matrix"),
    chinesePhraseMatch: matches("线性代数"),
    chineseShortTokenMatch: matches("矩阵"),
  };
  db.exec("DROP TABLE planner_fts5_probe");
  return result;
}

export function buildLocalWebPushPrototype(): {
  endpoint: string;
  headers: Record<string, string>;
  bodyBytes: number;
  vapidPublicKey: string;
} {
  const vapid = webPush.generateVAPIDKeys();
  const recipient = createECDH("prime256v1");
  recipient.generateKeys();
  const subscription = {
    endpoint: "https://push.example.test/subscriptions/planner-phase-0",
    keys: {
      p256dh: recipient.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const request = webPush.generateRequestDetails(subscription, JSON.stringify({
    title: "计划提醒",
    body: "有一项计划到时",
    url: "/tasks?focus=prototype",
  }), {
    TTL: 60,
    vapidDetails: {
      subject: "mailto:planner@example.test",
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
    },
  });
  return {
    endpoint: request.endpoint,
    headers: request.headers,
    bodyBytes: Buffer.byteLength(request.body ?? ""),
    vapidPublicKey: vapid.publicKey,
  };
}
