FROM node:22-slim

LABEL org.opencontainers.image.title="PIDEX Project Sandbox" \
      org.opencontainers.image.description="Local-first PIDEX Project Pipeline sandbox image"

ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    PIDEX_PROJECT_PIPELINE_IMAGE=1

# Keep the sandbox CLI aligned with the locally Astra-tested runtime.
# Existing images/containers require an explicit rebuild/replacement.
ARG PI_CODING_AGENT_VERSION=0.85.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate \
  && npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@${PI_CODING_AGENT_VERSION}" \
  && npm cache clean --force \
  && test "$(pi --version)" = "${PI_CODING_AGENT_VERSION}"

RUN mkdir -p /workspace /pidex-home /pidex-secrets /cache \
  && chown -R node:node /workspace /pidex-home /pidex-secrets /cache \
  && chmod 700 /pidex-secrets

WORKDIR /workspace

CMD ["bash"]
