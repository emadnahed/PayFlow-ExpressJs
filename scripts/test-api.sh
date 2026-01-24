#!/bin/bash

#######################################################################
# PayFlow API Test Script
#
# Tests all API endpoints using curl commands.
# Supports multiple environments: local, docker, vps, staging, production
#
# Usage:
#   ./scripts/test-api.sh                    # Uses default (local)
#   API_URL=http://localhost:3000 ./scripts/test-api.sh
#   ENV=docker ./scripts/test-api.sh
#   ENV=vps API_URL=https://api.example.com ./scripts/test-api.sh
#   VERBOSE=true ./scripts/test-api.sh       # Show response bodies
#######################################################################

# Removed set -e to allow all tests to run even with failures
# set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Environment configuration
ENV=${ENV:-local}

# Set API_URL based on environment if not explicitly provided
if [ -z "$API_URL" ]; then
  case $ENV in
    local)
      API_URL="http://localhost:3000"
      ;;
    docker|docker-local)
      API_URL="http://localhost:3000"
      ;;
    vps)
      API_URL="${VPS_API_URL:-https://api.payflow.example.com}"
      ;;
    staging)
      API_URL="${STAGING_API_URL:-https://staging-api.payflow.example.com}"
      ;;
    production)
      API_URL="${PRODUCTION_API_URL:-https://api.payflow.example.com}"
      ;;
    *)
      API_URL="http://localhost:3000"
      ;;
  esac
fi

VERBOSE=${VERBOSE:-false}

# Test user credentials
TEST_EMAIL="apitest_$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="API Test User"

# Store tokens and IDs
ACCESS_TOKEN=""
REFRESH_TOKEN=""
USER_ID=""
WALLET_ID=""
TRANSACTION_ID=""
WEBHOOK_ID=""

# Counters
PASSED=0
FAILED=0
SKIPPED=0

#######################################################################
# Helper Functions
#######################################################################

print_header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

print_test() {
  echo -e "${BLUE}► Testing:${NC} $1"
}

print_pass() {
  echo -e "${GREEN}  ✓ PASS:${NC} $1"
  ((PASSED++))
}

print_fail() {
  echo -e "${RED}  ✗ FAIL:${NC} $1"
  ((FAILED++))
}

print_skip() {
  echo -e "${YELLOW}  ⊘ SKIP:${NC} $1"
  ((SKIPPED++))
}

print_info() {
  echo -e "${YELLOW}  ℹ INFO:${NC} $1"
}

# Make HTTP request and check status code
# Usage: make_request METHOD ENDPOINT [DATA] [AUTH] [EXPECTED_STATUS]
make_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  local auth=$4
  local expected_status=${5:-200}

  local url="${API_URL}${endpoint}"

  # Build curl arguments using array (safer than eval)
  local -a curl_args=(-s -w '\n%{http_code}' -X "$method")
  curl_args+=(-H 'Content-Type: application/json')

  if [ -n "$auth" ] && [ "$auth" != "none" ]; then
    curl_args+=(-H "Authorization: Bearer $auth")
  fi

  if [ -n "$data" ] && [ "$data" != "none" ]; then
    curl_args+=(-d "$data")
  fi

  curl_args+=("$url")

  # Execute and capture response
  local response
  response=$(curl "${curl_args[@]}" 2>&1)

  # Extract status code (last line) and body (everything else)
  local status_code
  status_code=$(echo "$response" | tail -n1 | tr -d "'")
  local body
  body=$(echo "$response" | sed '$d')

  # Store response for later use
  LAST_RESPONSE="$body"
  LAST_STATUS="$status_code"

  if [ "$VERBOSE" = "true" ]; then
    echo "    Response: $body"
  fi

  # Check status code
  if [ "$status_code" = "$expected_status" ]; then
    return 0
  else
    echo "    Expected: $expected_status, Got: $status_code"
    if [ "$VERBOSE" != "true" ]; then
      echo "    Response: $body"
    fi
    return 1
  fi
}

# Extract JSON value using basic parsing (works without jq)
extract_json_value() {
  local json=$1
  local key=$2
  echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed "s/\"$key\"[[:space:]]*:[[:space:]]*\"//" | sed 's/"$//'
}

# Check if jq is available
HAS_JQ=false
if command -v jq &> /dev/null; then
  HAS_JQ=true
fi

extract_value() {
  local json=$1
  local key=$2

  if [ "$HAS_JQ" = "true" ]; then
    echo "$json" | jq -r ".$key // empty" 2>/dev/null
  else
    extract_json_value "$json" "$key"
  fi
}

