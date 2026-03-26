const { execSync } = require('child_process');

const target = process.env.BUILD_TARGET || 'dashboard';

if (target === 'tracker') {
  console.log('Starting order cycle tracker...');
  execSync('node server.js', { stdio: 'inherit' });
} else {
  console.log('Starting dashboard...');
  execSync('node dashboard-server.js', { stdio: 'inherit' });
}
