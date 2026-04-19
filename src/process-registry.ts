import type { ChildProcess } from "node:child_process";

export type SkillCoreProcessStatus = "running" | "exited" | "failed" | "killed";

export type SkillCoreTrackedProcess = {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  startedAt: number;
  status: SkillCoreProcessStatus;
  completedAt?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
};

/**
 * In-memory lifecycle registry for package-owned background processes.
 * This remains process-local, but it now tracks completion state as long as the
 * current skill-core host process is alive.
 */
export class SkillCoreProcessRegistry {
  private readonly entries = new Map<string, SkillCoreTrackedProcess>();
  private readonly children = new Map<string, ChildProcess>();

  track(entry: Omit<SkillCoreTrackedProcess, "status">, child?: ChildProcess): SkillCoreTrackedProcess {
    const trackedEntry: SkillCoreTrackedProcess = {
      ...entry,
      status: "running",
    };
    this.entries.set(trackedEntry.id, trackedEntry);
    if (child) {
      this.children.set(trackedEntry.id, child);
      this.attachLifecycleHandlers(trackedEntry.id, child);
    }
    return trackedEntry;
  }

  get(id: string): SkillCoreTrackedProcess | undefined {
    this.refreshDetachedEntry(id);
    return this.entries.get(id);
  }

  list(params?: { includeCompleted?: boolean }): SkillCoreTrackedProcess[] {
    const includeCompleted = params?.includeCompleted ?? true;
    const results: SkillCoreTrackedProcess[] = [];
    for (const id of this.entries.keys()) {
      this.refreshDetachedEntry(id);
      const entry = this.entries.get(id);
      if (!entry) {
        continue;
      }
      if (!includeCompleted && entry.status !== "running") {
        continue;
      }
      results.push(entry);
    }
    return results.toSorted((left, right) => left.startedAt - right.startedAt);
  }

  kill(id: string): boolean {
    this.refreshDetachedEntry(id);
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }
    if (entry.status !== "running") {
      return false;
    }
    try {
      process.kill(entry.pid);
    } catch {
      this.markFinished(id, {
        status: "failed",
        exitCode: null,
        signal: null,
      });
      return false;
    }
    this.markFinished(id, {
      status: "killed",
      exitCode: null,
      signal: "SIGTERM",
    });
    return true;
  }

  pruneCompleted(): number {
    let removed = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (entry.status === "running") {
        continue;
      }
      this.entries.delete(id);
      this.children.delete(id);
      removed += 1;
    }
    return removed;
  }

  private attachLifecycleHandlers(id: string, child: ChildProcess): void {
    child.once("exit", (exitCode, signal) => {
      const current = this.entries.get(id);
      if (!current) {
        return;
      }
      if (current.status === "killed") {
        this.markFinished(id, {
          status: "killed",
          exitCode,
          signal,
        });
        return;
      }
      this.markFinished(id, {
        status: exitCode === 0 ? "exited" : "failed",
        exitCode,
        signal,
      });
    });
    child.once("error", () => {
      this.markFinished(id, {
        status: "failed",
        exitCode: null,
        signal: null,
      });
    });
  }

  private refreshDetachedEntry(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== "running" || this.children.has(id)) {
      return;
    }
    if (isPidRunning(entry.pid)) {
      return;
    }
    this.markFinished(id, {
      status: "failed",
      exitCode: null,
      signal: null,
    });
  }

  private markFinished(id: string, update: {
    status: SkillCoreProcessStatus;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    this.entries.set(id, {
      ...entry,
      status: update.status,
      completedAt: Date.now(),
      exitCode: update.exitCode,
      signal: update.signal,
    });
    this.children.delete(id);
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
