#!/bin/bash

# ============================================================
# PayFlow API Test Script
# Tests all API endpoints using cURL with beautified JSON output
# ============================================================

set -e

# Configuration
# Default to Docker test port (3001), can override with API_URL env var
# For staging: API_URL=http://localhost:3000 ./scripts/test-api.sh
BASE_URL="${API_URL:-http://localhost:3001}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Generated data storage
ACCESS_TOKEN=""
REFRESH_TOKEN=""
USER_ID=""
WALLET_ID=""
TRANSACTION_ID=""
WEBHOOK_ID=""
RECEIVER_USER_ID=""
RECEIVER_TOKEN=""

# ============================================================
# Utility Functions
# ============================================================

print_header() {
    echo ""
    echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${MAGENTA}  $1${NC}"
    echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════════${NC}"
}

print_subheader() {
    echo ""
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
}

print_test() {
    echo ""
    echo -e "${YELLOW}▶ TEST: $1${NC}"
}

print_request() {
    echo -e "${BLUE}  → $1 $2${NC}"
}

print_success() {
    echo -e "${GREEN}  ✓ PASS: $1${NC}"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
}

print_failure() {
    echo -e "${RED}  ✗ FAIL: $1${NC}"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
}

print_info() {
    echo -e "${CYAN}  ℹ $1${NC}"
}

print_json() {
    if command -v jq &> /dev/null; then
        echo "$1" | jq '.' 2>/dev/null || echo "$1"
    else
        # Fallback: basic JSON formatting without jq
        echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
    fi
}

