DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_usage'
      AND column_name = 'call_type'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_usage'
      AND column_name = 'endpoint'
  ) THEN
    ALTER TABLE public.api_usage RENAME COLUMN call_type TO endpoint;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_usage'
      AND column_name = 'endpoint'
  ) THEN
    ALTER TABLE public.api_usage ADD COLUMN endpoint TEXT;
  END IF;
END $$;

ALTER TABLE public.api_usage
  ALTER COLUMN endpoint SET DEFAULT 'unknown';

UPDATE public.api_usage
SET endpoint = 'unknown'
WHERE endpoint IS NULL;

ALTER TABLE public.api_usage
  ALTER COLUMN endpoint SET NOT NULL;

COMMENT ON COLUMN public.api_usage.endpoint IS
  'Logical endpoint or call site for the model request.';
