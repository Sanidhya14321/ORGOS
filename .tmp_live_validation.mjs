import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';

import { GroqProvider } from './packages/agent-core/src/llm/groq.ts';

dotenv.config({ path: '.env.local' });

const API_URL = 'http://127.0.0.1:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractAccessToken(setCookieHeader) {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error('Missing Set-Cookie header');
  const match = header.match(/orgos_access_token=([^;]+)/);
  if (!match) throw new Error('Missing orgos_access_token cookie');
  return decodeURIComponent(match[1]);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { status: response.status, body: json, headers: response.headers };
}

async function waitForRoutingSuggestion(taskId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const routingRows = await supabase
      .from('routing_suggestions')
      .select('suggested, confirmed, outcome, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!routingRows.error && routingRows.data && routingRows.data.length > 0) {
      const latest = routingRows.data[0];
      if (Array.isArray(latest.suggested) && latest.suggested.length > 0) {
        return latest.suggested;
      }
    }

    await sleep(1000);
  }

  return [];
}

async function main() {
  const stamp = Date.now().toString(36);
  const orgName = `ORGOS QA ${stamp}`;
  const orgDomain = `${stamp}.orgos.qa`;
  const password = `QaPass-${stamp}-2026!`;
  const ceoEmail = `ceo.${stamp}@orgos.qa`;
  const managerEmail = `manager.${stamp}@orgos.qa`;

  const ceoAuth = await supabase.auth.admin.createUser({
    email: ceoEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'CEO User', role: 'ceo', department: 'Executive', agent_enabled: true }
  });
  if (ceoAuth.error || !ceoAuth.data.user) throw new Error(`CEO create failed: ${ceoAuth.error?.message}`);

  const managerAuth = await supabase.auth.admin.createUser({
    email: managerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Manager User', role: 'manager', department: 'Operations', agent_enabled: true }
  });
  if (managerAuth.error || !managerAuth.data.user) throw new Error(`Manager create failed: ${managerAuth.error?.message}`);

  const orgResult = await supabase.from('orgs').insert({
    name: orgName,
    domain: orgDomain,
    created_by: null
  }).select('id').single();
  if (orgResult.error || !orgResult.data) throw new Error(`Org create failed: ${orgResult.error?.message}`);
  const orgId = orgResult.data.id;

  const ceoPositionResult = await supabase.from('positions').insert({
    org_id: orgId,
    title: 'Chief Executive Officer',
    level: 0,
    is_custom: false,
    confirmed: true
  }).select('id').single();
  if (ceoPositionResult.error || !ceoPositionResult.data) throw new Error(`CEO position create failed: ${ceoPositionResult.error?.message}`);

  const managerPositionResult = await supabase.from('positions').insert({
    org_id: orgId,
    title: 'Operations Manager',
    level: 1,
    is_custom: false,
    confirmed: true
  }).select('id').single();
  if (managerPositionResult.error || !managerPositionResult.data) throw new Error(`Manager position create failed: ${managerPositionResult.error?.message}`);

  const ceoProfile = {
    id: ceoAuth.data.user.id,
    email: ceoEmail,
    full_name: 'CEO User',
    role: 'ceo',
    status: 'active',
    org_id: orgId,
    position_id: ceoPositionResult.data.id,
    department: 'Executive',
    reports_to: null,
    skills: ['strategy', 'planning'],
    open_task_count: 0,
    agent_enabled: true,
    email_verified: true
  };

  const managerProfile = {
    id: managerAuth.data.user.id,
    email: managerEmail,
    full_name: 'Manager User',
    role: 'manager',
    status: 'active',
    org_id: orgId,
    position_id: managerPositionResult.data.id,
    department: 'Operations',
    reports_to: ceoAuth.data.user.id,
    skills: ['coordination', 'delivery'],
    open_task_count: 0,
    agent_enabled: true,
    email_verified: true
  };

  const ceoUser = await supabase.from('users').upsert(ceoProfile, { onConflict: 'id' }).select('id').single();
  if (ceoUser.error || !ceoUser.data) throw new Error(`CEO profile upsert failed: ${ceoUser.error?.message}`);

  const managerUser = await supabase.from('users').upsert(managerProfile, { onConflict: 'id' }).select('id').single();
  if (managerUser.error || !managerUser.data) throw new Error(`Manager profile upsert failed: ${managerUser.error?.message}`);

  const orgLink = await supabase.from('orgs').update({ created_by: ceoAuth.data.user.id }).eq('id', orgId);
  if (orgLink.error) throw new Error(`Org link failed: ${orgLink.error.message}`);

  const goalResult = await supabase.from('goals').insert({
    created_by: ceoAuth.data.user.id,
    title: `Launch goal ${stamp}`,
    raw_input: 'Launch the organization routing flow',
    description: 'Validate live routing, assignment, and Groq connectivity',
    status: 'active',
    priority: 'high',
    kpi: 'Routing flow validated',
    simulation: false
  }).select('id').single();
  if (goalResult.error || !goalResult.data) throw new Error(`Goal create failed: ${goalResult.error?.message}`);

  const ceoLogin = await api('/api/auth/login', { method: 'POST', body: { email: ceoEmail, password } });
  const managerLogin = await api('/api/auth/login', { method: 'POST', body: { email: managerEmail, password } });
  if (ceoLogin.status !== 200) throw new Error(`CEO login failed: ${ceoLogin.status}`);
  if (managerLogin.status !== 200) throw new Error(`Manager login failed: ${managerLogin.status}`);

  const ceoToken = extractAccessToken(ceoLogin.headers.get('set-cookie'));
  const managerToken = extractAccessToken(managerLogin.headers.get('set-cookie'));

  const socketEvents = [];
  const requesterSocket = io(API_URL, { auth: { token: ceoToken } });
  const managerSocket = io(API_URL, { auth: { token: managerToken } });
  requesterSocket.on('task:routing_ready', () => socketEvents.push('task:routing_ready'));
  requesterSocket.on('task:assigned', () => socketEvents.push('task:assigned:requester'));
  managerSocket.on('task:assigned', () => socketEvents.push('task:assigned:manager'));

  const me = await api('/api/me', { token: ceoToken });
  const positions = await api(`/api/orgs/${orgId}/positions`, { token: ceoToken });
  const tree = await api(`/api/orgs/${orgId}/tree`, { token: ceoToken });

  const taskCreate = await api('/api/tasks', {
    method: 'POST',
    token: ceoToken,
    body: {
      orgId,
      goalId: goalResult.data.id,
      title: `Live routing task ${stamp}`,
      description: 'Validate the routing confirm path against real Supabase data',
      successCriteria: 'The confirm and delegate steps return success',
      priority: 'high',
      assignedRole: 'manager',
      depth: 0,
      recurrenceEnabled: false,
      recurrenceTimezone: 'UTC',
      requiresEvidence: false,
      assignees: [managerAuth.data.user.id]
    }
  });

  if (taskCreate.status !== 202) throw new Error(`Task create failed: ${taskCreate.status} ${JSON.stringify(taskCreate.body)}`);
  const taskId = taskCreate.body.id;

  const capacity = await api('/api/tasks/workload/capacity', { token: ceoToken });
  const suggest = await api(`/api/tasks/${taskId}/routing-suggest`, { method: 'POST', token: ceoToken, body: {} });
  const suggestions = suggest.status === 200 && Array.isArray(suggest.body?.suggestions) && suggest.body.suggestions.length > 0
    ? suggest.body.suggestions
    : await waitForRoutingSuggestion(taskId);

  const confirm = await api(`/api/tasks/${taskId}/routing-confirm`, {
    method: 'POST',
    token: ceoToken,
    body: {
      confirmed: suggestions.length > 0 ? suggestions : [{ assigneeId: managerAuth.data.user.id, reason: 'Fallback manager assignment for validation', confidence: 0.9 }],
      status: 'pending'
    }
  });

  const delegate = await api(`/api/tasks/${taskId}/delegate`, {
    method: 'POST',
    token: ceoToken,
    body: { assignTo: managerAuth.data.user.id }
  });

  await sleep(2500);

  let groqStatus = 0;
  let groqContentLength = 0;
  const groq = new GroqProvider(process.env.GROQ_API_KEY);
  const groqResponse = await groq.complete([{ role: 'user', content: 'Reply with one short sentence.' }], { temperature: 0 });
  groqStatus = groqResponse ? 200 : 0;
  groqContentLength = typeof groqResponse?.content === 'string' ? groqResponse.content.length : 0;

  requesterSocket.disconnect();
  managerSocket.disconnect();

  console.log(JSON.stringify({
    credentials: { ceoEmail, managerEmail, password },
    orgId,
    taskId,
    statuses: {
      loginCEO: ceoLogin.status,
      loginManager: managerLogin.status,
      me: me.status,
      positions: positions.status,
      tree: tree.status,
      taskCreate: taskCreate.status,
      capacity: capacity.status,
      routingSuggest: suggest.status,
      routingConfirm: confirm.status,
      delegate: delegate.status,
      groq: groqStatus,
      groqContentLength
    },
    socketEvents
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
