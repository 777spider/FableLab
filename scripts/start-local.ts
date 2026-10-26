// No paid calls by default. Set STUDIO_ENABLE_AI=1 and explicitly provide credentials to enable them.
import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,STUDIO_HOST:process.env.STUDIO_HOST??'127.0.0.1',STUDIO_PORT:process.env.STUDIO_PORT??'4318'}});child.once('exit',code=>process.exit(code??1));process.once('SIGINT',()=>child.kill('SIGINT'));
