#!/bin/bash
# dev-symlink.sh - Start dev server with DB symlinked from main repo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

COMMON_GIT_DIR="$(git -C "$PROJECT_ROOT" rev-parse --path-format=absolute --git-common-dir)"
if [[ "$(basename "$COMMON_GIT_DIR")" == ".git" ]]; then
  MAIN_REPO_ROOT="$(dirname "$COMMON_GIT_DIR")"
else
  echo "Unable to resolve main repo root from git common dir: $COMMON_GIT_DIR"
  exit 1
fi

MAIN_DB_DIR="$MAIN_REPO_ROOT/db-tmp"
MAIN_DB="$MAIN_DB_DIR/jean-claude.db"
WORKTREE_DB_DIR="$PROJECT_ROOT/db-tmp"
WORKTREE_DB="$WORKTREE_DB_DIR/jean-claude.db"

if [[ "$OSTYPE" == "darwin"* ]]; then
  SOURCE_DB="$HOME/Library/Application Support/jean-claude/jean-claude.db"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  SOURCE_DB="$HOME/.config/jean-claude/jean-claude.db"
else
  SOURCE_DB="$APPDATA/jean-claude/jean-claude.db"
fi

if [[ ! -f "$MAIN_DB" ]]; then
  mkdir -p "$MAIN_DB_DIR"

  if [[ -f "$SOURCE_DB" ]]; then
    echo "Main repo database not found. Copying from: $SOURCE_DB"
    echo "                                      to: $MAIN_DB"
    cp "$SOURCE_DB" "$MAIN_DB"
    [[ -f "$SOURCE_DB-wal" ]] && cp "$SOURCE_DB-wal" "$MAIN_DB-wal"
    [[ -f "$SOURCE_DB-shm" ]] && cp "$SOURCE_DB-shm" "$MAIN_DB-shm"
  else
    echo "Warning: source database not found: $SOURCE_DB"
    echo "Starting with empty database at: $MAIN_DB"
    : > "$MAIN_DB"
  fi
fi

mkdir -p "$WORKTREE_DB_DIR"

if [[ "$PROJECT_ROOT" != "$MAIN_REPO_ROOT" ]]; then
  rm -f "$WORKTREE_DB" "$WORKTREE_DB-wal" "$WORKTREE_DB-shm"
  ln -s "$MAIN_DB" "$WORKTREE_DB"
  ln -s "$MAIN_DB-wal" "$WORKTREE_DB-wal"
  ln -s "$MAIN_DB-shm" "$WORKTREE_DB-shm"
fi

echo "Using symlinked database: $WORKTREE_DB"
echo "Main repo database:       $MAIN_DB"
echo ""

cd "$PROJECT_ROOT"
JEAN_CLAUDE_DB_PATH="$WORKTREE_DB" pnpm dev
