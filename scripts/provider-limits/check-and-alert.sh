#!/usr/bin/env bash
set -euo pipefail
python3 "$HOME/pidex/scripts/provider-limits/probe.py" alert "$@"
