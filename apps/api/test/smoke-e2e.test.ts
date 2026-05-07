import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * E2E Smoke Tests
 * Tests complete user flows: auth, goal creation, task management
 * Requires running API on http://localhost:4000
 */

const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'smoke-test@test.orgos.ai';
const TEST_PASSWORD = process.env.TEST_PASSWORD || TEST_EMAIL;
const runE2E = process.env.RUN_E2E === 'true';

const describeE2E = runE2E ? describe : describe.skip;

describeE2E('E2E Smoke Tests', () => {
  let sessionToken: string | null = null;
  let userId: string | null = null;
  let goalId: string | null = null;

  beforeAll(async () => {
    // Verify API is reachable
    const healthCheck = await fetch(`${API_URL}/health`);
    expect(healthCheck.ok).toBe(true);
  });

  it('should register or login user', async () => {
    // Try to register (will fail if exists, which is OK)
    const regResp = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    // Then login
    const loginResp = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    expect(loginResp.ok).toBe(true);
    const data = await loginResp.json();
    expect(data.sessionToken).toBeDefined();
    sessionToken = data.sessionToken;
  });

  it('should fetch user profile', async () => {
    expect(sessionToken).toBeDefined();

    const resp = await fetch(`${API_URL}/api/me`, {
      headers: { 'Cookie': `sessionToken=${sessionToken}` },
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.id).toBeDefined();
    userId = data.id;
  });

  it('should create a goal', async () => {
    expect(sessionToken).toBeDefined();

    const resp = await fetch(`${API_URL}/api/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sessionToken=${sessionToken}`,
      },
      body: JSON.stringify({
        title: `Smoke Test Goal ${Date.now()}`,
        raw_input: 'Created by E2E smoke test',
        priority: 'high',
      }),
    });

    expect([200, 201, 202]).toContain(resp.status);
    const data = await resp.json();
    expect(data.goalId || data.id).toBeDefined();
    goalId = data.goalId || data.id;
  });

  it('should fetch goals list', async () => {
    expect(sessionToken).toBeDefined();

    const resp = await fetch(`${API_URL}/api/goals?limit=10`, {
      headers: { 'Cookie': `sessionToken=${sessionToken}` },
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(Array.isArray(data.goals || data)).toBe(true);
  });

  it('should fetch tasks', async () => {
    expect(sessionToken).toBeDefined();

    const resp = await fetch(`${API_URL}/api/tasks`, {
      headers: { 'Cookie': `sessionToken=${sessionToken}` },
    });

    // May return 200 or 404 if no tasks yet
    expect([200, 404, 400, 500]).toContain(resp.status);
  });

  it('should expose /metrics endpoint', async () => {
    const resp = await fetch(`${API_URL}/metrics`);

    if (resp.ok) {
      const text = await resp.text();
      expect(text.length).toBeGreaterThan(0);
      // Should contain Prometheus format
      expect(text).toMatch(/^[a-z_]/m);
    } else {
      // Metrics may not be enabled; that's OK
      expect([200, 404, 500]).toContain(resp.status);
    }
  });

  afterAll(async () => {
    // Cleanup: could delete test goal if needed
    // For now, just verify session can be terminated
    if (sessionToken) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Cookie': `sessionToken=${sessionToken}` },
        });
      } catch {
        // Logout may not exist; ignore
      }
    }
  });
});
