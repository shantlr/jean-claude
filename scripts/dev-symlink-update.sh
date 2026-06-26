#!/bin/bash
# dev-symlink-update.sh - Refresh main repo DB copy, then start dev via symlink

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ "$OSTYPE" == "darwin"* ]]; then
  SOURCE_DB="$HOME/Library/Application Support/jean-claude/jean-claude.db"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  SOURCE_DB="$HOME/.config/jean-claude/jean-claude.db"
else
  SOURCE_DB="$APPDATA/jean-claude/jean-claude.db"
fi

COMMON_GIT_DIR="$(git -C "$PROJECT_ROOT" rev-parse --path-format=absolute --git-common-dir)"
if [[ "$(basename "$COMMON_GIT_DIR")" == ".git" ]]; then
  MAIN_REPO_ROOT="$(dirname "$COMMON_GIT_DIR")"
else
  echo "Unable to resolve main repo root from git common dir: $COMMON_GIT_DIR"
  exit 1
fi

MAIN_DB_DIR="$MAIN_REPO_ROOT/db-tmp"
MAIN_DB="$MAIN_DB_DIR/jean-claude.db"

mkdir -p "$MAIN_DB_DIR"
rm -f "$MAIN_DB" "$MAIN_DB-wal" "$MAIN_DB-shm"

if [[ -f "$SOURCE_DB" ]]; then
  echo "Copying database from: $SOURCE_DB"
  echo "                   to: $MAIN_DB"
  cp "$SOURCE_DB" "$MAIN_DB"
  [[ -f "$SOURCE_DB-wal" ]] && cp "$SOURCE_DB-wal" "$MAIN_DB-wal"
  [[ -f "$SOURCE_DB-shm" ]] && cp "$SOURCE_DB-shm" "$MAIN_DB-shm"
else
  echo "Warning: source database not found: $SOURCE_DB"
  echo "Starting with empty database at: $MAIN_DB"
  : > "$MAIN_DB"
fi

"$SCRIPT_DIR/dev-symlink.sh"
