FROM node:24-bookworm-slim

WORKDIR /opt/codex-agent
RUN npm install --global @openai/codex
COPY infra/ai/codex-agent/entrypoint.sh /usr/local/bin/run-codex-recommendation
COPY src/modules/recommendations/infrastructure/agents/recommendation-agent-output.schema.json /opt/recommendation-output.schema.json
RUN chmod 0555 /usr/local/bin/run-codex-recommendation

ENTRYPOINT ["/usr/local/bin/run-codex-recommendation"]
