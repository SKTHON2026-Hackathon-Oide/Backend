FROM node:24-bookworm-slim

WORKDIR /opt/codex-agent
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates awscli \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global @openai/codex
COPY infra/ai/codex-agent/entrypoint.sh /usr/local/bin/run-codex-recommendation
COPY infra/ai/codex-agent/recommendation-system-prompt.md /opt/recommendation-system-prompt.md
COPY src/modules/recommendations/infrastructure/agents/recommendation-agent-output.schema.json /opt/recommendation-output.schema.json
RUN chmod 0555 /usr/local/bin/run-codex-recommendation

ENTRYPOINT ["/usr/local/bin/run-codex-recommendation"]
