const { execSync } = require('child_process');

const target = process.env.BUILD_TARGET || 'dashboard';

if (target === 'tracker') {
  console.log('Building order cycle tracker...');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('Building dashboard...');
  execSync('npm run dashboard:build', { stdio: 'inherit' });
}
