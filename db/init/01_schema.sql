-- =============================================================================
-- InterviewOS — MySQL 8.0 Schema
-- =============================================================================
-- Loaded automatically by Docker on first container start.
-- Zero writes during a live interview (all events stay in-memory EventStore).
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- 1. Interview Sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sessions (
    id            VARCHAR(36)  NOT NULL,
    status        ENUM('setup','active','completed','abandoned') NOT NULL DEFAULT 'setup',
    job_desc      TEXT         NOT NULL,
    resume        TEXT         NOT NULL,
    readiness_score INT        DEFAULT NULL,
    recovery_score  INT        DEFAULT NULL,   -- 0-100; adaptability under pushback
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Interview Questions (generated in setup phase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_questions (
    id            INT          NOT NULL AUTO_INCREMENT,
    session_id    VARCHAR(36)  NOT NULL,
    sequence      INT          NOT NULL,          -- question order (1-based)
    question      TEXT         NOT NULL,
    type          ENUM('Behavioral','Technical') NOT NULL,
    focus_area    VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Chat Events (bulk-written AFTER interview ends)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_events (
    id            INT          NOT NULL AUTO_INCREMENT,
    session_id    VARCHAR(36)  NOT NULL,
    sequence      INT          NOT NULL,          -- monotonically increasing
    role          ENUM('user','assistant')        NOT NULL,
    content       TEXT         NOT NULL,
    event_type    VARCHAR(50)  NOT NULL DEFAULT 'chat',  -- 'chat' | 'code_submit' | 'code_result'
    metadata      JSON         DEFAULT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Shadow Compiler Reports (bulk-written AFTER interview ends)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shadow_reports (
    id                  INT          NOT NULL AUTO_INCREMENT,
    session_id          VARCHAR(36)  NOT NULL,
    event_sequence      INT          NOT NULL,    -- links to chat_events.sequence
    correct             BOOLEAN      NOT NULL,
    correctness_score   INT          NOT NULL,    -- 0-100
    time_complexity     VARCHAR(50)  DEFAULT NULL,
    space_complexity    VARCHAR(50)  DEFAULT NULL,
    issues              JSON         DEFAULT NULL,
    feedback            TEXT         DEFAULT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Final STAR Evaluations (written AFTER interview ends)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
    id               INT          NOT NULL AUTO_INCREMENT,
    session_id       VARCHAR(36)  NOT NULL UNIQUE,
    overall_score    INT          DEFAULT NULL,
    recommendation   VARCHAR(50)  DEFAULT NULL,
    star_breakdown   JSON         DEFAULT NULL,
    strengths        JSON         DEFAULT NULL,
    weaknesses       JSON         DEFAULT NULL,
    ideal_rewrite    TEXT         DEFAULT NULL,
    raw_markdown     TEXT         DEFAULT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Resume Claims (written during setup phase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resume_claims (
    id            INT          NOT NULL AUTO_INCREMENT,
    session_id    VARCHAR(36)  NOT NULL,
    claim_text    TEXT         NOT NULL,
    category      VARCHAR(100) DEFAULT NULL,
    skill_tags    JSON         DEFAULT NULL,
    importance    INT          DEFAULT NULL,      -- 1-5
    interview_risk VARCHAR(10) DEFAULT NULL,      -- High | Medium | Low
    risk_rationale TEXT        DEFAULT NULL,      -- why interviewer will push back
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. Job Fit Analyses (written during setup phase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_fit_analyses (
    id               INT          NOT NULL AUTO_INCREMENT,
    session_id       VARCHAR(36)  NOT NULL UNIQUE,
    required_skills  JSON         DEFAULT NULL,
    readiness_score  INT          DEFAULT NULL,   -- 0-100
    skill_gaps       JSON         DEFAULT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