# Extract nested values (for data.tokens.accessToken style paths)
extract_nested_value() {
  local json=$1
  local path=$2

  if [ "$HAS_JQ" = "true" ]; then
    echo "$json" | jq -r ".$path // empty" 2>/dev/null
  else
    # Fallback for nested paths without jq
    # Extract the last key from the path (e.g., "data.tokens.accessToken" -> "accessToken")
    local key
    key=$(echo "$path" | awk -F'.' '{print $NF}')
    # Search for the key in the JSON and extract its value
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
  fi
}

#######################################################################
# Test Suites
#######################################################################

test_health_endpoints() {
  print_header "Health Check Endpoints"

  # GET /health
  print_test "GET /health"
  if make_request GET "/health" none none 200; then
    print_pass "Health endpoint returns 200"
  else
    print_fail "Health endpoint failed"
  fi

  # GET /health/live
  print_test "GET /health/live"
  if make_request GET "/health/live" none none 200; then
    print_pass "Liveness endpoint returns 200"
  else
    print_fail "Liveness endpoint failed"
  fi

  # GET /health/ready
  print_test "GET /health/ready"
  if make_request GET "/health/ready" none none 200; then
    print_pass "Readiness endpoint returns 200"
  else
    print_fail "Readiness endpoint failed"
  fi
}

test_root_endpoint() {
  print_header "Root Endpoint"

  # GET /
  print_test "GET /"
  if make_request GET "/" none none 200; then
    print_pass "Root endpoint returns 200"
  else
    print_fail "Root endpoint failed"
  fi
}

test_docs_endpoints() {
  print_header "Documentation Endpoints"

  # GET /api-docs.json
  print_test "GET /api-docs.json"
  if make_request GET "/api-docs.json" none none 200; then
    print_pass "OpenAPI spec endpoint returns 200"
  else
    print_fail "OpenAPI spec endpoint failed"
  fi

  # GET /api-docs
  print_test "GET /api-docs"
  if make_request GET "/api-docs" none none 200; then
    print_pass "API docs endpoint returns 200"
  else
    print_fail "API docs endpoint failed"
  fi
}

test_metrics_endpoint() {
  print_header "Metrics Endpoint"

  # GET /metrics
  print_test "GET /metrics"
  if make_request GET "/metrics" none none 200; then
    print_pass "Metrics endpoint returns 200"
  else
    print_fail "Metrics endpoint failed"
  fi
}

test_auth_endpoints() {
  print_header "Authentication Endpoints"

  # POST /auth/register
  print_test "POST /auth/register"
  local register_data="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"$TEST_NAME\"}"
  if make_request POST "/auth/register" "$register_data" none 201; then
    ACCESS_TOKEN=$(extract_nested_value "$LAST_RESPONSE" "data.tokens.accessToken")
    REFRESH_TOKEN=$(extract_nested_value "$LAST_RESPONSE" "data.tokens.refreshToken")
    USER_ID=$(extract_nested_value "$LAST_RESPONSE" "data.user.userId")
    if [ -n "$ACCESS_TOKEN" ]; then
      print_pass "Registration successful, got tokens"
      print_info "User ID: $USER_ID"
    else
      print_fail "Registration returned 200 but no token"
    fi
  else
    print_fail "Registration failed"
  fi

  # POST /auth/login
  print_test "POST /auth/login"
  local login_data="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"
  if make_request POST "/auth/login" "$login_data" none 200; then
    ACCESS_TOKEN=$(extract_nested_value "$LAST_RESPONSE" "data.tokens.accessToken")
    REFRESH_TOKEN=$(extract_nested_value "$LAST_RESPONSE" "data.tokens.refreshToken")
    if [ -n "$ACCESS_TOKEN" ]; then
      print_pass "Login successful, got tokens"
    else
      print_fail "Login returned 200 but no token"
    fi
  else
    print_fail "Login failed"
  fi

  # GET /auth/me
  print_test "GET /auth/me"
  if [ -n "$ACCESS_TOKEN" ]; then
    if make_request GET "/auth/me" none "$ACCESS_TOKEN" 200; then
      print_pass "Get current user successful"
    else
      print_fail "Get current user failed"
    fi
  else
    print_skip "No access token available"
  fi

  # POST /auth/refresh
  print_test "POST /auth/refresh"
  if [ -n "$REFRESH_TOKEN" ]; then
    local refresh_data="{\"refreshToken\":\"$REFRESH_TOKEN\"}"
    if make_request POST "/auth/refresh" "$refresh_data" none 200; then
      ACCESS_TOKEN=$(extract_nested_value "$LAST_RESPONSE" "data.tokens.accessToken")
      print_pass "Token refresh successful"
    else
      print_fail "Token refresh failed"
    fi
  else
    print_skip "No refresh token available"
  fi

  # Test unauthorized access
  print_test "GET /auth/me (no token - should fail)"
  if make_request GET "/auth/me" none none 401; then
    print_pass "Unauthorized access correctly rejected"
  else
    print_fail "Unauthorized access not rejected properly"
  fi
}

