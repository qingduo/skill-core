# @qingduo/skill-core

`@qingduo/skill-core` is the extracted minimal agent runtime for script-oriented
skills.

## Scope

This package owns:

- skill discovery from workspace `SKILL.md`
- skill command parsing and dispatch
- the six core tools: `read`, `write`, `edit`, `apply_patch`, `exec`, `process`
- minimal agent loop and an OpenAI-compatible provider path
- package-local verification gates

This package does not own:

- gateway and channel integrations
- plugin runtime
- UI or app layers
- non-core host messaging surfaces

## Public Surface

The package exports its public API from `dist/index.js` and `dist/index.d.ts`.
Consumers should import `@qingduo/skill-core` and should not import
package source files directly.

## Versioning Boundary

The intended compatibility boundary is:

- semver-major: breaking changes to public exports, tool contracts, runtime
  contracts, or persisted package-owned message shapes
- semver-minor: backward-compatible API additions and new optional behaviors
- semver-patch: fixes, internal refactors, and test-only changes

This package is intended for direct npm publication under the `@qingduo` scope.
The current `0.x` line allows controlled breaking changes, including the scope
rename from `@openclaw/skill-core` to `@qingduo/skill-core`.

## Verification

Run the package-local release gate with:

```sh
pnpm verify
pnpm pack:dry-run
```

## External Consumption

The package can be validated from a packaged tarball without any OpenClaw
adapter or source-path aliases.

Minimal flow:

```sh
cd packages/skill-core
pnpm release:check

mkdir -p /tmp/skill-core-external-consumer
cd /tmp/skill-core-external-consumer
corepack pnpm add /path/to/qingduo-skill-core-0.1.0.tgz
node --input-type=module -e "import { createStandaloneSkillCoreRuntime } from '@qingduo/skill-core'; console.log(typeof createStandaloneSkillCoreRuntime)"
```

For the full host-free validation sequence, see [validate-log.md](./validate-log.md).
