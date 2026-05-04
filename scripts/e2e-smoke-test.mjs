#!/usr/bin/env node
/**
 * E2E smoke test harness for local development.
 * 
 * Tests basic Supabase + Upstash connectivity and API health.
 * Uses native Node.js fetch (no external dependencies).
 * 
 * Setup:
 *   1. Create ephemeral Supabase project (free tier, ~25 min setup)
 *   2. Create ephemeral Upstash Redis project (free tier)
 *   3. Update .env with ephemeral credentials
 *   4. Run: npm run smoke:e2e
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const tests = [];
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    console.log(`[TEST] ${name}...`);
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
    tests.push({ name, error: err.message });
  }
}

async function testHealthEndpoint() {
  const res = await fetch(`${API_URL}/healthz`);
  if (res.status !== 200) throw new Error(`Health check failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok && data.status !== 'ok' && data.status !== 'degraded') {
    throw new Error('Health check response invalid');
  }
}

async function testSupabaseConnection() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  }
  
  // Simple connectivity test via CORS-enabled endpoint
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  if (!res.ok && res.status !== 401) {
    throw new Error(`Supabase API failed: ${res.status}`);
  }
}

async function testUpstashConnection() {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env');
  }
  
  const res = await fetch(`${UPSTASH_REDIS_REST_URL}/ping`, {
    headers: {
      'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
    }
  });
  
  if (!res.ok) throw new Error(`Redis API failed: ${res.status}`);
  const data = await res.json();
  if (data.result !== 'PONG') throw new Error('Redis ping failed: ' + JSON.stringify(data));
}

async function testAuthLogin() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'test-password'
    })
  });
  
  // Expect 401 or 400 (auth failure) or 200 (success); just verify no 500
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
}

async function testMetricsEndpoint() {
  const res = await fetch(`${API_URL}/metrics`);
  if (res.status !== 200) throw new Error(`Metrics endpoint failed: ${res.status}`);
  const text = await res.text();
  if (!text.includes('# HELP') && !text.includes('# TYPE')) {
    throw new Error('Metrics response invalid (no Prometheus format)');
  }
}

async function runSmokeTests() {
  console.log('\n=== E2E Smoke Tests ===\n');
  
  await test('API health check', testHealthEndpoint);
  await test('Supabase connection', testSupabaseConnection);
  await test('Upstash Redis connection', testUpstashConnection);
  await test('Auth login endpoint', testAuthLogin);
  await test('Prometheus metrics endpoint', testMetricsEndpoint);
  
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  
  if (failed > 0) {
    console.error('Failed tests:', tests);
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error('Smoke test runner error:', err);
  process.exit(1);
});
