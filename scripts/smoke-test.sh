#!/usr/bin/env bash
# Usage: scripts/smoke-test.sh http://localhost:8081
# Automated checks against a running deployment (Test or Production), including a full
# create / read / update / delete cycle that proves the database is working.
# Exits non-zero if any check fails.
BASE_URL="${1:?Usage: smoke-test.sh <base-url>}"
FAILED=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILED=1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
JSON=(-H 'Content-Type: application/json')

# 1. Web page and static files
for path in / /style.css /js/tasks.js /js/app.js; do
  code=$(status "$BASE_URL$path")
  [ "$code" = "200" ] && pass "GET $path -> 200" || fail "GET $path -> $code"
done
curl -s "$BASE_URL/" | grep -q "CampusTask" && pass "home page contains CampusTask" || fail "home page missing CampusTask"

# 2. Health check (also confirms the database connection)
health=$(curl -s "$BASE_URL/health")
echo "$health" | grep -q '"status":"ok"' && pass "/health status ok" || fail "/health status ($health)"
echo "$health" | grep -q '"database":"up"' && pass "/health database up" || fail "/health database ($health)"

# 3. Input validation
code=$(status -X POST "${JSON[@]}" -d '{"title":""}' "$BASE_URL/api/tasks")
[ "$code" = "400" ] && pass "empty title rejected (400)" || fail "empty title -> $code"

# 4. Create -> read -> update -> delete through the API and database
TITLE="smoke-test-$(date +%s)"
created=$(curl -s -X POST "${JSON[@]}" -d "{\"title\":\"$TITLE\"}" "$BASE_URL/api/tasks")
ID=$(echo "$created" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$ID" ]; then
  fail "create task (response: $created)"
else
  pass "create task (id $ID)"
  curl -s "$BASE_URL/api/tasks" | grep -q "$TITLE" && pass "task stored and listed" || fail "task not listed"
  curl -s -X PATCH "${JSON[@]}" -d '{"done":true}' "$BASE_URL/api/tasks/$ID" | grep -q '"done":true' && pass "task marked done" || fail "mark done"
  code=$(status -X DELETE "$BASE_URL/api/tasks/$ID")
  [ "$code" = "204" ] && pass "task deleted (204)" || fail "delete -> $code"
  curl -s "$BASE_URL/api/tasks" | grep -q "$TITLE" && fail "task still present after delete" || pass "task removed from database"
fi

if [ "$FAILED" -eq 0 ]; then echo "All smoke tests passed."; else echo "Smoke tests FAILED."; exit 1; fi
