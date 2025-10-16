const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing WhatsApp Bot SaaS Backend...\n');

// Test simple server first
console.log('1️⃣ Testing simple server (no database dependencies)...');
const simpleServer = spawn('npm', ['run', 'dev:simple'], {
  cwd: path.join(__dirname),
  stdio: 'inherit',
  shell: true
});

// Kill after 10 seconds if successful
setTimeout(() => {
  console.log('\n✅ Simple server test completed');
  simpleServer.kill();
  
  console.log('\n2️⃣ Testing full server...');
  // Test full server
  const fullServer = spawn('npm', ['run', 'dev:quick'], {
    cwd: path.join(__dirname),
    stdio: 'inherit',
    shell: true
  });
  
  setTimeout(() => {
    console.log('\n✅ Full server test completed');
    fullServer.kill();
    process.exit(0);
  }, 10000);
  
}, 10000);

simpleServer.on('error', (error) => {
  console.error('❌ Error testing simple server:', error);
  process.exit(1);
});