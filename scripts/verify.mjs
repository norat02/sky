import { readFileSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
assert(html.includes('homeLeaderboard'));
assert(html.includes('refreshHomeLeaderboard'));
assert(html.includes('signInWithOAuth'));
assert(html.includes('signInWithPassword'));
assert(html.includes('SUPABASE_REDIRECT_URL'));
assert(!html.toLowerCase().includes('neon'));
assert(readFileSync('supabase/schema.sql', 'utf8').includes('authenticated users can submit scores'));
assert(readFileSync('.env.example', 'utf8').includes('SUPABASE_URL='));
writeFileSync('/tmp/sky-inline-current.js', scripts.join('\n'), 'utf8');
console.log(`verified HTML and ${scripts.length} inline script blocks`);
