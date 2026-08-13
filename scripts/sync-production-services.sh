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
LOG_DIR="${PM2_HOME:-$HOME/.pm2}/logs"
WORKER_OUT_LOG="$LOG_DIR/${WORKER_NAME}-out.log"
WORKER_ERROR_LOG="$LOG_DIR/${WORKER_NAME}-error.log"

# Recreate only this application's worker so PM2 cannot retain a stale cwd or
# command from a previous deployment. The web process and unrelated services
# are intentionally left untouched.
pm2 delete "$WORKER_NAME" >/dev/null 2>&1 || true
pm2 start npm \
  --name "$WORKER_NAME" \
  --cwd "$APP_DIR" \
  --time \
  --restart-delay 30000 \
  --max-restarts 10 \
  --min-uptime 30000 \
  --output "$WORKER_OUT_LOG" \
  --error "$WORKER_ERROR_LOG" \
  --kill-timeout 300000 \
  -- run worker:prod

# Rotate only rabbit-worker logs. copytruncate keeps PM2's open file handles
# valid; this does not change retention for any other PM2 application.
if command -v logrotate >/dev/null 2>&1 && [[ -w /etc/logrotate.d ]]; then
  ROTATE_FILE="/etc/logrotate.d/${WORKER_NAME}"
  {
    echo "$WORKER_OUT_LOG $WORKER_ERROR_LOG {"
    echo "  size 20M"
    echo "  rotate 7"
    echo "  compress"
    echo "  missingok"
    echo "  notifempty"
    echo "  copytruncate"
    echo "}"
  } > "$ROTATE_FILE"
fi
