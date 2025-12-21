-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║                    TEMPORAL KNOWLEDGE GRAPH SCHEMA                          ║
-- ║                                                                              ║
-- ║  The foundation for Foldera's moat: tracking commitments, conflicts, and    ║
-- ║  entity patterns over time. This is NOT just a data store - it's a brain    ║
-- ║  that learns and gets smarter with every interaction.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";  -- For OpenAI embeddings

-- ============================================================================
-- ENTITIES: People, teams, companies
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Type
  type TEXT NOT NULL CHECK (type IN ('person', 'team', 'company', 'system')),
  
  -- Identity
  primary_email TEXT,
  emails TEXT[] NOT NULL DEFAULT '{}',
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  
  -- Organization
  company TEXT,
  domain TEXT,
  role TEXT,
  
  -- Behavioral patterns (JSONB for flexibility as schema evolves)
  patterns JSONB DEFAULT '{
    "avgResponseTimeHours": null,
    "responseTimeByDayOfWeek": {},
    "preferredCommunicationChannel": null,
    "commitmentFulfillmentRate": 0.5,
    "avgDeliveryVsDeadline": 0,
    "commitmentCategories": {},
    "typicalMessageLength": "normal",
    "usesDeadlines": false,
    "followUpFrequency": 0,
    "ghostingRisk": 0.2,
    "lastMinuteRisk": 0.2,
    "overcommitmentSignals": 0,
    "sentimentTrend": 0,
    "conflictHistory": 0,
    "overallReliabilityScore": 50,
    "patternsUpdatedAt": null,
    "sampleSize": 0
  }'::jsonb,
  
  -- Relationship metadata
  relationship_strength INTEGER DEFAULT 50 CHECK (relationship_strength BETWEEN 0 AND 100),
  last_interaction TIMESTAMPTZ,
  total_interactions INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_entities_user_id ON entities(user_id);
CREATE INDEX idx_entities_primary_email ON entities(primary_email);
CREATE INDEX idx_entities_emails ON entities USING GIN(emails);
CREATE INDEX idx_entities_domain ON entities(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_entities_relationship_strength ON entities(relationship_strength DESC);

-- Ensure primary_email is unique per user
CREATE UNIQUE INDEX idx_entities_user_primary_email ON entities(user_id, primary_email) 
  WHERE primary_email IS NOT NULL;

-- ============================================================================
-- COMMITMENTS: The atomic unit of business trust
-- ============================================================================

CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- WHO
  promisor_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  promisee_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  stakeholder_ids UUID[] DEFAULT '{}',
  
  -- WHAT
  description TEXT NOT NULL,
  canonical_form TEXT NOT NULL,  -- Normalized form for deduplication
  category TEXT NOT NULL CHECK (category IN (
    'deliver_document',
    'deliver_artifact',
    'schedule_meeting',
    'provide_information',
    'make_decision',
    'make_introduction',
    'follow_up',
    'review_approve',
    'payment_financial',
    'attend_participate',
    'other'
  )),
  
  -- WHEN
  made_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  implied_due_at TIMESTAMPTZ,
  due_confidence FLOAT CHECK (due_confidence BETWEEN 0 AND 1),
  
  -- WHERE (source)
  source TEXT NOT NULL CHECK (source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'slack', 'notion', 'drive', 'dropbox',
    'uploaded_document', 'manual_entry'
  )),
  source_id TEXT NOT NULL,
  source_context TEXT,  -- Surrounding text for audit trail
  thread_id TEXT,
  
  -- STATUS
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'at_risk',
    'likely_broken',
    'fulfilled',
    'explicitly_cancelled',
    'implicitly_void',
    'disputed'
  )),
  status_history JSONB DEFAULT '[]'::jsonb,
  
  -- RISK
  risk_score INTEGER DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  
  -- RESOLUTION
  resolution JSONB,  -- { outcome, resolvedAt, feedback, impactScore }
  
  -- GRAPH (relationships to other commitments)
  related_commitment_ids UUID[] DEFAULT '{}',
  conflicts_with_ids UUID[] DEFAULT '{}',
  
  -- EMBEDDINGS (for semantic search)
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_commitments_user_id ON commitments(user_id);
CREATE INDEX idx_commitments_status ON commitments(status);
CREATE INDEX idx_commitments_user_status ON commitments(user_id, status);
CREATE INDEX idx_commitments_due_at ON commitments(due_at) WHERE status IN ('active', 'at_risk');
CREATE INDEX idx_commitments_implied_due_at ON commitments(implied_due_at) WHERE status IN ('active', 'at_risk');
CREATE INDEX idx_commitments_promisor ON commitments(promisor_id);
CREATE INDEX idx_commitments_promisee ON commitments(promisee_id);
CREATE INDEX idx_commitments_made_at ON commitments(made_at DESC);
CREATE INDEX idx_commitments_risk_score ON commitments(risk_score DESC) WHERE status = 'active';
CREATE INDEX idx_commitments_source ON commitments(source);
CREATE INDEX idx_commitments_category ON commitments(category);

