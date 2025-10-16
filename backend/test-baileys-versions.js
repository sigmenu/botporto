const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 [VERSION TEST] Baileys Version Compatibility Test');
console.log('='.repeat(50));

class BaileysVersionTester {
  constructor() {
    this.versions = [
      '6.4.0',
      '6.5.0', 
      '6.6.0',
      '6.7.0',
      '6.7.10',
      '6.7.19'
    ];
    this.results = [];
    this.originalPackageJson = null;
  }

  async runTest() {
    console.log(`📦 [VERSION TEST] Testing ${this.versions.length} Baileys versions...`);
    
    // Backup original package.json
    await this.backupPackageJson();
    
    for (const version of this.versions) {
      console.log(`\n🔄 [VERSION TEST] Testing Baileys v${version}...`);
      const result = await this.testVersion(version);
      this.results.push(result);
      
      // Brief pause between tests
      await this.sleep(2000);
    }
    
    // Restore original package.json
    await this.restorePackageJson();
    
    // Print summary
    this.printSummary();
  }

  async testVersion(version) {
    const startTime = Date.now();
    const result = {
      version,
      success: false,
      installSuccess: false,
      importSuccess: false,
      socketCreationSuccess: false,
      error: null,
      duration: 0
    };

    try {
      // Install specific version
      console.log(`📦 [VERSION TEST] Installing @whiskeysockets/baileys@${version}...`);
      execSync(`npm install @whiskeysockets/baileys@${version} --no-save --silent`, {
        cwd: __dirname,
        stdio: 'pipe'
      });
      result.installSuccess = true;
      console.log(`✅ [VERSION TEST] v${version} installed successfully`);

      // Test import
      try {
        delete require.cache[require.resolve('@whiskeysockets/baileys')];
        const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
        result.importSuccess = true;
        console.log(`✅ [VERSION TEST] v${version} import successful`);

        // Test basic socket creation
        const { state } = await useMultiFileAuthState(path.join(__dirname, `test_auth_${version}`));
        
        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
          browser: [`Test-${version}`, 'Chrome', '1.0.0']
        });

        if (sock) {
          result.socketCreationSuccess = true;
          console.log(`✅ [VERSION TEST] v${version} socket creation successful`);
          
          // Clean up socket
          if (sock.ws && sock.ws.readyState === 1) {
            sock.ws.close();
          }
        }

        result.success = true;

      } catch (importError) {
        console.log(`❌ [VERSION TEST] v${version} import/socket error:`, importError.message);
        result.error = importError.message;
      }

    } catch (installError) {
      console.log(`❌ [VERSION TEST] v${version} installation failed:`, installError.message);
      result.error = installError.message;
    }

    result.duration = Date.now() - startTime;
    console.log(`⏱️ [VERSION TEST] v${version} test completed in ${result.duration}ms`);
    
    return result;
  }

  async backupPackageJson() {
    try {
      const packageJsonPath = path.join(__dirname, 'package.json');
      const backupPath = path.join(__dirname, 'package.json.backup');
      
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        this.originalPackageJson = content;
        fs.writeFileSync(backupPath, content);
        console.log('💾 [VERSION TEST] Package.json backed up');
      }
    } catch (error) {
      console.log('⚠️ [VERSION TEST] Could not backup package.json:', error.message);
    }
  }

  async restorePackageJson() {
    try {
      const packageJsonPath = path.join(__dirname, 'package.json');
      const backupPath = path.join(__dirname, 'package.json.backup');
      
      if (this.originalPackageJson) {
        fs.writeFileSync(packageJsonPath, this.originalPackageJson);
        console.log('🔄 [VERSION TEST] Package.json restored');
      } else if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, packageJsonPath);
        console.log('🔄 [VERSION TEST] Package.json restored from backup');
      }
      
      // Clean up backup
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }

      // Reinstall original dependencies
      console.log('📦 [VERSION TEST] Reinstalling original dependencies...');
      execSync('npm install --silent', {
        cwd: __dirname,
        stdio: 'pipe'
      });

    } catch (error) {
      console.log('⚠️ [VERSION TEST] Could not restore package.json:', error.message);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 [VERSION TEST] BAILEYS VERSION COMPATIBILITY REPORT');
    console.log('='.repeat(60));

    const successfulVersions = this.results.filter(r => r.success);
    const failedVersions = this.results.filter(r => !r.success);

    console.log(`✅ Successful versions: ${successfulVersions.length}/${this.results.length}`);
    console.log(`❌ Failed versions: ${failedVersions.length}/${this.results.length}`);
    
    console.log('\n📈 [VERSION TEST] Detailed Results:');
    console.log('-'.repeat(60));
    
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const details = result.success 
        ? `Install: ${result.installSuccess ? '✅' : '❌'} | Import: ${result.importSuccess ? '✅' : '❌'} | Socket: ${result.socketCreationSuccess ? '✅' : '❌'}`
        : `Error: ${result.error?.substring(0, 50)}...`;
      
      console.log(`${status} v${result.version.padEnd(8)} | ${result.duration}ms | ${details}`);
    });

    if (successfulVersions.length > 0) {
      console.log('\n🎯 [VERSION TEST] Recommended versions:');
      successfulVersions
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
        .slice(0, 3)
        .forEach(result => {
          console.log(`   • v${result.version} (${result.duration}ms)`);
        });
    }

    if (failedVersions.length > 0) {
      console.log('\n⚠️ [VERSION TEST] Failed versions:');
      failedVersions.forEach(result => {
        console.log(`   • v${result.version}: ${result.error}`);
      });
    }

    console.log('\n🔧 [VERSION TEST] Environment Info:');
    console.log(`   • Node.js: ${process.version}`);
    console.log(`   • Platform: ${process.platform}`);
    console.log(`   • Architecture: ${process.arch}`);
    console.log('='.repeat(60));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [VERSION TEST] Interrupted by user');
  process.exit(0);
});

// Start test
const tester = new BaileysVersionTester();
tester.runTest().catch(error => {
  console.error('❌ [VERSION TEST] Fatal error:', error);
  process.exit(1);
});