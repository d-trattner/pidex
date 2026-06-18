FROM node:22-slim

LABEL org.opencontainers.image.title="PIDEX Project Sandbox" \
      org.opencontainers.image.description="Local-first PIDEX Project Pipeline sandbox image"

ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    PIDEX_PROJECT_PIPELINE_IMAGE=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

RUN mkdir -p /workspace /pidex-home /pidex-secrets /cache \
  && chmod 700 /pidex-secrets

WORKDIR /workspace

CMD ["bash"]
