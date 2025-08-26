#!/bin/sh
set -eu

# Defaults for data locations (can be overridden by env)
: "${DATASETS_DIR:=/data/datasets}"
: "${SETTINGS_FILE:=/data/state/settings.json}"
: "${WATCHES_FILE:=/data/state/telegram-watches.json}"
: "${SPLITS_FILE:=/data/state/splits.json}"

legacy_dir="/app/server"

mkdir -p "$DATASETS_DIR" "$(dirname "$SETTINGS_FILE")" "$(dirname "$WATCHES_FILE")" "$(dirname "$SPLITS_FILE")"

# One-time migration: if the target datasets dir is empty, seed from legacy path
if [ -z "$(ls -A "$DATASETS_DIR" 2>/dev/null || true)" ]; then
  if [ -d "$legacy_dir/datasets" ]; then
    echo "Seeding datasets into $DATASETS_DIR from $legacy_dir/datasets"
    cp -rT "$legacy_dir/datasets" "$DATASETS_DIR" || true
  fi
fi

# Seed config/state files if not present in the volume
if [ ! -f "$SETTINGS_FILE" ]; then
  if [ -f "$legacy_dir/settings.json" ]; then
    cp "$legacy_dir/settings.json" "$SETTINGS_FILE" || echo "{}" > "$SETTINGS_FILE"
  else
    echo "{}" > "$SETTINGS_FILE"
  fi
fi

if [ ! -f "$WATCHES_FILE" ]; then
  if [ -f "$legacy_dir/telegram-watches.json" ]; then
    cp "$legacy_dir/telegram-watches.json" "$WATCHES_FILE" || echo "[]" > "$WATCHES_FILE"
  else
    echo "[]" > "$WATCHES_FILE"
  fi
fi

if [ ! -f "$SPLITS_FILE" ]; then
  if [ -f "$legacy_dir/splits.json" ]; then
    cp "$legacy_dir/splits.json" "$SPLITS_FILE" || echo "{}" > "$SPLITS_FILE"
  else
    echo "{}" > "$SPLITS_FILE"
  fi
fi

# Load Docker secrets if present and not already set via env
load_secret() {
  name="$1"
  file="/run/secrets/$1"
  eval current_val="\${$1:-}"
  if [ -z "$current_val" ] && [ -f "$file" ]; then
    export "$name"="$(cat "$file")"
  fi
}

for s in \
  ADMIN_USERNAME \
  ADMIN_PASSWORD \
  TELEGRAM_BOT_TOKEN \
  TELEGRAM_CHAT_ID \
  ALPHA_VANTAGE_API_KEY \
  FINNHUB_API_KEY \
  TWELVE_DATA_API_KEY \
  POLYGON_API_KEY
do
  load_secret "$s"
done

exec "$@"

