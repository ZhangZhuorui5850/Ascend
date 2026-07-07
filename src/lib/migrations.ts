import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Migration = {
  version: string;
  sql: string;
};

type MigrationOptions = {
  uploadRoot?: string;
};

const migrations: Migration[] = [
  {
    version: "0001_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_pulled_seq INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS entity_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        op_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        base_version INTEGER,
        patch_json TEXT NOT NULL DEFAULT '{}',
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        device_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        field TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        base_version INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope_type, scope_id, field)
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        local_json TEXT NOT NULL,
        incoming_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_entity_changes_seq ON entity_changes(seq);
      CREATE INDEX IF NOT EXISTS idx_entity_changes_entity ON entity_changes(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_scope ON drafts(scope_type, scope_id, field);
    `,
  },
  {
    version: "0002_auth_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_hint TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `,
  },
  {
    version: "0003_asset_blobs",
    sql: `
      CREATE TABLE IF NOT EXISTS blobs (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        storage_key TEXT NOT NULL UNIQUE,
        ref_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        blob_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        received_bytes INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (blob_id) REFERENCES blobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_blobs_sha256 ON blobs(sha256);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status, expires_at);
    `,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function runMigrations(database: Database.Database, options: MigrationOptions = {}): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT NOT NULL
    );
  `);

  const applied = new Map(
    database
      .prepare("SELECT version, checksum FROM schema_migrations")
      .all()
      .map((row) => {
        const migration = row as { version: string; checksum: string };
        return [migration.version, migration.checksum];
      }),
  );
  const insert = database.prepare("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)");

  for (const migration of migrations) {
    const expectedChecksum = checksum(migration.sql);
    const appliedChecksum = applied.get(migration.version);
    if (appliedChecksum) {
      if (appliedChecksum !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch for ${migration.version}`);
      }
      continue;
    }

    const apply = database.transaction(() => {
      database.exec(migration.sql);
      insert.run(migration.version, expectedChecksum);
    });

    apply();
  }

  backfillAssetBlobs(database, options.uploadRoot);
}

export function getAppliedMigrations(database: Database.Database): string[] {
  const exists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();

  if (!exists) return [];

  return database
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all()
    .map((row) => (row as { version: string }).version);
}

function backfillAssetBlobs(database: Database.Database, uploadRoot?: string): void {
  if (!uploadRoot || !tableExists(database, "assets") || !tableExists(database, "blobs")) return;

  const assets = database.prepare("SELECT id, original_name, relative_path FROM assets").all() as Array<{
    id: number;
    original_name: string;
    relative_path: string;
  }>;
  if (!assets.length) return;

  const insertBlob = database.prepare(`
    INSERT INTO blobs (id, sha256, size, mime_type, storage_key, ref_count)
    VALUES (@id, @sha256, @size, @mimeType, @storageKey, 0)
    ON CONFLICT(id) DO UPDATE SET
      size = excluded.size,
      storage_key = excluded.storage_key
  `);
  const updateAsset = database.prepare("UPDATE assets SET relative_path = ?, size = ? WHERE id = ?");

  const backfill = database.transaction(() => {
    for (const asset of assets) {
      const sourcePath = resolveAssetPathForRoot(uploadRoot, asset.relative_path);
      if (!existsSync(/*turbopackIgnore: true*/ sourcePath)) continue;

      const bytes = readFileSync(/*turbopackIgnore: true*/ sourcePath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storageKey = storageKeyForSha(sha256);
      const targetPath = resolveAssetPathForRoot(uploadRoot, storageKey);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      if (!existsSync(/*turbopackIgnore: true*/ targetPath)) {
        copyFileSync(/*turbopackIgnore: true*/ sourcePath, /*turbopackIgnore: true*/ targetPath);
      }

      const size = statSync(/*turbopackIgnore: true*/ targetPath).size;
      insertBlob.run({
        id: sha256,
        sha256,
        size,
        mimeType: "",
        storageKey,
      });
      updateAsset.run(storageKey, size, asset.id);
    }

    database.prepare(`
      UPDATE blobs
      SET ref_count = (
        SELECT COUNT(*)
        FROM assets
        WHERE assets.relative_path = blobs.storage_key
      )
    `).run();
  });

  backfill();
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function storageKeyForSha(sha256: string): string {
  return path.posix.join("blobs", sha256.slice(0, 2), sha256);
}

function resolveAssetPathForRoot(uploadRoot: string, relativePath: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ uploadRoot);
  const absolute = path.resolve(/*turbopackIgnore: true*/ root, relativePath);
  if (absolute !== root && absolute.startsWith(`${root}${path.sep}`)) return absolute;
  throw new Error("Invalid asset path");
}
