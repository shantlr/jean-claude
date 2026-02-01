#!/bin/bash
# dev-tmp.sh - Start dev server with a temporary copy of the database
#
# This script copies the main database to a local temp folder and starts
# the dev server using that copy. Useful for testing features without
# corrupting your main database.

set -e

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Paths
if [[ "$OSTYPE" == "darwin"* ]]; then
  SOURCE_DB="$HOME/Library/Application Support/jean-claude/jean-claude.db"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  SOURCE_DB="$HOME/.config/jean-claude/jean-claude.db"
else
  # Windows (Git Bash / WSL)
  SOURCE_DB="$APPDATA/jean-claude/jean-claude.db"
fi

TMP_DIR="$PROJECT_ROOT/db-tmp"
TMP_DB="$TMP_DIR/jean-claude.db"

# Create tmp directory and copy the database
mkdir -p "$TMP_DIR"

if [[ -f "$SOURCE_DB" ]]; then
  echo "Copying database from: $SOURCE_DB"
  echo "                   to: $TMP_DB"
  cp "$SOURCE_DB" "$TMP_DB"
  # Also copy the WAL and SHM files if they exist (SQLite journal files)
  [[ -f "$SOURCE_DB-wal" ]] && cp "$SOURCE_DB-wal" "$TMP_DB-wal"
  [[ -f "$SOURCE_DB-shm" ]] && cp "$SOURCE_DB-shm" "$TMP_DB-shm"
  echo "Database copied successfully"
else
  echo "Warning: Source database not found at $SOURCE_DB"
  echo "Starting with empty database..."
fi

echo ""
echo "Starting dev server with temporary database..."
echo ""

# Start the dev server with the overridden database path
cd "$PROJECT_ROOT"
JEAN_CLAUDE_DB_PATH="$TMP_DB" pnpm dev
