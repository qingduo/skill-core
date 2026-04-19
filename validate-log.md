# Step 28 Validation Log

This document records the detailed execution log for the approved external-consumer
validation run of `@openclaw/skill-core`.

## Scope

- Validate the latest packaged tarball from `packages/skill-core/.artifacts`
- Install it into a fresh external consumer under `/tmp`
- Verify host-free consumption without OpenClaw adapter, `SessionManager`, or
  main-repo config
- Record both the successful validation path and any intermediate harness-only
  correction made during the run

## Environment

- Repository root: `/Users/kingdom10/openclaw-main`
- Package under test: `/Users/kingdom10/openclaw-main/packages/skill-core`
- External consumer: `/tmp/skill-core-external-consumer`
- Tarball used: `/Users/kingdom10/openclaw-main/packages/skill-core/.artifacts/openclaw-skill-core-0.1.0.tgz`

## Execution Log

### 1. Refresh package release artifact

Command:

```sh
cd /Users/kingdom10/openclaw-main/packages/skill-core
pnpm release:check
```

Result:

- Passed
- Included:
  - `build`
  - `typecheck`
  - `check:forbidden-imports`
  - `test`
  - `test:e2e`
  - `pack:dry-run`
- Refreshed tarball:
  - `packages/skill-core/.artifacts/openclaw-skill-core-0.1.0.tgz`

### 2. Prepare external consumer directory

Commands:

```sh
rm -rf /tmp/skill-core-external-consumer
mkdir -p /tmp/skill-core-external-consumer
```

Files created:

- `/tmp/skill-core-external-consumer/package.json`
- `/tmp/skill-core-external-consumer/verify.mjs`

Purpose:

- `package.json` provided a minimal ESM consumer
- `verify.mjs` executed all approved external-consumer validation points

### 3. Install tarball into the external consumer

Command:

```sh
cd /tmp/skill-core-external-consumer
corepack pnpm add /Users/kingdom10/openclaw-main/packages/skill-core/.artifacts/openclaw-skill-core-0.1.0.tgz
```

Result:

- Passed
- Installed dependency:
  - `@openclaw/skill-core@0.1.0`
- Confirmed `node_modules/@openclaw/skill-core` exists

### 4. First external verification attempt

Command:

```sh
cd /tmp/skill-core-external-consumer
node verify.mjs
```

Observed result:

- Reached the workspace-boundary section of the verification
- Failed on the assertion for `read` outside-workspace rejection

Failure detail:

- The package correctly rejected the path
- The harness matched only `/outside the workspace/`
- The actual package error message was:

```text
Error: Path escapes workspace root: ../outside.txt
```

Assessment:

- This was a validation-harness issue
- It did not indicate a package boundary failure

### 5. Harness-only correction

Modified file:

- `/tmp/skill-core-external-consumer/verify.mjs`

Change:

- Expanded the rejection pattern from:

```js
/outside the workspace/i
```

- To:

```js
/outside the workspace|escapes workspace root/i
```

Reason:

- Align the external verification harness with the package's actual boundary
  error wording
- No package code was changed

### 6. Final external verification run

Command:

```sh
cd /tmp/skill-core-external-consumer
node verify.mjs
```

Result:

- Passed

Verification points confirmed by the script:

- Tarball package installed and resolved via `node_modules`
- Main entry resolved to `dist/index.js`
- Public exports available:
  - `buildWorkspaceSkillCommandSpecs`
  - `createStandaloneSkillCoreRuntime`
  - `resolveSkillCommandInvocation`
- Installed `package.json` and `README.md` matched the declared package surface
- Standalone runtime created without OpenClaw adapter
- Core tool surface available:
  - `read`
  - `write`
  - `edit`
  - `apply_patch`
  - `exec`
  - `process`
- Workspace `SKILL.md` discovered successfully
- `command-dispatch` resolved to `exec`
- `write/read` succeeded
- `edit` succeeded
- `apply_patch` succeeded
- Foreground `exec` succeeded inside workspace
- Background `exec` succeeded
- `process get` succeeded
- `process kill` succeeded
- Workspace boundary enforcement succeeded for file tools
- Validation completed without:
  - OpenClaw adapter
  - `SessionManager`
  - main-repo runtime config

## Final Verification Output

The final `node verify.mjs` run reported:

```text
- install: resolved @openclaw/skill-core to .../node_modules/@openclaw/skill-core/dist/index.js
- exports: main entry resolves to dist/index.js
- public api: expected runtime and command exports are available
- metadata: package.json and README align with package surface
- workspace: created temporary workspace ...
- standalone runtime: created without OpenClaw adapter
- tool surface: resolved tools: apply_patch, edit, exec, process, read, write
- skill discovery: workspace SKILL.md discovered correctly
- command-dispatch: resolved to exec tool dispatch
- write/read: wrote and read back notes.txt
- edit: replaced text inside notes.txt
- apply_patch: patched artifact.txt through package tool
- exec foreground: dispatchTool executed command inside workspace
- exec background: started process ...
- process get: background process reported as running
- process kill: background process killed successfully
- workspace boundary: file tools reject paths outside workspace
- host independence: verification completed without OpenClaw adapter, SessionManager, or main-repo config
```

## Conclusion

The packaged tarball for `@openclaw/skill-core` is externally consumable in a
fresh minimal consumer directory and supports the approved host-free validation
surface.
