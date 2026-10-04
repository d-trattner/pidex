// Shell paths travel through argv so Git Bash performs its ordinary native-path
// conversion. Direct Node capabilities already receive native environment paths.
import { historyMain } from './history.mjs';
const [kind, canonical, legacy, temp, ...args] = process.argv.slice(2);
historyMain(kind, args, { ...process.env, PIDEX_STATE_DIR: canonical, RUNNING_PI_STATE_DIR: legacy, TMPDIR: temp });