-- Vector similarity search (for finding related commitments)
CREATE INDEX idx_commitments_embedding ON commitments 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- CONFLICTS: When reality doesn't add up
-- ============================================================================

CREATE TABLE IF NOT EXISTS conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Type & Severity
  type TEXT NOT NULL CHECK (type IN (
    'commitment_vs_commitment',
    'commitment_vs_calendar',
    'commitment_vs_capacity',
    'amount_mismatch',
    'date_mismatch',
    'term_contradiction',
    'expectation_mismatch',
    'ghosting_detected',
    'overcommitment',
    'dependency_broken'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  
  -- What's conflicting
  signal_ids TEXT[] NOT NULL,  -- References to signals table
  commitment_ids UUID[] DEFAULT '{}',  -- References to commitments
  
  -- The story (for humans)
  headline TEXT NOT NULL,
  narrative TEXT NOT NULL,
  
  -- Who's affected
  stakeholder_ids UUID[] DEFAULT '{}',
  
  -- Temporal context
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  relevant_until TIMESTAMPTZ,
  urgency JSONB NOT NULL,  -- { level, reason, nextEscalation }
  
  -- Business impact
  estimated_impact JSONB,  -- { financial, reputational, operational }
  
  -- Resolution
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'acknowledged',
    'resolved',
    'false_positive'
  )),
  resolution JSONB,  -- { resolvedAt, method, actionTaken, notes }
  
  -- Pre-drafted solutions
  suggested_actions JSONB DEFAULT '[]'::jsonb,
  
  -- Learning (user feedback)
  user_feedback JSONB,  -- { wasReal, wasImportant, actionTaken, suggestionQuality }
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_conflicts_user_id ON conflicts(user_id);
CREATE INDEX idx_conflicts_status ON conflicts(status);
CREATE INDEX idx_conflicts_user_status ON conflicts(user_id, status);
CREATE INDEX idx_conflicts_severity ON conflicts(severity) WHERE status = 'active';
CREATE INDEX idx_conflicts_detected_at ON conflicts(detected_at DESC);
CREATE INDEX idx_conflicts_type ON conflicts(type);
CREATE INDEX idx_conflicts_relevant_until ON conflicts(relevant_until) WHERE relevant_until IS NOT NULL;

