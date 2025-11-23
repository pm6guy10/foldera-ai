
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
console.log('🔍 Checking Auth Environment Configuration...');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found!');
  process.exit(1);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath));
const nextAuthUrl = envConfig.NEXTAUTH_URL;

console.log('----------------------------------------');
if (nextAuthUrl === 'http://localhost:3000') {
  console.log('✅ NEXTAUTH_URL is correctly set to http://localhost:3000');
} else {
  console.log('❌ NEXTAUTH_URL Mismatch');
  console.log(`   Current Value: "${nextAuthUrl}"`);
  console.log('   Expected:      "http://localhost:3000"');
  console.log('   Action: Please update .env.local to use localhost for testing.');
}
console.log('----------------------------------------');

