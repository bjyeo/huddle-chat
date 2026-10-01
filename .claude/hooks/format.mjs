// PostToolUse (Edit|Write|MultiEdit): run Prettier on the file Claude just changed.
// Never fails the tool call — formatting is best effort.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './read-input.mjs';

const FORMATTABLE = /\.(m?[jt]sx?|cjs|json|css|html|md|ya?ml)$/i;

const input = await readHookInput();
const filePath = input.tool_input?.file_path;
if (!filePath || !FORMATTABLE.test(filePath)) process.exit(0);

const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  const require = createRequire(path.join(projectDir, 'package.json'));
  const prettier = await import(require.resolve('prettier'));
  const { ignored } = await prettier.getFileInfo(filePath, {
    ignorePath: path.join(projectDir, '.prettierignore'),
  });
  if (ignored) process.exit(0);
  const source = await fs.readFile(filePath, 'utf8');
  const options = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(source, { ...options, filepath: filePath });
  if (formatted !== source) await fs.writeFile(filePath, formatted);
} catch {
  // Prettier not installed yet or file unparseable — leave the file as is.
}
