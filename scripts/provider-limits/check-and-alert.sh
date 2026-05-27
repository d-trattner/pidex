#!/usr/bin/env bash
set -euo pipefail
node "$HOME/pidex/scripts/provider-limits/probe.mjs" alert "$@"
