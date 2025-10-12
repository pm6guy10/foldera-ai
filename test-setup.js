#!/usr/bin/env node
/**
 * FOLDERA SETUP TESTER
 * Tests what's configured and what's missing
 * Run: node test-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 FOLDERA SETUP CHECK\n');
console.log('='.repeat(60));

// Load environment variables
const envPath = path.join(__dirname, '.env.local');
let env = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });
  console.log('✅ Found .env.local file\n');
} else {
  console.log('❌ NO .env.local FILE FOUND!\n');
  console.log('📝 Create it with:\n');
  console.log('   touch .env.local\n');
}

// Check each required variable
const checks = {
  '🗄️  DATABASE': {
    'NEXT_PUBLIC_SUPABASE_URL': {
      required: true,
      example: 'https://xxxxx.supabase.co',
      where: 'https://app.supabase.com → Settings → API'
    },
    'SUPABASE_SERVICE_ROLE_KEY': {
      required: true,
      example: 'eyJhbGc...',
      where: 'https://app.supabase.com → Settings → API (service_role secret)',
      secure: true
    }
  },
  '🔐 AUTHENTICATION': {
    'NEXTAUTH_SECRET': {
      required: true,
      example: 'Generate with: openssl rand -base64 32',
      where: 'Generate locally',
      secure: true
    },
    'NEXTAUTH_URL': {
      required: true,
      example: 'http://localhost:3000',
      where: 'Your app URL'
    }
  },
  '🔑 GOOGLE OAUTH': {
    'GOOGLE_CLIENT_ID': {
      required: true,
      example: '123456789-xxx.apps.googleusercontent.com',
      where: 'https://console.cloud.google.com → Credentials'
    },
    'GOOGLE_CLIENT_SECRET': {
      required: true,
      example: 'GOCSPX-xxxxx',
      where: 'https://console.cloud.google.com → Credentials',
      secure: true
    }
  },
  '🤖 AI SERVICE': {
    'ANTHROPIC_API_KEY': {
      required: true,
      example: 'sk-ant-api03-xxxxx',
      where: 'https://console.anthropic.com → API Keys',
      secure: true
    }
  },
  '📧 EMAIL SERVICE': {
    'RESEND_API_KEY': {
      required: false,
      example: 're_xxxxx',
      where: 'https://resend.com → API Keys',
      secure: true
    },
    'RESEND_FROM_EMAIL': {
      required: false,
      example: 'onboarding@resend.dev',
      where: 'Use resend.dev for testing'
    }
  },
  '💳 STRIPE (OPTIONAL FOR NOW)': {
    'STRIPE_SECRET_KEY': {
      required: false,
      example: 'sk_test_xxxxx',
      where: 'https://dashboard.stripe.com → Developers → API keys',
      secure: true
    },
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': {
      required: false,
      example: 'pk_test_xxxxx',
      where: 'https://dashboard.stripe.com → Developers → API keys'
    }
  }
};

let totalRequired = 0;
let totalConfigured = 0;
let missingCritical = [];

Object.entries(checks).forEach(([section, vars]) => {
  console.log(`\n${section}`);
  console.log('-'.repeat(60));
  
  Object.entries(vars).forEach(([key, config]) => {
    const value = env[key];
    const hasValue = value && value !== '' && !value.includes('placeholder');
    
    if (config.required) totalRequired++;
    if (hasValue && config.required) totalConfigured++;
    
    let status = '❌';
    let message = 'NOT SET';
    
    if (hasValue) {
      status = '✅';
      if (config.secure) {
        message = `SET (${value.substring(0, 8)}...${value.slice(-4)})`;
      } else {
        message = `SET (${value})`;
      }
    } else if (!config.required) {
      status = '⚠️ ';
      message = 'OPTIONAL - not set';
    } else {
      missingCritical.push({ key, config });
    }
    
    const required = config.required ? '🔴 REQUIRED' : '🟡 OPTIONAL';
    console.log(`  ${status} ${key}`);
    console.log(`     ${message}`);
    console.log(`     ${required}`);
    
    if (!hasValue && config.where) {
      console.log(`     📍 Get it: ${config.where}`);
    }
  });
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 SUMMARY:\n');
console.log(`   Configured: ${totalConfigured}/${totalRequired} required keys`);

if (totalConfigured === totalRequired) {
  console.log('\n   🎉 ALL REQUIRED KEYS CONFIGURED!');
  console.log('\n   ✅ Ready to test basic functionality');
} else {
  console.log(`\n   ❌ Missing ${totalRequired - totalConfigured} critical key(s)\n`);
  console.log('   🔴 BLOCKING ISSUES:\n');
  missingCritical.forEach(({ key, config }) => {
    console.log(`      • ${key}`);
    console.log(`        Get it: ${config.where}`);
    if (config.example) {
      console.log(`        Example: ${config.example}`);
    }
  });
}

// Check dependencies
console.log('\n' + '='.repeat(60));
console.log('\n📦 DEPENDENCIES:\n');

const hasNodeModules = fs.existsSync(path.join(__dirname, 'node_modules'));
const hasPackageJson = fs.existsSync(path.join(__dirname, 'package.json'));

if (hasNodeModules) {
  console.log('   ✅ node_modules/ exists - dependencies installed');
} else if (hasPackageJson) {
  console.log('   ❌ node_modules/ missing - run: npm install');
} else {
  console.log('   ❌ No package.json found!');
}

// Check database migrations
console.log('\n' + '='.repeat(60));
console.log('\n🗄️  DATABASE MIGRATIONS:\n');

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
if (fs.existsSync(migrationsDir)) {
  const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  console.log(`   ✅ Found ${migrations.length} migration file(s):`);
  migrations.forEach(m => {
    console.log(`      • ${m}`);
  });
  console.log('\n   ⚠️  Apply them via Supabase Dashboard → SQL Editor');
  console.log('       Or run: supabase db push');
} else {
  console.log('   ❌ No migrations directory found');
}

// Next steps
console.log('\n' + '='.repeat(60));
console.log('\n🎯 NEXT STEPS:\n');

if (missingCritical.length > 0) {
  console.log('   1. Create .env.local file');
  console.log('   2. Add missing environment variables (see above)');
  console.log('   3. Run: npm install');
  console.log('   4. Apply database migrations');
  console.log('   5. Run: npm run dev');
  console.log('   6. Test: http://localhost:3000');
} else {
  if (!hasNodeModules) {
    console.log('   1. Run: npm install');
  }
  console.log('   2. Apply database migrations (if not done)');
  console.log('   3. Run: npm run dev');
  console.log('   4. Visit: http://localhost:3000');
  console.log('   5. Test authentication flow');
}

console.log('\n' + '='.repeat(60));
console.log('\n📚 DOCUMENTATION:\n');
console.log('   • Setup Guide: docs/MEETING_PREP_SETUP.md');
console.log('   • Testing Guide: docs/QUICK_START_TESTING.md');
console.log('   • Launch Guide: docs/LAUNCH_READY.md');

console.log('\n');
