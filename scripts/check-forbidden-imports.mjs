import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const srcRoot = path.join(packageRoot, "src");

// These fragments represent main-repo feature areas that skill-core must not
// depend on if it is going to remain independently publishable.
const forbiddenSpecifiers = [
  "src/gateway",
  "src/channels",
  "src/plugins",
  "src/telegram",
  "src/slack",
  "src/discord",
  "src/whatsapp",
  "src/browser",
  "ui/",
  "apps/",
  "extensions/",
];

const importPatterns = [
  /\bimport\s+[^'"]*?from\s+["']([^"']+)["']/gu,
  /\bexport\s+[^'"]*?from\s+["']([^"']+)["']/gu,
  /\bimport\(\s*["']([^"']+)["']\s*\)/gu,
];

const failures = [];
for (const filePath of await walkTsFiles(srcRoot)) {
  const source = await fs.readFile(filePath, "utf8");
  for (const specifier of extractImportSpecifiers(source)) {
    if (!forbiddenSpecifiers.some((entry) => specifier.includes(entry))) {
      continue;
    }
    failures.push({
      filePath: path.relative(packageRoot, filePath),
      specifier,
    });
  }
}

if (failures.length > 0) {
  const lines = failures.map(
    (failure) => `- ${failure.filePath}: forbidden import "${failure.specifier}"`,
  );
  console.error(
    ["Detected forbidden main-repo imports inside packages/skill-core:", ...lines].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("No forbidden imports found in packages/skill-core/src.");
}

async function walkTsFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTsFiles(fullPath)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (!specifier) {
        continue;
      }
      specifiers.push(specifier);
    }
  }
  return specifiers;
}
