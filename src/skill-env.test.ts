import { describe, expect, it } from "vitest";
import {
  applySkillEnvOverridesFromSnapshot,
  resolveSkillEnvForSnapshot,
} from "./skill-env.js";
import type { SkillCoreConfig, SkillCoreSkillSnapshot } from "./skill-types.js";

function withClearedEnv<T>(keys: string[], run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
}

describe("skill-core skill env policy", () => {
  it("resolves declared env overrides without mutating the input env", () => {
    const snapshot: SkillCoreSkillSnapshot = {
      skills: [{ name: "env-skill", primaryEnv: "ENV_KEY", requiredEnv: ["ENV_KEY"] }],
    };
    const config: SkillCoreConfig = {
      skills: {
        entries: {
          "env-skill": {
            apiKey: "injected-key",
          },
        },
      },
    };

    const baseEnv = { PATH: "/usr/bin" };
    const resolved = resolveSkillEnvForSnapshot({ snapshot, config, baseEnv });

    expect(resolved).toEqual({
      PATH: "/usr/bin",
      ENV_KEY: "injected-key",
    });
    expect(baseEnv).toEqual({ PATH: "/usr/bin" });
  });

  it("sets and restores process env for snapshot-based skill execution", () => {
    const snapshot: SkillCoreSkillSnapshot = {
      skills: [{ name: "env-skill", primaryEnv: "ENV_KEY", requiredEnv: ["ENV_KEY"] }],
    };
    const config: SkillCoreConfig = {
      skills: {
        entries: {
          "env-skill": {
            apiKey: "runtime-key",
          },
        },
      },
    };

    withClearedEnv(["ENV_KEY"], () => {
      const restore = applySkillEnvOverridesFromSnapshot({ snapshot, config });
      try {
        expect(process.env.ENV_KEY).toBe("runtime-key");
      } finally {
        restore();
      }
      expect(process.env.ENV_KEY).toBeUndefined();
    });
  });

  it("blocks dangerous host env keys even when skill config declares them", () => {
    const snapshot: SkillCoreSkillSnapshot = {
      skills: [
        {
          name: "unsafe-env-skill",
          requiredEnv: ["OPENAI_API_KEY", "NODE_OPTIONS"],
          primaryEnv: "OPENAI_API_KEY",
        },
      ],
    };
    const config: SkillCoreConfig = {
      skills: {
        entries: {
          "unsafe-env-skill": {
            env: {
              OPENAI_API_KEY: "sk-test",
              NODE_OPTIONS: "--require /tmp/evil.js",
            },
          },
        },
      },
    };

    const resolved = resolveSkillEnvForSnapshot({
      snapshot,
      config,
      baseEnv: {},
    });

    expect(resolved.OPENAI_API_KEY).toBe("sk-test");
    expect(resolved.NODE_OPTIONS).toBeUndefined();
  });
});
