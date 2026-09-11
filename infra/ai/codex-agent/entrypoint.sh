#!/bin/sh
set -eu

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY is required for the Codex agent container." >&2
  exit 64
fi

if [ -z "${MCP_SERVER_URL:-}" ]; then
  echo "MCP_SERVER_URL is required for the Codex agent container." >&2
  exit 64
fi

cat > /tmp/recommendation-request.json

codex mcp add location-recommendation --url "$MCP_SERVER_URL" >/dev/null

cat > /tmp/prompt.txt <<'PROMPT'
You are a Seoul location-based business recommendation agent.
Read /tmp/recommendation-request.json. You must call the
get_location_recommendation_evidence MCP tool at least once using requestId and buildingId.
Use only the evidence packet and MCP tool output. Do not invent missing local statistics,
floor, area, rent, vacancy, or results outside the candidate business categories.

Return exactly the JSON required by the supplied schema. Select up to five recommendations.
Each score breakdown value must be 0-100. totalScore must equal:
(demand*25 + supplyOpportunity*20 + customerFit*20 + timeFit*15 +
competitionHealth*10 + dataConfidence*10) / 100.
Every evidenceIds entry must be an actual evidenceId returned by the tool or input packet.
PROMPT

if ! codex exec \
  --ephemeral \
  --sandbox read-only \
  --model "${CODEX_MODEL:-gpt-5.6-luna}" \
  --output-schema /opt/recommendation-output.schema.json \
  --output-last-message /tmp/final.json \
  "$(cat /tmp/prompt.txt)" \
  >/tmp/codex.log 2>&1; then
  cat /tmp/codex.log >&2
  exit 1
fi

cat /tmp/final.json