-- ============================================================================
-- SIGNALS: Immutable observations from the outside world
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Source
  source TEXT NOT NULL CHECK (source IN (
    'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
    'slack', 'notion', 'drive', 'dropbox',
    'uploaded_document', 'manual_entry'
  )),
  source_id TEXT NOT NULL,  -- ID in the source system
  
  -- Content (IMMUTABLE)
  type TEXT NOT NULL CHECK (type IN (
    'email_sent',
    'email_received',
    'calendar_event',
    'calendar_invite',
    'slack_message',
    'document_created',
    'document_modified',
    'document_shared',
    'task_created',
    'task_completed'
  )),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,  -- For deduplication
  
  -- Metadata
  author TEXT NOT NULL,
  recipients TEXT[] DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Extraction results (populated after processing)
  extracted_entity_ids UUID[] DEFAULT '{}',
  extracted_commitment_ids UUID[] DEFAULT '{}',
  extracted_dates JSONB DEFAULT '[]'::jsonb,
  extracted_amounts JSONB DEFAULT '[]'::jsonb,
  
  -- Processing state
  processed BOOLEAN DEFAULT FALSE,
  processing_version INTEGER DEFAULT 1,  -- Schema version for reprocessing
  processing_error TEXT,
  
  -- Embeddings (for semantic search)
  embedding vector(1536),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_source ON signals(source);
CREATE INDEX idx_signals_source_id ON signals(source_id);
CREATE INDEX idx_signals_content_hash ON signals(content_hash);
CREATE INDEX idx_signals_occurred_at ON signals(occurred_at DESC);
CREATE INDEX idx_signals_author ON signals(author);
CREATE INDEX idx_signals_processed ON signals(processed) WHERE processed = FALSE;
CREATE INDEX idx_signals_ingested_at ON signals(ingested_at DESC);

-- Ensure no duplicate signals
CREATE UNIQUE INDEX idx_signals_user_content_hash ON signals(user_id, content_hash);

-- Vector similarity search
CREATE INDEX idx_signals_embedding ON signals 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- FEEDBACK: Learning from user interactions (THE MOAT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- What we showed them
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'commitment_extraction',
    'conflict_detection',
    'deadline_prediction',
    'risk_assessment',
    'suggested_action'
  )),
  
  -- References (polymorphic)
  commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,
  conflict_id UUID REFERENCES conflicts(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  
  -- What happened
  was_accurate BOOLEAN,
  was_important BOOLEAN,
  user_action TEXT,  -- 'used_suggestion', 'resolved_differently', 'ignored', 'false_positive'
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),  -- Star rating if applicable
  notes TEXT,
  
  -- For training
  source_text TEXT,  -- Original text we analyzed
  extracted_text TEXT,  -- What we extracted
  correct_text TEXT,  -- What it should have been (if we were wrong)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_user_id ON knowledge_feedback(user_id);
CREATE INDEX idx_feedback_type ON knowledge_feedback(feedback_type);
CREATE INDEX idx_feedback_was_accurate ON knowledge_feedback(was_accurate);
CREATE INDEX idx_feedback_commitment_id ON knowledge_feedback(commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX idx_feedback_conflict_id ON knowledge_feedback(conflict_id) WHERE conflict_id IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commitments_updated_at
  BEFORE UPDATE ON commitments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conflicts_updated_at
  BEFORE UPDATE ON conflicts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS (documentation)
-- ============================================================================

COMMENT ON TABLE entities IS 'People, teams, and companies we interact with. Tracks behavioral patterns over time (the moat).';
COMMENT ON TABLE commitments IS 'Promises made by or to the user. The atomic unit of business trust.';
COMMENT ON TABLE conflicts IS 'Detected contradictions, impossibilities, and risks across commitments and signals.';
COMMENT ON TABLE signals IS 'Immutable observations from external systems (emails, calendar, etc).';
COMMENT ON TABLE knowledge_feedback IS 'User feedback on AI predictions. Used to improve accuracy over time.';

COMMENT ON COLUMN entities.patterns IS 'JSONB store for behavioral patterns. Flexible schema that evolves as we learn more.';
COMMENT ON COLUMN commitments.embedding IS 'OpenAI embedding for semantic similarity search and conflict detection.';
COMMENT ON COLUMN commitments.canonical_form IS 'Normalized representation for deduplication (e.g., "DELIVER:document:Q4_deck").';
COMMENT ON COLUMN conflicts.suggested_actions IS 'AI-generated solutions with draft emails, ready to send.';
COMMENT ON COLUMN knowledge_feedback.was_accurate IS 'Ground truth for training: was our prediction correct?';

