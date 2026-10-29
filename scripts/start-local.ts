import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// Rebuild on launch so a git pull cannot silently serve an older interface.
async function run(args: string[], service = false) {
  return await new Promise<number>((done, reject) => {
    const child = spawn(process.execPath, args, { stdio: service ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit', windowsHide: true });
    const interrupt = () => { if (service && child.connected) child.send('shutdown'); else child.kill('SIGINT'); };
    process.once('SIGINT', interrupt);
    child.once('error', reject); child.once('exit', code => { process.removeListener('SIGINT', interrupt); done(code ?? 1); });
  });
}
if (!existsSync(resolve('node_modules/vite/bin/vite.js'))) throw new Error('Run npm ci first.');
const checked = await run(['node_modules/typescript/bin/tsc', '--noEmit']);
if (checked) process.exit(checked);
const built = await run(['node_modules/vite/bin/vite.js', 'build']);
if (built) process.exit(built);
process.exit(await run(['--import', 'tsx', 'server/index.ts'], true));
