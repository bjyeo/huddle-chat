// PreToolUse (Bash|PowerShell): block a few destructive or hook-bypassing commands.
import { readHookInput } from './read-input.mjs';

const input = await readHookInput();
const command = String(input.tool_input?.command ?? '');

const rules = [
  [
    /git\s+push\b[^\n]*(--force\b|-f\b)(?![^\n]*--force-with-lease)/,
    'Force-push is not allowed. Use --force-with-lease on a feature branch if you really must.',
  ],
  [
    /git\s+(commit|push)\b[^\n]*--no-verify/,
    'Skipping git hooks (--no-verify) is not allowed; fix the failing check instead.',
  ],
  [/git\s+reset\s+--hard\s+origin\/main/, 'Hard reset to origin/main would discard local work.'],
  [
    /rm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\*)(\s|$)/,
    'Refusing to recursively delete a root, home or wildcard path.',
  ],
];

for (const [pattern, reason] of rules) {
  if (pattern.test(command)) {
    console.error(`Blocked by .claude/hooks/guard-commands.mjs: ${reason}`);
    process.exit(2);
  }
}
