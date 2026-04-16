import { spawn } from 'child_process';

const child = spawn('npx', ['prisma', 'db', 'push', '--skip-generate'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'inherit', 'inherit'],
});

// Auto-respond "yes" to the warning prompt
setTimeout(() => {
  child.stdin.write('yes\n');
}, 2000);

child.on('close', (code) => {
  console.log(`\nProcess exited with code ${code}`);
  process.exit(code);
});
