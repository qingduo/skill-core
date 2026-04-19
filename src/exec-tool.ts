import { spawn } from "node:child_process";
import { SkillCoreProcessRegistry } from "./process-registry.js";
import type { SkillCoreTool } from "./types.js";
import { resolveWorkspacePath } from "./workspace-path.js";

type ExecArgs = {
  command?: string;
  workdir?: string;
  timeoutMs?: number;
  background?: boolean;
};

/**
 * Creates a package-owned exec tool rooted at the workspace directory.
 * This is intentionally scoped to foreground execution only.
 */
export function createSkillCoreExecTool(params: {
  workspaceDir: string;
  env?: Record<string, string>;
  registry?: SkillCoreProcessRegistry;
}): SkillCoreTool<ExecArgs, unknown> {
  return {
    name: "exec",
    execute: async (_toolCallId, args, signal) => {
      const command = args?.command?.trim();
      if (!command) {
        throw new Error("Missing required command");
      }
      const cwd = args?.workdir
        ? resolveWorkspacePath(params.workspaceDir, args.workdir)
        : params.workspaceDir;
      const timeoutMs = typeof args?.timeoutMs === "number" && args.timeoutMs > 0 ? args.timeoutMs : undefined;
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const shellArgs =
        process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];

      if (args?.background) {
        const child = spawn(shell, shellArgs, {
          cwd,
          env: { ...process.env, ...(params.env ?? {}) },
          stdio: "ignore",
          detached: process.platform !== "win32",
        });
        if (process.platform !== "win32") {
          child.unref();
        }
        const processId = String(child.pid ?? "");
        if (!processId) {
          throw new Error("Failed to start background process");
        }
        const trackedProcess = params.registry?.track({
          id: processId,
          pid: child.pid!,
          command,
          cwd,
          startedAt: Date.now(),
        }, child);
        return {
          background: true,
          processId,
          details: {
            cwd,
            pid: child.pid!,
            status: trackedProcess?.status ?? "running",
          },
        };
      }

      return await new Promise((resolve, reject) => {
        const child = spawn(shell, shellArgs, {
          cwd,
          env: { ...process.env, ...(params.env ?? {}) },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timeoutId: NodeJS.Timeout | undefined;

        const finishWithError = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          reject(error);
        };

        const finishWithResult = (exitCode: number | null) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          resolve({
            stdout,
            stderr,
            exitCode: exitCode ?? -1,
            details: {
              cwd,
              exitCode: exitCode ?? -1,
            },
          });
        };

        child.stdout.on("data", (chunk: Buffer | string) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });
        child.on("error", (error) => {
          finishWithError(error);
        });
        child.on("close", (exitCode) => {
          finishWithResult(exitCode);
        });

        if (signal) {
          if (signal.aborted) {
            child.kill();
            finishWithError(abortError());
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              child.kill();
              finishWithError(abortError());
            },
            { once: true },
          );
        }

        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            child.kill();
            finishWithError(new Error(`Command timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }
      });
    },
  };
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
