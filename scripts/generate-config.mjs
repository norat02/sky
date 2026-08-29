import { writeFileSync } from 'node:fs';

const config = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_REDIRECT_URL: process.env.SUPABASE_REDIRECT_URL || ''
};

const js = `// Generated at build time. Do not commit this file.\nwindow.SKY_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
writeFileSync('config.js', js, 'utf8');
console.log(`Supabase runtime config generated (${config.SUPABASE_URL ? 'configured' : 'offline fallback'}).`);
