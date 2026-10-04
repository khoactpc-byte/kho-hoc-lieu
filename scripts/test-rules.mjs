import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'test/firestoreRules.integration.test.js', 'test/serverSystemEmulator.integration.test.js'], {
  stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185' }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
