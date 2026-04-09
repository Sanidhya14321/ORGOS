const apiBaseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const taskId = process.env.SMOKE_TASK_ID;
const accessToken = process.env.SMOKE_ACCESS_TOKEN;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!taskId || !accessToken) {
  fail("SMOKE_TASK_ID and SMOKE_ACCESS_TOKEN are required to run live report smoke checks.");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    fail(`Request to ${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

const reportPayload = {
  task_id: taskId,
  is_agent: false,
  status: "completed",
  insight: "smoke test report",
  data: { smoke: true },
  confidence: 0.5,
  sources: [],
  escalate: false
};

console.log(`Checking live API at ${apiBaseUrl}`);
await request(`/api/reports`, {
  method: "POST",
  body: JSON.stringify(reportPayload)
});

const reports = await request(`/api/reports/${taskId}`);
console.log(JSON.stringify(reports, null, 2));
