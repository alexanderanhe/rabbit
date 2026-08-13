#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

APP_NAME="rabbit"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      APP_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

WORKER_NAME="${APP_NAME}-worker"

# Recreate only this application's worker so PM2 cannot retain a stale cwd or
# command from a previous deployment. The web process and unrelated services
# are intentionally left untouched.
pm2 delete "$WORKER_NAME" >/dev/null 2>&1 || true
pm2 start npm \
  --name "$WORKER_NAME" \
  --cwd "$APP_DIR" \
  --time \
  --restart-delay 5000 \
  --kill-timeout 300000 \
  -- run worker:prod