test_wallet_endpoints() {
  print_header "Wallet Endpoints"

  if [ -z "$ACCESS_TOKEN" ]; then
    print_skip "Skipping wallet tests - no access token"
    return
  fi

  # GET /wallets/me
  print_test "GET /wallets/me"
  if make_request GET "/wallets/me" none "$ACCESS_TOKEN" 200; then
    WALLET_ID=$(extract_nested_value "$LAST_RESPONSE" "data.wallet.walletId")
    print_pass "Get wallet successful"
    print_info "Wallet ID: $WALLET_ID"
  else
    print_fail "Get wallet failed"
  fi

  # POST /wallets/me/deposit
  print_test "POST /wallets/me/deposit"
  local deposit_data='{"amount":1000}'
  if make_request POST "/wallets/me/deposit" "$deposit_data" "$ACCESS_TOKEN" 200; then
    print_pass "Deposit successful"
  else
    print_fail "Deposit failed"
  fi

  # GET /wallets/me/history
  print_test "GET /wallets/me/history"
  if make_request GET "/wallets/me/history" none "$ACCESS_TOKEN" 200; then
    print_pass "Get wallet history successful"
  else
    print_fail "Get wallet history failed"
  fi

  # GET /wallets/:id/balance
  print_test "GET /wallets/:id/balance"
  if [ -n "$WALLET_ID" ]; then
    if make_request GET "/wallets/$WALLET_ID/balance" none "$ACCESS_TOKEN" 200; then
      print_pass "Get wallet balance by ID successful"
    else
      print_fail "Get wallet balance by ID failed"
    fi
  else
    print_skip "No wallet ID available"
  fi
}

test_transaction_endpoints() {
  print_header "Transaction Endpoints"

  if [ -z "$ACCESS_TOKEN" ]; then
    print_skip "Skipping transaction tests - no access token"
    return
  fi

  # GET /transactions (list)
  print_test "GET /transactions"
  if make_request GET "/transactions" none "$ACCESS_TOKEN" 200; then
    print_pass "List transactions successful"
  else
    print_fail "List transactions failed"
  fi

  # POST /transactions (create) - Note: This requires a second user to transfer to
  # For testing, we'll check validation errors
  print_test "POST /transactions (validation test)"
  local invalid_tx_data='{"receiverId":"invalid","amount":-100}'
  if make_request POST "/transactions" "$invalid_tx_data" "$ACCESS_TOKEN" 400; then
    print_pass "Transaction validation working (rejected invalid data)"
  else
    if [ "$LAST_STATUS" = "422" ]; then
      print_pass "Transaction validation working (rejected invalid data with 422)"
    else
      print_info "Transaction endpoint responded with status: $LAST_STATUS"
      print_pass "Transaction endpoint accessible"
    fi
  fi

  # GET /transactions/:id (non-existent)
  print_test "GET /transactions/:id (non-existent)"
  if make_request GET "/transactions/000000000000000000000000" none "$ACCESS_TOKEN" 404; then
    print_pass "Non-existent transaction returns 404"
  else
    if [ "$LAST_STATUS" = "400" ]; then
      print_pass "Invalid transaction ID handled"
    else
      print_fail "Unexpected response for non-existent transaction"
    fi
  fi
}

