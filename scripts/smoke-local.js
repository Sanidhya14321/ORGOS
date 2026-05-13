import { Client } from 'pg';
import IORedis from 'ioredis';

async function checkPostgres() {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'orgos',
    password: process.env.PGPASSWORD || 'orgos_pass',
    database: process.env.PGDATABASE || 'orgos_dev',
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT 1 as ok');
    console.log('Postgres OK:', res.rows[0]);
  } finally {
    await client.end();
  }
}

async function checkRedis() {
  const redis = new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    connectTimeout: 5000,
  });

  try {
    await redis.ping();
    await redis.set('orgos_smoke_test', 'ok', 'EX', 10);
    const v = await redis.get('orgos_smoke_test');
    console.log('Redis OK:', v === 'ok');
  } finally {
    redis.disconnect();
  }
}

async function checkRemoteApiHealth() {
  const base = process.env.ORGOS_SMOKE_API_URL?.trim();
  if (!base) {
    return;
  }
  const url = `${base.replace(/\/$/, '')}/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Remote API health check failed: ${res.status} ${url}`);
  }
  const body = await res.json().catch(() => null);
  if (!body || typeof body.status !== 'string') {
    throw new Error(`Remote API health returned unexpected JSON: ${url}`);
  }
  console.log('Remote API OK:', url, 'status=', body.status);
}

(async function main(){
  try {
    if (!process.env.ORGOS_SMOKE_SKIP_POSTGRES) {
      console.log('Checking Postgres...');
      await checkPostgres();
    } else {
      console.log('Skipping Postgres (ORGOS_SMOKE_SKIP_POSTGRES=1)');
    }

    if (!process.env.ORGOS_SMOKE_SKIP_REDIS) {
      console.log('Checking Redis...');
      await checkRedis();
    } else {
      console.log('Skipping Redis (ORGOS_SMOKE_SKIP_REDIS=1)');
    }

    if (process.env.ORGOS_SMOKE_API_URL) {
      console.log('Checking remote API (ORGOS_SMOKE_API_URL)...');
      await checkRemoteApiHealth();
    }

    console.log('\nSmoke tests passed.\nStart your services or run integration tests that depend on Postgres/Redis.');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(2);
  }
})();
