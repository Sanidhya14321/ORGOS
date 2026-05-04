---
title: "Observability Stack Setup"
description: "Sentry error tracking, Prometheus metrics, and Grafana dashboards"
---

# Observability Stack: Sentry + Prometheus + Grafana

This guide covers setting up error tracking (Sentry), metrics collection (Prometheus), and dashboards (Grafana).

## Part 1: Sentry Error Reporting

### Quick Setup (5 min)

**Step 1: Create Sentry Project**
1. Sign up at https://sentry.io (free tier available)
2. Create organization (if new)
3. Create project: Select "Node.js" platform
4. Copy DSN: `https://xxx@xxx.ingest.sentry.io/yyy`

**Step 2: Add to .env**
```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/yyy
SENTRY_ENVIRONMENT=production  # or development
SENTRY_RELEASE=v1.0.0  # Set during deploy
```

**Step 3: Start API**
```bash
npm --prefix apps/api run dev
```

**Step 4: Trigger Test Error**
```bash
# In another terminal
curl -X GET http://localhost:4000/api/invalid-endpoint

# Or trigger error in browser console
fetch('http://localhost:4000/api/goals', { method: 'INVALID' })
```

**Step 5: Verify in Sentry**
- Go to https://sentry.io → Issues
- Should see incoming errors with stack trace

### Features

| Feature | How |
|---------|-----|
| **Error Tracking** | Unhandled exceptions auto-captured |
| **Context** | User ID, request path, method added automatically |
| **Breadcrumbs** | Previous actions logged for debugging |
| **Performance** | Transaction timing (% of requests) |
| **Alerts** | Custom rules (e.g., alert on 10+ errors/min) |
| **Release Tracking** | Compare errors across versions |

### API Integration

**Already wired in `apps/api/src/server.ts`:**

```typescript
// 1. Initialize Sentry
initializeSentry(server.env);

// 2. Error handler captures exceptions
setErrorHandler(async (error, request, reply) => {
  captureException(error, {
    requestId: request.requestId,
    path: request.url,
    method: request.method,
    userId: request.user?.id,
  });
  // ... send error response
});

// 3. Manual breadcrumbs for audit trail
addBreadcrumb("auth", "User logged in", "info");
```

### Production Setup

1. **Set Release Version**
   ```bash
   # In CI/deployment
   export SENTRY_RELEASE=v$(cat package.json | jq -r .version)
   ```

2. **Configure Alerts**
   - Sentry → Alerts → Create Alert Rule
   - Condition: Error rate > 5%
   - Action: Slack notification

3. **Enable Performance Monitoring**
   ```typescript
   // Sentry SDK already has tracesSampleRate configured
   // 10% of prod transactions, 100% in dev
   ```

## Part 2: Prometheus Metrics

### Quick Setup (5 min)

**Step 1: Verify prom-client**
```bash
npm list prom-client
# Should show @orgos/api > prom-client@^15.1.0
```

**Step 2: Metrics Already Wired**

In `apps/api/src/lib/prometheus.ts`:
- HTTP request counter (method, path, status)
- HTTP request latency histogram (method, path)
- LLM provider latency (Groq, Gemini)
- Circuit breaker state (open/closed)
- Provider fallback events

**Step 3: Verify Metrics Endpoint**
```bash
# Start API
npm --prefix apps/api run dev

# In another terminal
curl http://localhost:4000/metrics | head -20

# Output should look like:
# # HELP http_requests_total Total HTTP requests
# # TYPE http_requests_total counter
# http_requests_total{method="GET",path="/healthz",status="200"} 5
```

### Metric Types

**Counters** (monotonically increasing)
- `http_requests_total` – Total requests by method, path, status
- `llm_provider_failures_total` – Provider failures by provider
- `llm_circuit_breaker_opens_total` – Circuit breaker open count
- `llm_provider_fallback_total` – Fallback count by provider

**Histograms** (request latency)
- `http_request_duration_ms` – HTTP latency (buckets: 10, 50, 100, 500, 1000, 5000ms)
- `llm_provider_latency_ms` – LLM provider latency (buckets: 10, 100, 500, 1000, 3000, 8000ms)

### Local Prometheus Setup

**Option 1: Docker (if you want to use containers for observability only)**
```bash
docker run -d \
  -p 9090:9090 \
  -v /tmp/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest
```

**Option 2: Standalone Binary (no Docker)**
```bash
# Download from https://prometheus.io/download/
wget https://github.com/prometheus/prometheus/releases/download/v2.51.0/prometheus-2.51.0.linux-amd64.tar.gz
tar -xzf prometheus-2.51.0.linux-amd64.tar.gz
cd prometheus-2.51.0.linux-amd64

# Create prometheus.yml (see below)
# Run:
./prometheus --config.file=prometheus.yml
```