# Make HTTP request and capture response
# Usage: make_request METHOD URL [DATA] [EXTRA_HEADERS...]
make_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    shift 2
    [[ $# -gt 0 ]] && shift  # shift data if present
    local extra_headers=("$@")

    local curl_opts=(-s -w "\n%{http_code}" -X "$method")

    # Add headers
    curl_opts+=(-H "Content-Type: application/json")

    if [[ -n "$ACCESS_TOKEN" ]]; then
        curl_opts+=(-H "Authorization: Bearer $ACCESS_TOKEN")
    fi

    for header in "${extra_headers[@]}"; do
        curl_opts+=(-H "$header")
    done

    # Add data if present
    if [[ -n "$data" ]]; then
        curl_opts+=(-d "$data")
    fi

    # Make request
    local response
    response=$(curl "${curl_opts[@]}" "${BASE_URL}${url}")

    # Split response body and status code
    local http_code="${response##*$'\n'}"
    local body="${response%$'\n'*}"

    # Store in global variables
    LAST_HTTP_CODE="$http_code"
    LAST_RESPONSE="$body"

    print_request "$method" "$url"

    if [[ "$VERBOSE" == "true" ]] && [[ -n "$data" ]]; then
        echo -e "${BLUE}  Request Body:${NC}"
        print_json "$data" | sed 's/^/    /'
    fi

    echo -e "${BLUE}  Response (HTTP $http_code):${NC}"
    print_json "$body" | sed 's/^/    /'
}

# Check if response matches expected status
check_status() {
    local expected="$1"
    local description="$2"

    if [[ "$LAST_HTTP_CODE" == "$expected" ]]; then
        print_success "$description (HTTP $LAST_HTTP_CODE)"
        return 0
    else
        print_failure "$description (Expected: $expected, Got: $LAST_HTTP_CODE)"
        return 1
    fi
}

# Extract JSON field using jq or python
extract_json() {
    local json="$1"
    local field="$2"

    if command -v jq &> /dev/null; then
        echo "$json" | jq -r "$field" 2>/dev/null
    else
        echo "$json" | python3 -c "import sys, json; print(json.load(sys.stdin)${field})" 2>/dev/null
    fi
}

generate_email() {
    echo "test_$(date +%s)_$RANDOM@example.com"
}

generate_idempotency_key() {
    echo "idem_$(date +%s)_$RANDOM"
}

# ============================================================
# Health Check Tests
# ============================================================

test_health_endpoints() {
    print_header "HEALTH CHECK ENDPOINTS"

    print_test "Root endpoint"
    make_request "GET" "/"
    check_status "200" "Root endpoint returns API info"

    print_test "Health check"
    make_request "GET" "/health"
    check_status "200" "Health endpoint returns status"

    print_test "Liveness probe"
    make_request "GET" "/health/live"
    check_status "200" "Liveness probe returns alive"

    print_test "Readiness probe"
    make_request "GET" "/health/ready"
    check_status "200" "Readiness probe returns ready"

    print_test "Metrics endpoint"
    # Metrics returns plain text, not JSON
    local response
    response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/metrics")
    local http_code="${response##*$'\n'}"
    print_request "GET" "/metrics"
    echo -e "${BLUE}  Response (HTTP $http_code): Prometheus metrics format${NC}"
    if [[ "$http_code" == "200" ]]; then
        print_success "Metrics endpoint returns Prometheus format (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        TOTAL=$((TOTAL + 1))
    else
        print_failure "Metrics endpoint failed (HTTP $http_code)"
        FAILED=$((FAILED + 1))
        TOTAL=$((TOTAL + 1))
    fi
}

# ============================================================
# Authentication Tests
# ============================================================

test_auth_endpoints() {
    print_header "AUTHENTICATION ENDPOINTS"

    local email=$(generate_email)
    local password="SecurePass123!"

    # Register new user
    print_subheader "User Registration"

    print_test "Register new user"
    make_request "POST" "/auth/register" "{
        \"name\": \"Test User\",
        \"email\": \"$email\",
        \"password\": \"$password\",
        \"phone\": \"+1234567890\"
    }"

    if check_status "201" "User registration successful"; then
        ACCESS_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.accessToken')
        REFRESH_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.refreshToken')
        USER_ID=$(extract_json "$LAST_RESPONSE" '.data.user.userId')
        print_info "User ID: $USER_ID"
    fi

    print_test "Register with duplicate email (should fail)"
    make_request "POST" "/auth/register" "{
        \"name\": \"Duplicate User\",
        \"email\": \"$email\",
        \"password\": \"$password\"
    }"
    check_status "409" "Duplicate email rejected"

    print_test "Register with weak password (should fail)"
    make_request "POST" "/auth/register" "{
        \"name\": \"Weak Pass User\",
        \"email\": \"weak_$(date +%s)@example.com\",
        \"password\": \"123\"
    }"
    check_status "400" "Weak password rejected"

    # Login
    print_subheader "User Login"

    # Clear token to test login
    local saved_token="$ACCESS_TOKEN"
    ACCESS_TOKEN=""

    print_test "Login with valid credentials"
    make_request "POST" "/auth/login" "{
        \"email\": \"$email\",
        \"password\": \"$password\"
    }"

    if check_status "200" "Login successful"; then
        ACCESS_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.accessToken')
        REFRESH_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.refreshToken')
    else
        ACCESS_TOKEN="$saved_token"
    fi

    print_test "Login with invalid password (should fail)"
    make_request "POST" "/auth/login" "{
        \"email\": \"$email\",
        \"password\": \"wrongpassword\"
    }"
    check_status "401" "Invalid password rejected"

    print_test "Login with non-existent email (should fail)"
    make_request "POST" "/auth/login" "{
        \"email\": \"nonexistent@example.com\",
        \"password\": \"$password\"
    }"
    check_status "401" "Non-existent email rejected"

    # Token refresh
    print_subheader "Token Refresh"

    print_test "Refresh tokens"
    local temp_token="$ACCESS_TOKEN"
    ACCESS_TOKEN=""
    make_request "POST" "/auth/refresh" "{
        \"refreshToken\": \"$REFRESH_TOKEN\"
    }"

    if check_status "200" "Token refresh successful"; then
        ACCESS_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.accessToken')
        REFRESH_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.refreshToken')
    else
        ACCESS_TOKEN="$temp_token"
    fi

    print_test "Refresh with invalid token (should fail)"
    make_request "POST" "/auth/refresh" "{
        \"refreshToken\": \"invalid_token\"
    }"
    check_status "401" "Invalid refresh token rejected"

    # Get current user
    print_subheader "Get Current User"

    print_test "Get current user profile"
    make_request "GET" "/auth/me"
    check_status "200" "Get user profile successful"

    print_test "Get profile without token (should fail)"
    local saved="$ACCESS_TOKEN"
    ACCESS_TOKEN=""
    make_request "GET" "/auth/me"
    check_status "401" "Unauthenticated request rejected"
    ACCESS_TOKEN="$saved"
}

