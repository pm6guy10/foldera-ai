#!/usr/bin/env bash
# Drain unprocessed signal backlog by calling process-unprocessed-signals in small batches.
# Usage: CRON_SECRET=<your-secret> bash scripts/drain-backlog.sh
#
# Each call processes up to 20 signals (fits in 60s Vercel Hobby timeout).
# Loops until remaining == 0 or max iterations reached.

set -euo pipefail

URL="https://www.foldera.ai/api/cron/process-unprocessed-signals?maxSignals=20"
MAX_ITERATIONS=80  # 80 * 20 = 1600 signals max
SLEEP_BETWEEN=2    # seconds between calls to avoid rate limits

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET env var required"
  echo "Usage: CRON_SECRET=<secret> bash scripts/drain-backlog.sh"
  exit 1
fi

echo "Starting backlog drain..."
echo "URL: $URL"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

total_processed=0

for i in $(seq 1 $MAX_ITERATIONS); do
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$URL" \
    -H "Authorization: Bearer $CRON_SECRET")

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  processed=$(echo "$body" | grep -o '"processed":[0-9]*' | grep -o '[0-9]*' || echo "0")
  remaining=$(echo "$body" | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*' || echo "?")

  total_processed=$((total_processed + processed))

  echo "[$i] HTTP $http_code | processed=$processed remaining=$remaining | total=$total_processed"

  if [ "$http_code" != "200" ]; then
    echo "ERROR: Non-200 response. Body: $body"
    exit 1
  fi

  if [ "$remaining" = "0" ]; then
    echo ""
    echo "Backlog drained! Total processed: $total_processed"
    exit 0
  fi

  if [ "$processed" = "0" ]; then
    echo ""
    echo "No signals processed this round (all quarantined or deferred). Total: $total_processed"
    exit 0
  fi

  sleep $SLEEP_BETWEEN
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS). Total processed: $total_processed, remaining: $remaining"
