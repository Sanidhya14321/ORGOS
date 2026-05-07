#!/usr/bin/env bash
set -euo pipefail
API=${API:-http://localhost:4000}
COOKIEJAR=$(mktemp)
trap 'rm -f "$COOKIEJAR"' EXIT

EMAIL=${EMAIL:-ceo@test.orgos.ai}
PASSWORD=${PASSWORD:-$EMAIL}

echo "API_BASE=$API"
echo "Logging in as $EMAIL..."

login_resp=$(curl -sS -c "$COOKIEJAR" -w "\n%{http_code}" -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")
http_code=$(echo "$login_resp" | tail -n1)
body=$(echo "$login_resp" | sed '$d')

echo "Login HTTP $http_code"
if command -v jq >/dev/null 2>&1; then
  echo "$body" | jq .
else
  echo "$body"
fi

if [ "$http_code" -ne 200 ] && [ "$http_code" -ne 201 ]; then
  echo "Login failed" >&2
  exit 1
fi

# Create goal
create_payload='{"title":"E2E Test Goal","raw_input":"Created by e2e script","priority":"medium"}'
echo "Creating goal..."
create_resp=$(curl -sS -b "$COOKIEJAR" -w "\n%{http_code}" -X POST "$API/api/goals" -H "Content-Type: application/json" -d "$create_payload")
http_code=$(echo "$create_resp" | tail -n1)
body=$(echo "$create_resp" | sed '$d')

echo "Create HTTP $http_code"
if command -v jq >/dev/null 2>&1; then
  echo "$body" | jq .
else
  echo "$body"
fi

if [ "$http_code" -ne 202 ]; then
  echo "Create failed" >&2
  exit 1
fi

goalId=$(echo "$body" | (command -v jq >/dev/null 2>&1 && jq -r '.goalId' || sed -n 's/.*"goalId"[^0-9a-zA-Z_-]*\([0-9a-fA-F-]\+\).*/\1/p'))

if [ -z "$goalId" ] || [ "$goalId" = "null" ]; then
  echo "Failed to parse goalId from create response" >&2
  exit 1
fi

echo "Created goalId: $goalId"

# Patch goal
patch_payload='{"description":"Edited by e2e script","priority":"high"}'
echo "Patching goal $goalId..."
patch_resp=$(curl -sS -b "$COOKIEJAR" -w "\n%{http_code}" -X PATCH "$API/api/goals/$goalId" -H "Content-Type: application/json" -d "$patch_payload")
http_code=$(echo "$patch_resp" | tail -n1)
body=$(echo "$patch_resp" | sed '$d')

echo "Patch HTTP $http_code"
if command -v jq >/dev/null 2>&1; then
  echo "$body" | jq .
else
  echo "$body"
fi

if [ "$http_code" -ne 200 ]; then
  echo "Patch failed" >&2
  exit 1
fi

echo "Verifying GET /goals/$goalId..."
get_resp=$(curl -sS -b "$COOKIEJAR" -w "\n%{http_code}" -X GET "$API/api/goals/$goalId")
http_code=$(echo "$get_resp" | tail -n1)
body=$(echo "$get_resp" | sed '$d')

echo "GET HTTP $http_code"
if command -v jq >/dev/null 2>&1; then
  echo "$body" | jq .
else
  echo "$body"
fi

if [ "$http_code" -ne 200 ]; then
  echo "Get failed" >&2
  exit 1
fi

echo "E2E authenticated create+edit succeeded for goalId: $goalId"

exit 0