# ============================================================
# Wallet Tests
# ============================================================

test_wallet_endpoints() {
    print_header "WALLET ENDPOINTS"

    print_subheader "Get Wallet"

    print_test "Get user wallet"
    make_request "GET" "/wallets/me"

    if check_status "200" "Get wallet successful"; then
        WALLET_ID=$(extract_json "$LAST_RESPONSE" '.data.wallet.walletId')
        print_info "Wallet ID: $WALLET_ID"
    fi

    print_subheader "Deposit Funds"

    print_test "Deposit funds to wallet"
    local idem_key=$(generate_idempotency_key)
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": 1000
    }" "X-Idempotency-Key: $idem_key"
    check_status "200" "Deposit successful"

    print_test "Deposit with same idempotency key (should return same result)"
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": 1000
    }" "X-Idempotency-Key: $idem_key"
    check_status "200" "Idempotent deposit returned cached result"

    print_test "Deposit with different idempotency key"
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": 500
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "200" "Second deposit successful"

    print_test "Deposit with zero amount (should fail)"
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": 0
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "400" "Zero amount rejected"

    print_test "Deposit with negative amount (should fail)"
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": -100
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "400" "Negative amount rejected"

    print_subheader "Wallet Balance & History"

    print_test "Get wallet balance"
    make_request "GET" "/wallets/${WALLET_ID}/balance"
    check_status "200" "Get balance successful"

    print_test "Get wallet history"
    make_request "GET" "/wallets/me/history"
    check_status "200" "Get history successful"

    print_test "Get wallet history with pagination"
    make_request "GET" "/wallets/me/history?limit=5&offset=0"
    check_status "200" "Paginated history successful"
}

# ============================================================
# Transaction Tests
# ============================================================

