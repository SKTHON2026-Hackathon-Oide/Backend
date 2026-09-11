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

if [ -n "${CODEX_CA_CERTIFICATE_BASE64:-}" ]; then
  certificate_path=/tmp/codex-custom-ca.pem
  if ! printf '%s' "$CODEX_CA_CERTIFICATE_BASE64" | base64 -d >"$certificate_path"; then
    echo "CODEX_CA_CERTIFICATE_BASE64 must contain a base64-encoded PEM bundle." >&2
    exit 64
  fi
  export CODEX_CA_CERTIFICATE="$certificate_path"
fi

if ! printf '%s\n' "$OPENAI_API_KEY" | codex login --with-api-key >/tmp/codex-login.log 2>&1; then
  echo "Codex API key login failed." >&2
  cat /tmp/codex-login.log >&2
  exit 65
fi

if [ -n "${INPUT_S3_URI:-}" ]; then
  if ! aws s3 cp "$INPUT_S3_URI" /tmp/recommendation-request.json; then
    echo "Failed to download recommendation input from S3." >&2
    exit 66
  fi
else
  cat > /tmp/recommendation-request.json
fi

codex mcp add location-recommendation --url "$MCP_SERVER_URL" >/dev/null

prompt_file=/opt/recommendation-system-prompt.md
if [ ! -s "$prompt_file" ]; then
  echo "Recommendation system prompt is missing: $prompt_file" >&2
  exit 68
fi
cp "$prompt_file" /tmp/prompt.txt

if ! timeout --signal=TERM --kill-after=5s 105s codex exec \
  --ephemeral \
  --sandbox danger-full-access \
  --skip-git-repo-check \
  --model "${CODEX_MODEL:-gpt-5.6-luna}" \
  --output-schema /opt/recommendation-output.schema.json \
  --output-last-message /tmp/final.json \
  "$(cat /tmp/prompt.txt)" \
  >/tmp/codex.log 2>&1; then
  cat /tmp/codex.log >&2
  exit 1
fi

if [ ! -s /tmp/final.json ] || [ -z "$(tr -d '[:space:]' < /tmp/final.json)" ]; then
  echo "Codex agent completed without a final JSON response." >&2
  cat /tmp/codex.log >&2
  exit 1
fi

printf '%s\n' '__CODEX_RECOMMENDATION_OUTPUT_BEGIN__'
cat /tmp/final.json
printf '%s\n' '__CODEX_RECOMMENDATION_OUTPUT_END__'

if [ -n "${OUTPUT_S3_URI:-}" ]; then
  if ! aws s3 cp /tmp/final.json "$OUTPUT_S3_URI"; then
    echo "Failed to upload recommendation output to S3." >&2
    exit 67
  fi
fi
