#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building Ronen Smart Fields Library...\n');

try {
  // Clean dist directory
  console.log('🧹 Cleaning dist directory...');
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }

  // Compile TypeScript
  console.log('📦 Compiling TypeScript...');
  execSync('tsc', { stdio: 'inherit' });

  // Build CSS
  console.log('🎨 Building CSS...');
  execSync('npm run build:css', { stdio: 'inherit' });

  // Copy additional files
  console.log('📋 Copying additional files...');
  
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // Copy README to dist for npm
  if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', 'dist/README.md');
  }

  // Copy package.json to dist
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const distPackageJson = {
    ...packageJson,
    main: './index.js',
    types: './index.d.ts',
    files: ['**/*'],
    scripts: undefined,
    devDependencies: undefined,
  };
  fs.writeFileSync('dist/package.json', JSON.stringify(distPackageJson, null, 2));

  console.log('\n✅ Build completed successfully!');
  console.log('📁 Output directory: dist/');
  console.log('📦 Ready for npm publish!');

} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}



