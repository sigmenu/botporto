// Simple runner to execute TypeScript seed with ts-node inside the container
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' }
});
require('./seed.ts');