test_transaction_endpoints() {
    print_header "TRANSACTION ENDPOINTS"

    # First, create a receiver user
    print_subheader "Setup: Create Receiver User"

    local receiver_email=$(generate_email)
    local saved_token="$ACCESS_TOKEN"
    ACCESS_TOKEN=""

    print_test "Register receiver user"
    make_request "POST" "/auth/register" "{
        \"name\": \"Receiver User\",
        \"email\": \"$receiver_email\",
        \"password\": \"SecurePass123!\"
    }"

    if check_status "201" "Receiver registration successful"; then
        RECEIVER_TOKEN=$(extract_json "$LAST_RESPONSE" '.data.tokens.accessToken')
        RECEIVER_USER_ID=$(extract_json "$LAST_RESPONSE" '.data.user.userId')
        print_info "Receiver User ID: $RECEIVER_USER_ID"
    fi

    ACCESS_TOKEN="$saved_token"

    print_subheader "Create Transaction"

    print_test "Create transaction"
    local txn_idem_key=$(generate_idempotency_key)
    make_request "POST" "/transactions" "{
        \"receiverId\": \"$RECEIVER_USER_ID\",
        \"amount\": 100,
        \"description\": \"Test payment\"
    }" "X-Idempotency-Key: $txn_idem_key"

    if check_status "201" "Transaction created successfully"; then
        TRANSACTION_ID=$(extract_json "$LAST_RESPONSE" '.data.transaction.transactionId')
        print_info "Transaction ID: $TRANSACTION_ID"
    fi

    print_test "Create transaction to self (should fail)"
    make_request "POST" "/transactions" "{
        \"receiverId\": \"$USER_ID\",
        \"amount\": 50,
        \"description\": \"Self transfer\"
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "400" "Self-transfer rejected"

    print_test "Create transaction with zero amount (should fail)"
    make_request "POST" "/transactions" "{
        \"receiverId\": \"$RECEIVER_USER_ID\",
        \"amount\": 0,
        \"description\": \"Zero amount\"
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "400" "Zero amount rejected"

    print_test "Create transaction to non-existent user (should fail)"
    make_request "POST" "/transactions" "{
        \"receiverId\": \"user_nonexistent123\",
        \"amount\": 50,
        \"description\": \"Invalid receiver\"
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "404" "Non-existent receiver rejected"

    print_subheader "Read Transaction"

    print_test "Get transaction by ID"
    make_request "GET" "/transactions/${TRANSACTION_ID}"
    check_status "200" "Get transaction successful"

    print_test "Get non-existent transaction (should fail)"
    make_request "GET" "/transactions/txn_nonexistent123"
    check_status "404" "Non-existent transaction returns 404"

    print_subheader "List Transactions"

    print_test "List all transactions"
    make_request "GET" "/transactions"
    check_status "200" "List transactions successful"

    print_test "List transactions with pagination"
    make_request "GET" "/transactions?limit=10&offset=0"
    check_status "200" "Paginated transactions successful"

    print_test "Filter transactions by status"
    make_request "GET" "/transactions?status=INITIATED"
    check_status "200" "Filtered transactions successful"

    # Create another transaction for more data
    print_test "Create another transaction"
    make_request "POST" "/transactions" "{
        \"receiverId\": \"$RECEIVER_USER_ID\",
        \"amount\": 50,
        \"description\": \"Second payment\"
    }" "X-Idempotency-Key: $(generate_idempotency_key)"
    check_status "201" "Second transaction created"
}

# ============================================================
# Webhook Tests (Full CRUD)
# ============================================================

