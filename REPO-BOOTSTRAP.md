# skill-core Repository Bootstrap

This document describes how to create the standalone `skill-core` GitHub
repository from the current monorepo package contents.

## Confirmed Decisions

- repository name: `skill-core`
- license: `MIT`
- do not preserve git history
- publish package as `@qingduo/skill-core`
- keep repository public and package publishable

## Source Directory

Copy the contents of:

```sh
packages/skill-core/
```

into the root of the new repository.

Do not copy the surrounding monorepo root.

## Local Bootstrap Steps

From the current monorepo root:

```sh
rm -rf /tmp/skill-core-repo
mkdir -p /tmp/skill-core-repo
cp -R packages/skill-core/. /tmp/skill-core-repo/
cd /tmp/skill-core-repo
git init
git checkout -b main
corepack pnpm install --ignore-scripts
pnpm release:check
```

Expected result:

- the copied repository installs independently
- the copied repository passes `pnpm release:check`

## Create the GitHub Repository

Using GitHub CLI:

```sh
cd /tmp/skill-core-repo
gh repo create <github-owner>/skill-core --private --source=. --remote=origin --push
```

## First Push Without Git History

Because the migration should not preserve history, use the copied directory as a
fresh repository root:

```sh
cd /tmp/skill-core-repo
git add .
git commit -m "Initial standalone skill-core import"
git push -u origin main
```

## Post-Push Checklist

After the repository is created:

1. Update `homepage`, `bugs.url`, and `repository.url` in `package.json` to the
   new GitHub repository URL.
2. Run the standalone CI workflow from the new repository.
3. Verify `README.md`, `RELEASE.md`, and `validate-log.md` links in the new
   repository layout.
4. Verify the package name remains `@qingduo/skill-core` before publishing.

## npm Publish Preparation

The package is already prepared for publish with:

- `publishConfig.access = "public"`
- release gate: `pnpm release:check`
- dry-run packaging via `pnpm pack:dry-run`

Before a real publish:

1. update version if needed
2. rerun `pnpm release:check`
3. publish from the standalone repository root:

```sh
npm publish --access public
```
