/**
 * Minimal tool shape consumed by skill-core.
 * The host runtime can adapt its own tool type to this contract.
 */
export type SkillCoreTool<TArgs = unknown, TResult = unknown> = {
  name: string;
  execute: (toolCallId: string, args: TArgs, signal?: AbortSignal) => Promise<TResult>;
};

/**
 * Lightweight logger contract used by skill-core runtime.
 * Host adapters can map this to any existing logging system.
 */
export type SkillCoreLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

/**
 * Common runtime context that host adapters can pass to tool providers.
 * Keep this generic to avoid coupling with repository-specific message schemas.
 */
export type SkillCoreRuntimeContext = {
  sessionKey?: string;
  workspaceDir?: string;
  agentId?: string;
  provider?: string;
  model?: string;
  senderIsOwner?: boolean;
};