test_webhook_endpoints() {
    print_header "WEBHOOK ENDPOINTS (CRUD)"

    print_subheader "Create Webhook"

    print_test "Create webhook subscription"
    make_request "POST" "/webhooks" "{
        \"url\": \"https://example.com/webhook\",
        \"events\": [\"TRANSACTION_COMPLETED\", \"TRANSACTION_FAILED\"]
    }"

    if check_status "201" "Webhook created successfully"; then
        WEBHOOK_ID=$(extract_json "$LAST_RESPONSE" '.data.webhook.webhookId')
        print_info "Webhook ID: $WEBHOOK_ID"
    fi

    print_test "Create webhook with custom secret"
    make_request "POST" "/webhooks" "{
        \"url\": \"https://example.com/webhook2\",
        \"events\": [\"TRANSACTION_COMPLETED\"],
        \"secret\": \"my_custom_secret_key\"
    }"
    local webhook_id_2=$(extract_json "$LAST_RESPONSE" '.data.webhook.webhookId')
    check_status "201" "Webhook with custom secret created"

    print_test "Create webhook with invalid URL (should fail)"
    make_request "POST" "/webhooks" "{
        \"url\": \"not-a-valid-url\",
        \"events\": [\"TRANSACTION_COMPLETED\"]
    }"
    check_status "400" "Invalid URL rejected"

    print_test "Create webhook with empty events (should fail)"
    make_request "POST" "/webhooks" "{
        \"url\": \"https://example.com/webhook3\",
        \"events\": []
    }"
    check_status "400" "Empty events rejected"

    print_test "Create duplicate webhook URL (should fail)"
    make_request "POST" "/webhooks" "{
        \"url\": \"https://example.com/webhook\",
        \"events\": [\"TRANSACTION_COMPLETED\"]
    }"
    check_status "409" "Duplicate URL rejected"

    print_subheader "Read Webhook"

    print_test "Get webhook by ID"
    make_request "GET" "/webhooks/${WEBHOOK_ID}"
    check_status "200" "Get webhook successful"

    print_test "Get non-existent webhook (should fail)"
    make_request "GET" "/webhooks/webhook_nonexistent123"
    check_status "404" "Non-existent webhook returns 404"

    print_subheader "List Webhooks"

    print_test "List all webhooks"
    make_request "GET" "/webhooks"
    check_status "200" "List webhooks successful"

    print_test "List webhooks with filter"
    make_request "GET" "/webhooks?isActive=true"
    check_status "200" "Filtered webhooks successful"

    print_subheader "Update Webhook"

    print_test "Update webhook URL"
    make_request "PATCH" "/webhooks/${WEBHOOK_ID}" "{
        \"url\": \"https://example.com/webhook-updated\"
    }"
    check_status "200" "Webhook URL updated"

    print_test "Update webhook events"
    make_request "PATCH" "/webhooks/${WEBHOOK_ID}" "{
        \"events\": [\"TRANSACTION_COMPLETED\", \"TRANSACTION_FAILED\", \"CREDIT_SUCCESS\"]
    }"
    check_status "200" "Webhook events updated"

    print_test "Deactivate webhook"
    make_request "PATCH" "/webhooks/${WEBHOOK_ID}" "{
        \"isActive\": false
    }"
    check_status "200" "Webhook deactivated"

    print_test "Reactivate webhook"
    make_request "PATCH" "/webhooks/${WEBHOOK_ID}" "{
        \"isActive\": true
    }"
    check_status "200" "Webhook reactivated"

    print_subheader "Webhook Delivery Logs"

    print_test "Get webhook delivery logs"
    make_request "GET" "/webhooks/${WEBHOOK_ID}/logs"
    check_status "200" "Get delivery logs successful"

    print_test "Get delivery logs with filter"
    make_request "GET" "/webhooks/${WEBHOOK_ID}/logs?status=PENDING"
    check_status "200" "Filtered delivery logs successful"

    print_subheader "Delete Webhook"

    print_test "Delete webhook"
    make_request "DELETE" "/webhooks/${webhook_id_2}"
    check_status "200" "Webhook deleted"

    print_test "Verify deleted webhook is gone"
    make_request "GET" "/webhooks/${webhook_id_2}"
    check_status "404" "Deleted webhook not found"
}

# ============================================================
# Ledger Simulation Tests
# ============================================================

test_ledger_endpoints() {
    print_header "LEDGER SIMULATION ENDPOINTS"

    print_test "Get simulation config"
    make_request "GET" "/ledger/simulation"
    check_status "200" "Get simulation config successful"

    print_test "Enable simulation with failure rate"
    make_request "POST" "/ledger/simulation" "{
        \"enabled\": true,
        \"failureRate\": 0.5,
        \"failureType\": \"ERROR\"
    }"
    check_status "200" "Simulation enabled"

    print_test "Add failing transaction IDs"
    make_request "POST" "/ledger/simulation/fail-transactions" "{
        \"transactionIds\": [\"txn_test123\", \"txn_test456\"]
    }"
    check_status "200" "Failing transaction IDs added"

    print_test "Verify simulation config updated"
    make_request "GET" "/ledger/simulation"
    check_status "200" "Updated config retrieved"

    print_test "Disable simulation"
    make_request "POST" "/ledger/simulation" "{
        \"enabled\": false
    }"
    check_status "200" "Simulation disabled"

    print_test "Reset simulation"
    make_request "POST" "/ledger/simulation/reset"
    check_status "200" "Simulation reset"
}

# ============================================================
# Error Handling Tests
# ============================================================

