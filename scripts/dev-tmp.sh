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
TMP_DB_WAL="$TMP_DB-wal"
TMP_DB_SHM="$TMP_DB-shm"

copy_source_db() {
  if [[ -f "$SOURCE_DB" ]]; then
    echo "Copying database from: $SOURCE_DB"
    echo "                   to: $TMP_DB"
    cp "$SOURCE_DB" "$TMP_DB"
    # Also copy the WAL and SHM files if they exist (SQLite journal files)
    [[ -f "$SOURCE_DB-wal" ]] && cp "$SOURCE_DB-wal" "$TMP_DB_WAL"
    [[ -f "$SOURCE_DB-shm" ]] && cp "$SOURCE_DB-shm" "$TMP_DB_SHM"
    echo "Database copied successfully"
  else
    echo "Warning: Source database not found at $SOURCE_DB"
    echo "Starting with empty database..."
  fi
}

# Create tmp directory and copy the database
mkdir -p "$TMP_DIR"

if [[ -f "$TMP_DB" ]]; then
  echo "Existing temporary database found at: $TMP_DB"
  while true; do
    read -r -p "Use existing temporary database or override it? [use/override]: " choice
    case "$choice" in
      use|u)
        echo "Keeping existing temporary database"
        break
        ;;
      override|o)
        rm -f "$TMP_DB" "$TMP_DB_WAL" "$TMP_DB_SHM"
        copy_source_db
        break
        ;;
      *)
        echo "Please answer 'use' or 'override'."
        ;;
    esac
  done
else
  copy_source_db
fi

echo ""
echo "Starting dev server with temporary database..."
echo ""

# Start the dev server with the overridden database path
cd "$PROJECT_ROOT"
JEAN_CLAUDE_DB_PATH="$TMP_DB" pnpm dev
