#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${IMAGE_URI:?IMAGE_URI is required}"
: "${MCP_SERVER_URL:?MCP_SERVER_URL is required}"
: "${OPENAI_SECRET_ARN:?OPENAI_SECRET_ARN is required}"
: "${TASK_EXECUTION_ROLE_ARN:?TASK_EXECUTION_ROLE_ARN is required}"
: "${TASK_ROLE_ARN:?TASK_ROLE_ARN is required}"
: "${LOG_GROUP:?LOG_GROUP is required}"

TASK_FAMILY="${TASK_FAMILY:-skthon-dev-codex-agent}"
CODEX_MODEL="${CODEX_MODEL:-gpt-5.6-luna}"

task_definition="$(mktemp)"
trap 'rm -f "$task_definition"' EXIT

jq -n \
  --arg family "$TASK_FAMILY" \
  --arg image "$IMAGE_URI" \
  --arg mcp "$MCP_SERVER_URL" \
  --arg model "$CODEX_MODEL" \
  --arg secret "$OPENAI_SECRET_ARN" \
  --arg executionRole "$TASK_EXECUTION_ROLE_ARN" \
  --arg taskRole "$TASK_ROLE_ARN" \
  --arg logGroup "$LOG_GROUP" \
  '{
    family: $family,
    requiresCompatibilities: ["FARGATE"],
    networkMode: "awsvpc",
    cpu: "1024",
    memory: "2048",
    executionRoleArn: $executionRole,
    taskRoleArn: $taskRole,
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    containerDefinitions: [{
      name: "codex-agent",
      image: $image,
      essential: true,
      environment: [
        {name: "MCP_SERVER_URL", value: $mcp},
        {name: "CODEX_MODEL", value: $model}
      ],
      secrets: [{name: "OPENAI_API_KEY", valueFrom: $secret}],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": $logGroup,
          "awslogs-region": env.AWS_REGION,
          "awslogs-stream-prefix": "task"
        }
      }
    }]
  }' > "$task_definition"

aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json "file://$task_definition" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text
