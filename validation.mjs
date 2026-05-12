import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const API_URL = 'http://127.0.0.1:4000';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const report = {
    generatedCredentials: [],
    orgId: null,
    taskId: null,
    statuses: {},
    socketEvents: [],
    groqStatus: 'not_tested',
    failures: []
  };

  try {
    // 1. Seed Org & Users
    const suffix = Math.random().toString(36).substring(7);
    const ceoEmail = \`ceo_\${suffix}@example.com\`;
    const mgrEmail = \`mgr_\${suffix}@example.com\`;
    const password = 'Password123!';

    const { data: authCeo, error: ceoErr } = await supabase.auth.admin.createUser({
      email: ceoEmail, password, email_confirm: true
    });
    if (ceoErr) throw ceoErr;
    const { data: authMgr, error: mgrErr } = await supabase.auth.admin.createUser({
      email: mgrEmail, password, email_confirm: true
    });
    if (mgrErr) throw mgrErr;

    report.generatedCredentials.push({ role: 'CEO', email: ceoEmail, password });
    report.generatedCredentials.push({ role: 'Mgr', email: mgrEmail, password });

    const { data: org, error: orgErr } = await supabase.from('organizations').insert({ name: 'Valid Org ' + suffix }).select().single();
    if (orgErr) throw orgErr;
    report.orgId = org.id;

    // Positions
    const { data: posCeo } = await supabase.from('positions').insert({ organization_id: org.id, title: 'CEO', user_id: authCeo.user.id }).select().single();
    const { data: posMgr } = await supabase.from('positions').insert({ organization_id: org.id, title: 'Manager', user_id: authMgr.user.id, reports_to: posCeo.id }).select().single();

    // 2. Login
    const login = async (email) => {
      const res = await fetch(\`\${API_URL}/api/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      report.statuses['/api/auth/login'] = res.status;
      return res.json();
    };

    const ceoSession = await login(ceoEmail);
    const mgrSession = await login(mgrEmail);
    const ceoToken = ceoSession.token;

    // 3. Verify Endpoints
    const apiGet = async (path, token) => {
      const res = await fetch(\`\${API_URL}\${path}\`, {
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      report.statuses[path] = res.status;
      return res.json();
    };

    await apiGet('/api/me', ceoToken);
    await apiGet(\`/api/orgs/\${org.id}/positions\`, ceoToken);
    await apiGet(\`/api/orgs/\${org.id}/tree\`, ceoToken);

    // Create Goal & Task (via Supabase for speed or API)
    const { data: goal } = await supabase.from('goals').insert({ organization_id: org.id, title: 'Big Goal', created_by: authCeo.user.id }).select().single();
    const { data: task } = await supabase.from('tasks').insert({ 
        organization_id: org.id, 
        goal_id: goal.id, 
        title: 'Do Work', 
        status: 'pending',
        created_by: authCeo.user.id
    }).select().single();
    report.taskId = task.id;

    await apiGet('/api/tasks', ceoToken);
    await apiGet('/api/tasks/workload/capacity', ceoToken);
    
    // 4. Socket Events Setup
    const socket = io(API_URL, { auth: { token: ceoToken } });
    socket.on('task:routing_ready', (data) => report.socketEvents.push('task:routing_ready'));
    socket.on('task:assigned', (data) => report.socketEvents.push('task:assigned'));

    // 5. Task Actions
    const post = async (path, body = {}, token = ceoToken) => {
        const res = await fetch(\`\${API_URL}\${path}\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
            body: JSON.stringify(body)
        });
        report.statuses[path] = res.status;
        return res.json();
    }

    await post(\`/api/tasks/\${task.id}/routing-suggest\`);
    // Wait for AI/Socket
    await new Promise(r => setTimeout(r, 2000));

    await post(\`/api/tasks/\${task.id}/routing-confirm\`, { suggested_position_id: posMgr.id });
    await post(\`/api/tasks/\${task.id}/delegate\`, { target_position_id: posMgr.id });

    // 6. Groq check (simple proxy check or status)
    // Assuming /api/ai/chat or similar exists based on ref
    const groqRes = await fetch(\`\${API_URL}/api/ai/chat\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${ceoToken}\` },
        body: JSON.stringify({ message: 'hi', model: 'llama3-8b-8192' })
    }).catch(e => ({ status: 'error' }));
    report.groqStatus = groqRes.status === 200 ? 'online' : 'failed/not_found';

    socket.disconnect();
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    report.failures.push(err.message);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

run();