**prometheus.yml:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'orgos-api'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

**Access Prometheus:**
- Open http://localhost:9090
- Graph tab: Enter metric name (e.g., `http_requests_total`)

### Production: Cloud Metrics Services

#### **Datadog** (Recommended for small teams)

**Setup:**
1. Sign up at https://datadoghq.com
2. Create API key in Settings → API Keys
3. Install Datadog agent:
   ```bash
   npm install --save @datadog/browser-rum @datadog/browser-logs
   ```

4. Forward Prometheus metrics:
   ```typescript
   // In apps/api/src/lib/prometheus.ts
   import dogstatsd from 'node-dogstatsd';
   
   const StatsD = new dogstatsd.StatsD();
   
   // Export metrics to Datadog
   setInterval(async () => {
     const metrics = await getMetricsText();
     // Parse and send to Datadog via DogStatsD
   }, 10000);
   ```

#### **Grafana Cloud** (Free tier available)

**Setup:**
1. Sign up at https://grafana.com/cloud
2. Create Prometheus data source
3. Add remote write config to prometheus.yml:
   ```yaml
   remote_write:
     - url: https://prometheus-blocks-prod-us-central1.grafana.net/api/prom/push
       basic_auth:
         username: YOUR_INSTANCE_ID
         password: YOUR_API_TOKEN
   ```

#### **AWS CloudWatch** (If using AWS)

**Forward metrics:**
```bash
npm install --save aws-sdk

# In apps/api/src/lib/prometheus.ts
const cloudwatch = new AWS.CloudWatch();

cloudwatch.putMetricData({
  Namespace: 'ORGOS',
  MetricData: [{
    MetricName: 'HTTPRequests',
    Value: 42,
    Unit: 'Count',
  }]
});
```

## Part 3: Grafana Dashboards

### Sample Dashboard: LLM Provider Health

**Metrics to display:**

| Panel | Query | Alert |
|-------|-------|-------|
| **Provider Latency** | `histogram_quantile(0.95, llm_provider_latency_ms)` | > 2000ms |
| **Failure Rate** | `rate(llm_provider_failures_total[5m])` | > 10% |
| **Fallback Events** | `rate(llm_provider_fallback_total[5m])` | > 5/min |
| **Circuit Breaker State** | `llm_circuit_breaker_opens_total` | == 1 (open) |

### Dashboard JSON (Grafana)

```json
{
  "dashboard": {
    "title": "ORGOS LLM Providers",
    "panels": [
      {
        "title": "Provider Latency (95th percentile)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, llm_provider_latency_ms)"
          }
        ],
        "type": "graph",
        "yaxes": [{ "label": "ms", "min": 0 }]
      },
      {
        "title": "Failure Rate",
        "targets": [
          {
            "expr": "rate(llm_provider_failures_total[5m])"
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

## Part 4: Alerting

### Sentry Alerts

1. **Error rate spike**
   - Condition: > 5 errors/minute
   - Action: Slack to #alerts channel

2. **New error type**
   - Condition: First occurrence of error
   - Action: Email to team

### Prometheus / Grafana Alerts

1. **High API latency**
   ```yaml
   alert: HighAPILatency
   expr: histogram_quantile(0.95, http_request_duration_ms) > 1000
   for: 5m
   ```

2. **LLM provider down**
   ```yaml
   alert: LLMProviderDown
   expr: rate(llm_provider_failures_total[5m]) > 0.5
   for: 2m
   ```

## Troubleshooting

### "Metrics endpoint returns 0 requests"
**Cause**: prom-client not initialized or no requests hitting API
**Fix**: 
- Verify `initializePrometheus()` called in server.ts
- Hit API endpoint: `curl http://localhost:4000/healthz`

### "Sentry not capturing errors"
**Cause**: SENTRY_DSN not set or Sentry not initialized
**Fix**:
- Check `.env`: `echo $SENTRY_DSN`
- Restart API: `npm --prefix apps/api run dev`

### "Prometheus scrape failing"
**Cause**: Wrong target URL or metrics endpoint not accessible
**Fix**:
- Verify API running: `curl http://localhost:4000/healthz`
- Check prometheus.yml target: should be `localhost:4000`
- Verify metrics endpoint: `curl http://localhost:4000/metrics`

## References

- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Prometheus HTTP SD](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#http_sd_config)
- [Grafana Getting Started](https://grafana.com/grafana/dashboards/)
- [Datadog Metrics](https://docs.datadoghq.com/metrics/)
- [CloudWatch Metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/DeveloperGuide/working_with_metrics.html)
