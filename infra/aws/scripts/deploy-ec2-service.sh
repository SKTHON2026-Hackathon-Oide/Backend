#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${IMAGE_URI:?IMAGE_URI is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${RUNTIME_SECRET_ID:?RUNTIME_SECRET_ID is required}"
: "${SERVICE_KIND:?SERVICE_KIND must be backend or mcp}"

install -d -m 0700 /opt/skthon
runtime_env="/opt/skthon/${SERVICE_NAME}.env"
secret_json="$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$RUNTIME_SECRET_ID" --query SecretString --output text)"

python3 -c '
import json
import sys
destination = sys.argv[1]
payload = json.load(sys.stdin)
with open(destination, "w", encoding="utf-8") as handle:
    for key, value in payload.items():
        if value is not None:
            handle.write(f"{key}={value}\n")
' "$runtime_env" <<<"$secret_json"
chmod 0600 "$runtime_env"

parameter() {
  aws ssm get-parameter --region "$AWS_REGION" --name "$1" --query 'Parameter.Value' --output text
}

append_env() {
  printf '%s=%s\n' "$1" "$2" >> "$runtime_env"
}

config_prefix="${CONFIG_PREFIX:-/skthon/dev/config}"
append_env DB_HOST "$(parameter "$config_prefix/rds-endpoint")"
append_env DB_PORT "$(parameter "$config_prefix/rds-port")"
append_env DB_DATABASE "$(parameter "$config_prefix/rds-database")"
append_env AWS_REGION "$AWS_REGION"

account_id="$(aws sts get-caller-identity --query Account --output text)"
registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"
docker pull "$IMAGE_URI"
docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true

if [ "$SERVICE_KIND" = backend ]; then
  append_env NODE_ENV production
  append_env PORT 3000
  append_env RECOMMENDATION_AGENT_MODE codex
  append_env RECOMMENDATION_AGENT_RUNNER ecs
  append_env ECS_CLUSTER "$(parameter "$config_prefix/ecs-cluster")"
  append_env ECS_TASK_DEFINITION_ARN "$(parameter "$config_prefix/ecs-task-definition-arn")"
  append_env ECS_TASK_SUBNET_IDS "$(parameter "$config_prefix/ecs-task-subnet-ids")"
  append_env ECS_TASK_SECURITY_GROUP_IDS "$(parameter "$config_prefix/ecs-task-security-group-ids")"
  append_env ECS_JOB_BUCKET "$(parameter "$config_prefix/jobs-bucket")"
  append_env RECOMMENDATION_MCP_SERVER_URL "$(parameter "$config_prefix/mcp-server-url")"
  docker run --rm --env-file "$runtime_env" "$IMAGE_URI" npm run migration:run:prod
  docker run -d --name "$SERVICE_NAME" --restart unless-stopped \
    --env-file "$runtime_env" -p 80:3000 "$IMAGE_URI"
  for _ in $(seq 1 30); do
    curl --fail --silent http://127.0.0.1/api/health >/dev/null && exit 0
    sleep 2
  done
elif [ "$SERVICE_KIND" = mcp ]; then
  append_env MCP_PORT 3001
  docker run -d --name "$SERVICE_NAME" --restart unless-stopped \
    --env-file "$runtime_env" -p 3001:3001 "$IMAGE_URI"
  for _ in $(seq 1 30); do
    curl --fail --silent http://127.0.0.1:3001/health >/dev/null && exit 0
    sleep 2
  done
else
  echo "Unknown SERVICE_KIND: $SERVICE_KIND" >&2
  exit 64
fi

docker logs --tail 100 "$SERVICE_NAME" >&2
exit 1
