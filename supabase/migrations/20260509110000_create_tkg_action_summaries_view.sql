DROP VIEW IF EXISTS public.tkg_action_summaries;

CREATE VIEW public.tkg_action_summaries
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.user_id,
  a.status,
  a.action_type,
  a.confidence,
  a.generated_at,
  a.approved_at,
  a.executed_at,
  a.directive_text,
  a.reason,
  a.skip_reason,
  a.outcome_closed,
  merged.artifact_type,
  merged.artifact_title,
  merged.brief_origin,
  NULLIF(
    LEFT(
      TRIM(
        REGEXP_REPLACE(
          CONCAT_WS(' - ', merged.artifact_title, merged.artifact_body),
          '\s+',
          ' ',
          'g'
        )
      ),
      160
    ),
    ''
  ) AS artifact_preview,
  COALESCE(
    NULLIF(a.execution_result->'discrepancy_card'->>'claim', ''),
    NULLIF(a.directive_text, ''),
    merged.artifact_title
  ) AS discrepancy_claim,
  COALESCE(
    NULLIF(a.execution_result->'discrepancy_card'->>'contradiction', ''),
    CASE
      WHEN COALESCE(a.reason, '') ~* '(but|however|despite|without|missing|mismatch|conflict|contradict|changed|stale|blank|gap|blocked|not reflected|still has no|still lacks|no named|no matching|while)'
        THEN a.reason
      ELSE NULL
    END
  ) AS discrepancy_contradiction,
  COALESCE(
    NULLIF(a.execution_result->'discrepancy_card'->>'risk', ''),
    CASE
      WHEN COALESCE(a.reason, '') ~* '(risk|miss|deadline|blocked|delay|fail|failure|late|slip|window|cost|loss|opportunity|submission|decision|conflict|stale|wrong|expire|close|before|may)'
        THEN a.reason
      ELSE NULL
    END
  ) AS discrepancy_risk,
  COALESCE(
    CASE
      WHEN JSONB_TYPEOF(a.execution_result->'discrepancy_card'->'evidence') = 'array'
        THEN a.execution_result->'discrepancy_card'->'evidence'
      ELSE NULL
    END,
    CASE
      WHEN JSONB_TYPEOF(a.evidence) = 'array'
        THEN a.evidence
      ELSE NULL
    END,
    '[]'::jsonb
  ) AS discrepancy_evidence,
  COALESCE(
    NULLIF(a.execution_result->'discrepancy_card'->>'next_action', ''),
    NULLIF(merged.artifact_recommended_action, ''),
    CASE
      WHEN COALESCE(a.directive_text, '') ~* '(assign|ask|send|update|confirm|confirming|decide|schedule|block|request|draft|finish|complete|submit|notify|move|prepare|attach|upload|resolve|choose|write|create|route|escalate|approve|reject|use|save)'
        THEN a.directive_text
      ELSE NULL
    END
  ) AS discrepancy_next_action,
  COALESCE(
    NULLIF(a.execution_result->'discrepancy_card'->>'why_now', ''),
    NULLIF(a.reason, '')
  ) AS discrepancy_why_now,
  COALESCE(
    CASE
      WHEN JSONB_TYPEOF(a.execution_result->'discrepancy_card'->'source_refs') = 'array'
        THEN a.execution_result->'discrepancy_card'->'source_refs'
      ELSE NULL
    END,
    CASE
      WHEN JSONB_TYPEOF(a.execution_result->'source_refs') = 'array'
        THEN a.execution_result->'source_refs'
      ELSE NULL
    END,
    '[]'::jsonb
  ) AS discrepancy_source_refs,
  CASE
    WHEN COALESCE(a.execution_result->'discrepancy_card'->>'confidence', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN GREATEST(
        0::double precision,
        LEAST(
          1::double precision,
          CASE
            WHEN (a.execution_result->'discrepancy_card'->>'confidence')::double precision > 1
              THEN (a.execution_result->'discrepancy_card'->>'confidence')::double precision / 100
            ELSE (a.execution_result->'discrepancy_card'->>'confidence')::double precision
          END
        )
      )
    WHEN a.confidence IS NULL
      THEN 0.7
    WHEN a.confidence > 1
      THEN GREATEST(0::double precision, LEAST(1::double precision, a.confidence::double precision / 100))
    ELSE GREATEST(0::double precision, LEAST(1::double precision, a.confidence::double precision))
  END AS discrepancy_confidence,
  (
    a.action_type = 'do_nothing'
    OR COALESCE(a.execution_result->>'outcome_type', '') = 'no_send'
    OR COALESCE(a.execution_result->'generation_log'->>'outcome', '') = 'no_send'
    OR a.execution_result->'no_send' = 'true'::jsonb
    OR JSONB_TYPEOF(a.execution_result->'no_send') = 'object'
  ) AS is_no_send,
  COALESCE(
    NULLIF(a.execution_result->'no_send'->>'reason', ''),
    NULLIF(a.execution_result->'generation_log'->>'reason', ''),
    NULLIF(a.reason, '')
  ) AS no_send_reason,
  COALESCE(
    NULLIF(a.execution_result->>'outcome_type', ''),
    NULLIF(a.execution_result->'generation_log'->>'outcome', '')
  ) AS outcome_type,
  NULLIF(a.execution_result->'generation_log'->>'outcome', '') AS generation_outcome
FROM public.tkg_actions AS a
CROSS JOIN LATERAL (
  SELECT
    COALESCE(
      NULLIF(a.artifact->>'type', ''),
      NULLIF(a.execution_result->'artifact'->>'type', '')
    ) AS artifact_type,
    COALESCE(
      NULLIF(a.artifact->>'title', ''),
      NULLIF(a.artifact->>'subject', ''),
      NULLIF(a.artifact->>'heading', ''),
      NULLIF(a.execution_result->'artifact'->>'title', ''),
      NULLIF(a.execution_result->'artifact'->>'subject', ''),
      NULLIF(a.execution_result->'artifact'->>'heading', '')
    ) AS artifact_title,
    COALESCE(
      NULLIF(a.execution_result->>'brief_origin', ''),
      NULLIF(a.artifact->>'brief_origin', ''),
      NULLIF(a.execution_result->'artifact'->>'brief_origin', '')
    ) AS brief_origin,
    COALESCE(
      NULLIF(a.artifact->>'body', ''),
      NULLIF(a.artifact->>'content', ''),
      NULLIF(a.artifact->>'text', ''),
      NULLIF(a.artifact->>'context', ''),
      NULLIF(a.artifact->>'summary', ''),
      NULLIF(a.artifact->>'description', ''),
      NULLIF(a.artifact->>'message', ''),
      NULLIF(a.artifact->>'draft', ''),
      NULLIF(a.execution_result->'artifact'->>'body', ''),
      NULLIF(a.execution_result->'artifact'->>'content', ''),
      NULLIF(a.execution_result->'artifact'->>'text', ''),
      NULLIF(a.execution_result->'artifact'->>'context', ''),
      NULLIF(a.execution_result->'artifact'->>'summary', ''),
      NULLIF(a.execution_result->'artifact'->>'description', ''),
      NULLIF(a.execution_result->'artifact'->>'message', ''),
      NULLIF(a.execution_result->'artifact'->>'draft', '')
    ) AS artifact_body,
    COALESCE(
      NULLIF(a.artifact->>'recommended_action', ''),
      NULLIF(a.artifact->>'recommendation', ''),
      NULLIF(a.execution_result->'artifact'->>'recommended_action', ''),
      NULLIF(a.execution_result->'artifact'->>'recommendation', '')
    ) AS artifact_recommended_action
) AS merged;

REVOKE ALL ON public.tkg_action_summaries FROM PUBLIC;
REVOKE ALL ON public.tkg_action_summaries FROM anon;
GRANT SELECT ON public.tkg_action_summaries TO authenticated;
GRANT SELECT ON public.tkg_action_summaries TO service_role;
