import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ProcessTreeSample = {
  pids: number[];
  cpuPercent: number;
  rssBytes: number;
  unsupportedReason?: string;
};

type PsRow = {
  pid: number;
  ppid: number;
  rssKb: number;
  cpuPercent: number;
};

export function parsePsRows(
  stdout: string,
  rootPid: number,
): ProcessTreeSample {
  const rows = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): PsRow | null => {
      const [pidRaw, ppidRaw, rssRaw, cpuRaw] = line.split(/\s+/, 5);
      const pid = Number(pidRaw);
      const ppid = Number(ppidRaw);
      const rssKb = Number(rssRaw);
      const cpuPercent = Number(cpuRaw);

      if (![pid, ppid, rssKb, cpuPercent].every(Number.isFinite)) {
        return null;
      }

      return { pid, ppid, rssKb, cpuPercent };
    })
    .filter((row): row is PsRow => row !== null);

  const childrenByParent = new Map<number, PsRow[]>();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row);
    childrenByParent.set(row.ppid, children);
  }

  const root = rows.find((row) => row.pid === rootPid);
  if (!root) return { pids: [], cpuPercent: 0, rssBytes: 0 };

  const selected: PsRow[] = [];
  const visit = (row: PsRow) => {
    selected.push(row);
    for (const child of childrenByParent.get(row.pid) ?? []) visit(child);
  };
  visit(root);

  return {
    pids: selected.map((row) => row.pid),
    cpuPercent: selected.reduce((sum, row) => sum + row.cpuPercent, 0),
    rssBytes: selected.reduce((sum, row) => sum + row.rssKb, 0) * 1024,
  };
}

export async function sampleProcessTree({
  rootPid,
  platform = process.platform,
  execPs = async () => {
    const { stdout } = await execFileAsync('ps', [
      '-axo',
      'pid=,ppid=,rss=,pcpu=,comm=',
    ]);
    return stdout;
  },
}: {
  rootPid: number;
  platform?: typeof process.platform;
  execPs?: () => Promise<string>;
}): Promise<ProcessTreeSample> {
  if (platform === 'win32') {
    return {
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
      unsupportedReason: 'process resource sampling is not supported on win32',
    };
  }

  try {
    return parsePsRows(await execPs(), rootPid);
  } catch (error) {
    return {
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
      unsupportedReason: error instanceof Error ? error.message : String(error),
    };
  }
}
