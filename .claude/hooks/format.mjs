// PostToolUse (Edit|Write|MultiEdit): run Prettier on the file Claude just changed.
// Never fails the tool call — formatting is best effort.
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readHookInput } from './read-input.mjs';

const FORMATTABLE = /\.(m?[jt]sx?|cjs|json|css|html|md|ya?ml)$/i;

const input = await readHookInput();
const filePath = input.tool_input?.file_path;
if (!filePath || !FORMATTABLE.test(filePath)) process.exit(0);

// The checkout containing the file (a git worktree has its own root), else the project dir.
function findRoot(start) {
  for (let dir = path.dirname(start); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.prettierrc.json'))) return dir;
  }
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  );
}

const root = findRoot(path.resolve(filePath));

try {
  // Resolve from the project root, falling back to the main checkout (worktrees may lack node_modules).
  const candidates = [root, process.env.CLAUDE_PROJECT_DIR].filter(Boolean);
  const prettierPath = candidates
    .map((dir) => {
      try {
        return createRequire(path.join(dir, 'package.json')).resolve('prettier');
      } catch {
        return null;
      }
    })
    .find(Boolean);
  if (!prettierPath) process.exit(0);
  // On Windows, dynamic import() needs a file:// URL rather than a C:\ path.
  // require.resolve picks Prettier's CommonJS entry, whose API sits on the default export.
  const mod = await import(pathToFileURL(prettierPath).href);
  const prettier = mod.default ?? mod;
  const { ignored } = await prettier.getFileInfo(filePath, {
    ignorePath: path.join(root, '.prettierignore'),
  });
  if (ignored) process.exit(0);
  const source = await fs.readFile(filePath, 'utf8');
  const options = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(source, { ...options, filepath: filePath });
  if (formatted !== source) await fs.writeFile(filePath, formatted);
} catch (error) {
  // Unparseable file: leave it as is, but say why (shown in Claude Code's verbose/debug output).
  console.error(`format hook: ${error.message}`);
}
