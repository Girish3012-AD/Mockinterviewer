-- =============================================================================
-- InterviewOS — Phase 4/5 migration for EXISTING MySQL databases
-- Run manually once against a DB created before Phase 4/5.
-- Fresh Docker installs already include these columns via 01_schema.sql.
-- =============================================================================

ALTER TABLE interview_sessions
    ADD COLUMN recovery_score INT DEFAULT NULL;

ALTER TABLE resume_claims
    ADD COLUMN interview_risk VARCHAR(10) DEFAULT NULL;

ALTER TABLE resume_claims
    ADD COLUMN risk_rationale TEXT DEFAULT NULL;