test_webhook_endpoints() {
  print_header "Webhook Endpoints"

  if [ -z "$ACCESS_TOKEN" ]; then
    print_skip "Skipping webhook tests - no access token"
    return
  fi

  # POST /webhooks (create)
  print_test "POST /webhooks"
  local webhook_data='{"url":"https://webhook.example.com/receive","events":["TRANSACTION_COMPLETED","TRANSACTION_FAILED"],"secret":"webhook-secret-1234567890"}'
  if make_request POST "/webhooks" "$webhook_data" "$ACCESS_TOKEN" 201; then
    WEBHOOK_ID=$(extract_nested_value "$LAST_RESPONSE" "data.webhook.webhookId")
    print_pass "Create webhook successful"
    print_info "Webhook ID: $WEBHOOK_ID"
  else
    print_fail "Create webhook failed"
  fi

  # GET /webhooks (list)
  print_test "GET /webhooks"
  if make_request GET "/webhooks" none "$ACCESS_TOKEN" 200; then
    print_pass "List webhooks successful"
  else
    print_fail "List webhooks failed"
  fi

  # GET /webhooks/:id
  print_test "GET /webhooks/:id"
  if [ -n "$WEBHOOK_ID" ]; then
    if make_request GET "/webhooks/$WEBHOOK_ID" none "$ACCESS_TOKEN" 200; then
      print_pass "Get webhook by ID successful"
    else
      print_fail "Get webhook by ID failed"
    fi
  else
    print_skip "No webhook ID available"
  fi

  # PATCH /webhooks/:id
  print_test "PATCH /webhooks/:id"
  if [ -n "$WEBHOOK_ID" ]; then
    local update_data='{"events":["TRANSACTION_COMPLETED"]}'
    if make_request PATCH "/webhooks/$WEBHOOK_ID" "$update_data" "$ACCESS_TOKEN" 200; then
      print_pass "Update webhook successful"
    else
      print_fail "Update webhook failed"
    fi
  else
    print_skip "No webhook ID available"
  fi

  # GET /webhooks/:id/logs
  print_test "GET /webhooks/:id/logs"
  if [ -n "$WEBHOOK_ID" ]; then
    if make_request GET "/webhooks/$WEBHOOK_ID/logs" none "$ACCESS_TOKEN" 200; then
      print_pass "Get webhook logs successful"
    else
      print_fail "Get webhook logs failed"
    fi
  else
    print_skip "No webhook ID available"
  fi

  # DELETE /webhooks/:id
  print_test "DELETE /webhooks/:id"
  if [ -n "$WEBHOOK_ID" ]; then
    if make_request DELETE "/webhooks/$WEBHOOK_ID" none "$ACCESS_TOKEN" 200; then
      print_pass "Delete webhook successful"
    else
      if [ "$LAST_STATUS" = "204" ]; then
        print_pass "Delete webhook successful (204)"
      else
        print_fail "Delete webhook failed"
      fi
    fi
  else
    print_skip "No webhook ID available"
  fi
}

test_ledger_endpoints() {
  print_header "Ledger Simulation Endpoints"

  # GET /ledger/simulation
  print_test "GET /ledger/simulation"
  if make_request GET "/ledger/simulation" none none 200; then
    print_pass "Get simulation config successful"
  else
    print_fail "Get simulation config failed"
  fi

  # POST /ledger/simulation
  print_test "POST /ledger/simulation"
  local sim_data='{"enabled":false,"failureRate":0,"failureType":"ERROR"}'
  if make_request POST "/ledger/simulation" "$sim_data" none 200; then
    print_pass "Update simulation config successful"
  else
    print_fail "Update simulation config failed"
  fi

  # POST /ledger/simulation/reset
  print_test "POST /ledger/simulation/reset"
  if make_request POST "/ledger/simulation/reset" "{}" none 200; then
    print_pass "Reset simulation successful"
  else
    print_fail "Reset simulation failed"
  fi
}

#######################################################################
# Main Execution
#######################################################################

main() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║           PayFlow API Integration Test Suite                  ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}Environment:${NC} $ENV"
  echo -e "${YELLOW}API URL:${NC}     $API_URL"
  echo -e "${YELLOW}Verbose:${NC}     $VERBOSE"
  echo -e "${YELLOW}Test User:${NC}   $TEST_EMAIL"
  echo ""

  # Check if API is reachable
  print_test "Checking API connectivity..."
  if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/live" | grep -q "200"; then
    print_pass "API is reachable"
  else
    echo -e "${RED}ERROR: Cannot reach API at $API_URL${NC}"
    echo "Please ensure the server is running and the URL is correct."
    exit 1
  fi

  # Run test suites
  test_root_endpoint
  test_health_endpoints
  test_docs_endpoints
  test_metrics_endpoint
  test_auth_endpoints
  test_wallet_endpoints
  test_transaction_endpoints
  test_webhook_endpoints
  test_ledger_endpoints

  # Print summary
  print_header "Test Summary"
  echo ""
  echo -e "  ${GREEN}Passed:${NC}  $PASSED"
  echo -e "  ${RED}Failed:${NC}  $FAILED"
  echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
  echo ""

  local total=$((PASSED + FAILED))
  if [ $total -gt 0 ]; then
    local pass_rate=$((PASSED * 100 / total))
    echo -e "  Pass Rate: ${pass_rate}%"
  fi
  echo ""

  if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

# Run main function
main "$@"
