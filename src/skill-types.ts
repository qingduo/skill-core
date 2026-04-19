export type SkillCoreParsedFrontmatter = Record<string, string>;

export type SkillCoreSkillMetadata = {
  skillKey?: string;
  primaryEnv?: string;
  requiredEnv?: string[];
};

export type SkillCoreSkillEntry = {
  name: string;
  description: string;
  baseDir: string;
  filePath: string;
  frontmatter: SkillCoreParsedFrontmatter;
  metadata?: SkillCoreSkillMetadata;
  userInvocable: boolean;
};

export type SkillCoreSkillCommandDispatchSpec = {
  kind: "tool";
  toolName: string;
  argMode?: "raw";
};

export type SkillCoreSkillCommandSpec = {
  name: string;
  skillName: string;
  description: string;
  dispatch?: SkillCoreSkillCommandDispatchSpec;
};

export type SkillCoreSkillSnapshot = {
  skills: Array<{
    name: string;
    primaryEnv?: string;
    requiredEnv?: string[];
  }>;
  version?: number;
};

export type SkillCoreSkillConfigEntry = {
  apiKey?: string;
  env?: Record<string, string>;
};

export type SkillCoreConfig = {
  skills?: {
    entries?: Record<string, SkillCoreSkillConfigEntry>;
  };
};
