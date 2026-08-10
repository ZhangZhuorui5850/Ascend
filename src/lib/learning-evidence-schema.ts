/**
 * Canonical learning metadata and append-oriented evidence storage.
 *
 * This SQL is shared by the fresh-database initializer and the append-only
 * migration. Parent IDs are globally unique in the current schema, while the
 * guard triggers additionally enforce that every relation belongs to the row's
 * workspace.
 */
/** Immutable SQL payload for migration 0030. Future schema changes append a new migration/constant. */
export const LEARNING_EVIDENCE_SCHEMA_V0030_SQL = `
  CREATE TABLE IF NOT EXISTS learning_task_links (
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
    knowledge_point_id TEXT,
    activity_type TEXT NOT NULL DEFAULT 'unspecified'
      CHECK (activity_type IN ('unspecified', 'study', 'practice', 'recall', 'review', 'mock', 'mixed')),
    completion_criteria TEXT NOT NULL DEFAULT '' CHECK (length(completion_criteria) <= 500),
    planned_verification_method TEXT NOT NULL DEFAULT ''
      CHECK (length(planned_verification_method) <= 200),
    source_type TEXT NOT NULL DEFAULT '' CHECK (length(source_type) <= 50),
    source_id TEXT NOT NULL DEFAULT '' CHECK (length(source_id) <= 200),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    PRIMARY KEY (workspace_id, task_id),
    CHECK ((source_type = '' AND source_id = '') OR (source_type != '' AND source_id != '')),
    CHECK (knowledge_point_id IS NULL OR length(trim(knowledge_point_id)) > 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES planner_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_learning_task_links_workspace_point
    ON learning_task_links(workspace_id, knowledge_point_id, task_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_task_links_source
    ON learning_task_links(workspace_id, source_type, source_id)
    WHERE source_type != '' AND source_id != '';

  CREATE TABLE IF NOT EXISTS learning_evidence (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    workspace_id TEXT NOT NULL,
    task_id TEXT,
    completion_cycle INTEGER NOT NULL CHECK (completion_cycle >= 1),
    day TEXT NOT NULL CHECK (length(day) = 10),
    knowledge_point_id TEXT,
    activity_type TEXT NOT NULL DEFAULT 'unspecified'
      CHECK (activity_type IN ('unspecified', 'study', 'practice', 'recall', 'review', 'mock', 'mixed')),
    actual_minutes INTEGER CHECK (actual_minutes BETWEEN 1 AND 1440),
    output TEXT NOT NULL DEFAULT '' CHECK (length(output) <= 4000),
    outcome TEXT NOT NULL DEFAULT '' CHECK (length(outcome) <= 100),
    difficulty TEXT NOT NULL DEFAULT '' CHECK (length(difficulty) <= 100),
    verification_method TEXT NOT NULL DEFAULT '' CHECK (length(verification_method) <= 200),
    verification_result TEXT NOT NULL DEFAULT '' CHECK (length(verification_result) <= 1000),
    verification_outcome TEXT NOT NULL DEFAULT '' CHECK (length(verification_outcome) <= 100),
    confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
    source_type TEXT NOT NULL DEFAULT '' CHECK (length(source_type) <= 50),
    source_id TEXT NOT NULL DEFAULT '' CHECK (length(source_id) <= 200),
    idempotency_key TEXT NOT NULL CHECK (
      length(trim(idempotency_key)) > 0 AND length(idempotency_key) <= 200
    ),
    corrected_by TEXT,
    voided_at TEXT,
    void_reason TEXT NOT NULL DEFAULT '' CHECK (length(void_reason) <= 500),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (workspace_id, idempotency_key),
    CHECK ((source_type = '' AND source_id = '') OR (source_type != '' AND source_id != '')),
    CHECK (task_id IS NULL OR length(trim(task_id)) > 0),
    CHECK (knowledge_point_id IS NULL OR length(trim(knowledge_point_id)) > 0),
    CHECK (corrected_by IS NULL OR corrected_by != id),
    CHECK (
      (voided_at IS NULL AND void_reason = '')
      OR (voided_at IS NOT NULL AND length(trim(void_reason)) > 0)
    ),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES planner_tasks(id) ON DELETE RESTRICT,
    FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE RESTRICT,
    FOREIGN KEY (corrected_by) REFERENCES learning_evidence(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_learning_evidence_workspace_task
    ON learning_evidence(workspace_id, task_id, completion_cycle DESC, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_evidence_workspace_day
    ON learning_evidence(workspace_id, day DESC, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_evidence_workspace_point
    ON learning_evidence(workspace_id, knowledge_point_id, day DESC, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_evidence_workspace_active
    ON learning_evidence(workspace_id, voided_at, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_evidence_source
    ON learning_evidence(workspace_id, source_type, source_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_evidence_corrected_by
    ON learning_evidence(workspace_id, corrected_by)
    WHERE corrected_by IS NOT NULL;

  CREATE TRIGGER IF NOT EXISTS learning_task_links_task_workspace_insert
  BEFORE INSERT ON learning_task_links
  WHEN NOT EXISTS (
    SELECT 1 FROM planner_tasks
    WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_task_links task workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_task_links_task_workspace_update
  BEFORE UPDATE OF workspace_id, task_id ON learning_task_links
  WHEN NOT EXISTS (
    SELECT 1 FROM planner_tasks
    WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_task_links task workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_task_links_point_workspace_insert
  BEFORE INSERT ON learning_task_links
  WHEN NEW.knowledge_point_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM knowledge_points
    WHERE id = NEW.knowledge_point_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_task_links knowledge workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_task_links_point_workspace_update
  BEFORE UPDATE OF workspace_id, knowledge_point_id ON learning_task_links
  WHEN NEW.knowledge_point_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM knowledge_points
    WHERE id = NEW.knowledge_point_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_task_links knowledge workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_task_workspace_insert
  BEFORE INSERT ON learning_evidence
  WHEN NEW.task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM planner_tasks
    WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence task workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_task_workspace_update
  BEFORE UPDATE OF workspace_id, task_id ON learning_evidence
  WHEN NEW.task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM planner_tasks
    WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence task workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_point_workspace_insert
  BEFORE INSERT ON learning_evidence
  WHEN NEW.knowledge_point_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM knowledge_points
    WHERE id = NEW.knowledge_point_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence knowledge workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_point_workspace_update
  BEFORE UPDATE OF workspace_id, knowledge_point_id ON learning_evidence
  WHEN NEW.knowledge_point_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM knowledge_points
    WHERE id = NEW.knowledge_point_id AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence knowledge workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_correction_workspace_insert
  BEFORE INSERT ON learning_evidence
  WHEN NEW.corrected_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_evidence
    WHERE id = NEW.corrected_by AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence correction workspace mismatch');
  END;

  CREATE TRIGGER IF NOT EXISTS learning_evidence_correction_workspace_update
  BEFORE UPDATE OF workspace_id, corrected_by ON learning_evidence
  WHEN NEW.corrected_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_evidence
    WHERE id = NEW.corrected_by AND workspace_id = NEW.workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'learning_evidence correction workspace mismatch');
  END;
`;
