import type { SkillCoreConfig, SkillCoreSkillSnapshot } from "./skill-types.js";

type EnvUpdate = {
  key: string;
  previousValue: string | undefined;
};

const ALWAYS_BLOCKED_ENV_PATTERNS: ReadonlyArray<RegExp> = [
  /^BASH_ENV$/iu,
  /^DYLD_INSERT_LIBRARIES$/iu,
  /^ENV$/iu,
  /^LD_PRELOAD$/iu,
  /^NODE_OPTIONS$/iu,
  /^OPENSSL_CONF$/iu,
  /^PERL5OPT$/iu,
  /^PYTHONHOME$/iu,
  /^PYTHONPATH$/iu,
  /^RUBYOPT$/iu,
  /^SHELL$/iu,
];

/**
 * Resolves a skill-core env view for a snapshot without mutating `process.env`.
 * Existing keys win by default so the host can still override injected values.
 */
export function resolveSkillEnvForSnapshot(params: {
  snapshot?: SkillCoreSkillSnapshot;
  config?: SkillCoreConfig;
  baseEnv: Record<string, string>;
}): Record<string, string> {
  const resolved = { ...params.baseEnv };
  for (const skill of params.snapshot?.skills ?? []) {
    const entryConfig = params.config?.skills?.entries?.[skill.name];
    if (!entryConfig) {
      continue;
    }

    const pending = resolvePendingEnvOverrides({
      primaryEnv: skill.primaryEnv,
      requiredEnv: skill.requiredEnv,
      entryConfig,
      currentEnv: resolved,
    });
    for (const [key, value] of Object.entries(pending)) {
      if (key in resolved) {
        continue;
      }
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Applies env overrides directly to `process.env` and returns a restore callback.
 * This mirrors the main runtime behavior while keeping the logic package-local.
 */
export function applySkillEnvOverridesFromSnapshot(params: {
  snapshot?: SkillCoreSkillSnapshot;
  config?: SkillCoreConfig;
}): () => void {
  const updates: EnvUpdate[] = [];
  const resolved = resolveSkillEnvForSnapshot({
    snapshot: params.snapshot,
    config: params.config,
    baseEnv: process.env as Record<string, string>,
  });

  for (const [key, value] of Object.entries(resolved)) {
    if (process.env[key] === value) {
      continue;
    }
    updates.push({ key, previousValue: process.env[key] });
    process.env[key] = value;
  }

  return () => {
    for (const update of updates) {
      if (update.previousValue === undefined) {
        delete process.env[update.key];
        continue;
      }
      process.env[update.key] = update.previousValue;
    }
  };
}

function resolvePendingEnvOverrides(params: {
  primaryEnv?: string;
  requiredEnv?: string[];
  entryConfig: NonNullable<NonNullable<SkillCoreConfig["skills"]>["entries"]>[string];
  currentEnv: Record<string, string>;
}): Record<string, string> {
  const pending: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(params.entryConfig.env ?? {})) {
    const key = rawKey.trim();
    const value = rawValue?.trim();
    if (!key || !value || key in params.currentEnv || isAlwaysBlockedSkillEnvKey(key)) {
      continue;
    }
    if (!isValidEnvKey(key) || value.includes("\u0000")) {
      continue;
    }
    pending[key] = value;
  }

  const primaryEnv = params.primaryEnv?.trim();
  if (
    primaryEnv &&
    params.entryConfig.apiKey?.trim() &&
    !(primaryEnv in params.currentEnv) &&
    !pending[primaryEnv] &&
    !isAlwaysBlockedSkillEnvKey(primaryEnv) &&
    isValidEnvKey(primaryEnv)
  ) {
    pending[primaryEnv] = params.entryConfig.apiKey.trim();
  }

  const allowedSensitiveKeys = new Set<string>();
  if (primaryEnv) {
    allowedSensitiveKeys.add(primaryEnv);
  }
  for (const envKey of params.requiredEnv ?? []) {
    const trimmed = envKey.trim();
    if (trimmed) {
      allowedSensitiveKeys.add(trimmed);
    }
  }

  for (const key of Object.keys(pending)) {
    if (looksSensitiveEnvKey(key) && !allowedSensitiveKeys.has(key)) {
      delete pending[key];
    }
  }

  return pending;
}

function isAlwaysBlockedSkillEnvKey(key: string): boolean {
  return ALWAYS_BLOCKED_ENV_PATTERNS.some((pattern) => pattern.test(key));
}

function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key);
}

function looksSensitiveEnvKey(key: string): boolean {
  return /(_TOKEN|_SECRET|_KEY|PASSWORD)$/iu.test(key);
}
