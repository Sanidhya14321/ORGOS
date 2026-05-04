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

(async function main(){
  try {
    console.log('Checking Postgres...');
    await checkPostgres();

    console.log('Checking Redis...');
    await checkRedis();

    console.log('\nSmoke tests passed.\nStart your services or run integration tests that depend on Postgres/Redis.');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(2);
  }
})();