test_error_handling() {
    print_header "ERROR HANDLING & EDGE CASES"

    print_test "Invalid JSON body"
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -d "not valid json")
    local http_code="${response##*$'\n'}"
    local body="${response%$'\n'*}"
    print_request "POST" "/auth/login"
    echo -e "${BLUE}  Response (HTTP $http_code):${NC}"
    print_json "$body" | sed 's/^/    /'
    if [[ "$http_code" == "400" ]]; then
        print_success "Invalid JSON rejected (HTTP $http_code)"
        PASSED=$((PASSED + 1))
    else
        print_failure "Invalid JSON should return 400 (got $http_code)"
        FAILED=$((FAILED + 1))
    fi
    TOTAL=$((TOTAL + 1))

    print_test "Non-existent endpoint"
    make_request "GET" "/nonexistent/endpoint"
    check_status "404" "Non-existent endpoint returns 404"

    print_test "Invalid HTTP method"
    make_request "DELETE" "/auth/login"
    check_status "404" "Invalid method returns 404"

    print_test "Missing required field"
    make_request "POST" "/auth/login" "{
        \"email\": \"test@example.com\"
    }"
    check_status "400" "Missing password rejected"

    print_test "Invalid idempotency key format"
    make_request "POST" "/wallets/me/deposit" "{
        \"amount\": 10
    }" "X-Idempotency-Key: invalid key with spaces!"
    check_status "400" "Invalid idempotency key rejected"
}

# ============================================================
# API Documentation Test
# ============================================================

test_api_docs() {
    print_header "API DOCUMENTATION"

    print_test "Scalar API docs page"
    local response
    response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api-docs")
    local http_code="${response##*$'\n'}"
    print_request "GET" "/api-docs"
    echo -e "${BLUE}  Response (HTTP $http_code): HTML page${NC}"
    if [[ "$http_code" == "200" ]]; then
        print_success "API docs page accessible (HTTP $http_code)"
        PASSED=$((PASSED + 1))
    else
        print_failure "API docs page failed (HTTP $http_code)"
        FAILED=$((FAILED + 1))
    fi
    TOTAL=$((TOTAL + 1))

    print_test "OpenAPI JSON spec"
    make_request "GET" "/api-docs.json"
    check_status "200" "OpenAPI spec accessible"
}

# ============================================================
# Summary
# ============================================================

print_summary() {
    echo ""
    echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${MAGENTA}  TEST SUMMARY${NC}"
    echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Total Tests:${NC}  $TOTAL"
    echo -e "  ${GREEN}Passed:${NC}       $PASSED"
    echo -e "  ${RED}Failed:${NC}       $FAILED"
    echo ""

    if [[ $FAILED -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}All tests passed!${NC}"
    else
        echo -e "  ${RED}${BOLD}Some tests failed. Please review the output above.${NC}"
    fi
    echo ""
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════${NC}"
}

# ============================================================
# Main Execution
# ============================================================

main() {
    echo -e "${BOLD}${MAGENTA}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║            PayFlow API Test Suite (cURL)                  ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "  ${CYAN}Base URL:${NC} $BASE_URL"
    echo -e "  ${CYAN}Verbose:${NC}  $VERBOSE"
    echo ""

    # Check dependencies
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: curl is required but not installed.${NC}"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}Warning: jq not found. Using python3 for JSON formatting.${NC}"
        if ! command -v python3 &> /dev/null; then
            echo -e "${YELLOW}Warning: python3 not found. JSON output may not be formatted.${NC}"
        fi
    fi

    # Run all test suites
    test_health_endpoints
    test_auth_endpoints
    test_wallet_endpoints
    test_transaction_endpoints
    test_webhook_endpoints
    test_ledger_endpoints
    test_error_handling
    test_api_docs

    # Print summary
    print_summary

    # Exit with appropriate code
    if [[ $FAILED -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# Run main function
main "$@"
