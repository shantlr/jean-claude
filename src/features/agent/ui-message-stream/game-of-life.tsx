import { memo, useEffect, useRef, useState, useCallback } from 'react';

const COLS = 12;
const ROWS = 6;
const CELL_SIZE = 5;
const GAP = 1;
const TICK_MS = 280;

/**
 * Some fun seed patterns (blinkers, gliders, small oscillators).
 * We pick one at random on mount.
 */
const SEED_PATTERNS: [number, number][][] = [
  // Glider + blinker
  [
    [0, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
    [5, 5],
    [5, 6],
    [5, 7],
  ],
  // R-pentomino (chaotic, long-lived)
  [
    [2, 4],
    [2, 5],
    [3, 3],
    [3, 4],
    [4, 4],
  ],
  // Lightweight spaceship fragment + beacon
  [
    [1, 1],
    [1, 4],
    [2, 5],
    [3, 1],
    [3, 5],
    [4, 2],
    [4, 3],
    [4, 4],
    [4, 5],
    [0, 8],
    [0, 9],
    [1, 8],
    [1, 9],
    [2, 10],
    [2, 11],
    [3, 10],
    [3, 11],
  ],
  // Acorn (takes a long time to stabilize)
  [
    [2, 3],
    [3, 5],
    [4, 2],
    [4, 3],
    [4, 6],
    [4, 7],
    [4, 8],
  ],
  // Diehard
  [
    [2, 7],
    [3, 1],
    [3, 2],
    [4, 2],
    [4, 6],
    [4, 7],
    [4, 8],
  ],
];

function createEmptyGrid(): boolean[][] {
  return Array.from(
    { length: ROWS },
    () => Array(COLS).fill(false) as boolean[],
  );
}

function seedGrid(): boolean[][] {
  const grid = createEmptyGrid();
  const pattern =
    SEED_PATTERNS[Math.floor(Math.random() * SEED_PATTERNS.length)];
  for (const [r, c] of pattern) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      grid[r][c] = true;
    }
  }
  return grid;
}

function countNeighbors(grid: boolean[][], row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      // Wrap around (toroidal)
      const r = (row + dr + ROWS) % ROWS;
      const c = (col + dc + COLS) % COLS;
      if (grid[r][c]) count++;
    }
  }
  return count;
}

function nextGeneration(grid: boolean[][]): boolean[][] {
  const next = createEmptyGrid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const neighbors = countNeighbors(grid, r, c);
      if (grid[r][c]) {
        next[r][c] = neighbors === 2 || neighbors === 3;
      } else {
        next[r][c] = neighbors === 3;
      }
    }
  }
  return next;
}

function isGridEmpty(grid: boolean[][]): boolean {
  return grid.every((row) => row.every((cell) => !cell));
}

function gridsEqual(a: boolean[][], b: boolean[][]): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export const GameOfLife = memo(function GameOfLife() {
  const [grid, setGrid] = useState(seedGrid);
  const prevGridRef = useRef<boolean[][] | null>(null);
  const staleCountRef = useRef(0);

  const reseed = useCallback(() => {
    staleCountRef.current = 0;
    prevGridRef.current = null;
    setGrid(seedGrid());
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setGrid((current) => {
        const next = nextGeneration(current);

        // If the grid dies or gets stuck in a static state, reseed
        if (isGridEmpty(next)) {
          setTimeout(reseed, 0);
          return current;
        }

        if (prevGridRef.current && gridsEqual(next, prevGridRef.current)) {
          staleCountRef.current++;
          // period-2 oscillators are fine, but if stuck for too long, reseed
          if (staleCountRef.current > 8) {
            setTimeout(reseed, 0);
            return current;
          }
        } else {
          staleCountRef.current = 0;
        }

        prevGridRef.current = current;
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [reseed]);

  const width = COLS * (CELL_SIZE + GAP) - GAP;
  const height = ROWS * (CELL_SIZE + GAP) - GAP;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="shrink-0"
    >
      {grid.map((row, r) =>
        row.map((alive, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * (CELL_SIZE + GAP)}
            y={r * (CELL_SIZE + GAP)}
            width={CELL_SIZE}
            height={CELL_SIZE}
            rx={1}
            className={
              alive
                ? 'fill-sky-400 transition-opacity duration-200'
                : 'fill-sky-400/10 transition-opacity duration-200'
            }
            opacity={alive ? 0.9 : 0.15}
          />
        )),
      )}
    </svg>
  );
});
