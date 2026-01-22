#!/bin/bash

#######################################################################
# PayFlow Full Test Suite Runner
#
# Orchestrates infrastructure startup, API server, and all tests.
#
# Usage:
#   ./scripts/run-full-tests.sh local     # Local dev testing
#   ./scripts/run-full-tests.sh docker    # Docker-based testing
#   ./scripts/run-full-tests.sh vps       # VPS testing (API must be running)
#   ./scripts/run-full-tests.sh staging   # Staging testing
#   ./scripts/run-full-tests.sh production # Production testing
#######################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ENV=${1:-local}
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Cleanup function
cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"

  # Kill API server if we started it
  if [ -n "$API_PID" ]; then
    echo "Stopping API server (PID: $API_PID)..."
    kill $API_PID 2>/dev/null || true
    wait $API_PID 2>/dev/null || true
  fi

  # Stop infrastructure if we started it
  if [ "$STARTED_INFRA" = "true" ]; then
    echo "Stopping test infrastructure..."
    if [ "$ENV" = "local" ]; then
      npm run infra:local:down 2>/dev/null || true
    elif [ "$ENV" = "docker" ]; then
      npm run infra:docker:down 2>/dev/null || true
    fi
  fi

  echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT INT TERM

print_header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "${BLUE}► $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

wait_for_service() {
  local url=$1
  local name=$2
  local max_attempts=${3:-30}
  local attempt=1

  echo -n "  Waiting for $name"
  while [ $attempt -le $max_attempts ]; do
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
      echo -e " ${GREEN}ready${NC}"
      return 0
    fi
    echo -n "."
    sleep 1
    ((attempt++))
  done
  echo -e " ${RED}timeout${NC}"
  return 1
}

#######################################################################
# Main
#######################################################################

print_header "PayFlow Full Test Suite - $ENV Environment"

STARTED_INFRA=false
API_PID=""

case $ENV in
  local)
    print_step "Environment: LOCAL (ts-node server + Docker test infra)"
    echo ""

    # Step 1: Start test infrastructure
    print_step "Step 1: Starting test infrastructure (MongoDB + Redis)..."
    npm run infra:local:up
    STARTED_INFRA=true
    print_success "Test infrastructure started"

    # Verify infrastructure
    print_step "Verifying infrastructure..."
    if docker ps | grep -q "payflow-mongodb-test"; then
      print_success "MongoDB is running (port 27018)"
    else
      print_error "MongoDB failed to start"
      exit 1
    fi

    if docker ps | grep -q "payflow-redis-test"; then
      print_success "Redis is running (port 6380)"
    else
      print_error "Redis failed to start"
      exit 1
    fi

    # Step 2: Run Jest tests (unit, integration, e2e)
    print_header "Step 2: Running Jest Tests"
    npm run test:jest:local
    print_success "Jest tests completed"

    # Step 3: Start API server for curl and k6 tests
    print_header "Step 3: Starting API Server"
    print_step "Starting API server in background..."

    # Start the dev server in background
    npm run dev > /tmp/payflow-api.log 2>&1 &
    API_PID=$!

    # Wait for API to be ready
    if wait_for_service "http://localhost:3000/health/live" "API server" 60; then
      print_success "API server is running (PID: $API_PID)"
    else
      print_error "API server failed to start. Check /tmp/payflow-api.log"
      cat /tmp/payflow-api.log | tail -50
      exit 1
    fi

    # Step 4: Run curl API tests
    print_header "Step 4: Running Curl API Tests"
    npm run test:api:local
    print_success "Curl API tests completed"

    # Step 5: Run K6 load tests
    print_header "Step 5: Running K6 Load Tests"
    npm run k6:local
    print_success "K6 load tests completed"
    ;;

  docker)
    print_step "Environment: DOCKER (full Docker stack)"
    echo ""

    # Step 1: Start full Docker stack
    print_step "Step 1: Starting Docker infrastructure..."
    npm run infra:docker:up
    STARTED_INFRA=true

    # Wait for API to be ready
    if wait_for_service "http://localhost:3000/health/live" "API server" 90; then
      print_success "Docker stack is running"
    else
      print_error "Docker stack failed to start"
      docker-compose -f docker/docker-compose.yml logs --tail=50
      exit 1
    fi

    # Step 2: Run Jest tests
    print_header "Step 2: Running Jest Tests"
    npm run test:jest:docker
    print_success "Jest tests completed"

    # Step 3: Run curl API tests
    print_header "Step 3: Running Curl API Tests"
    npm run test:api:docker
    print_success "Curl API tests completed"

    # Step 4: Run K6 load tests
    print_header "Step 4: Running K6 Load Tests"
    npm run k6:docker
    print_success "K6 load tests completed"
    ;;

  vps|staging|production)
    print_step "Environment: $ENV (remote server)"
    echo ""
    print_warning "Remote environments require the API to be already running."
    print_warning "Only unit tests and remote API/load tests will run."
    echo ""

    # Step 1: Run unit tests (local code validation)
    print_header "Step 1: Running Unit Tests"
    npm run test:unit
    print_success "Unit tests completed"

    # Step 2: Run curl API tests against remote
    print_header "Step 2: Running Curl API Tests (Remote)"
    npm run test:api:$ENV
    print_success "Curl API tests completed"

    # Step 3: Run K6 load tests against remote
    print_header "Step 3: Running K6 Load Tests (Remote)"
    npm run k6:$ENV
    print_success "K6 load tests completed"
    ;;

  *)
    print_error "Unknown environment: $ENV"
    echo ""
    echo "Usage: $0 [local|docker|vps|staging|production]"
    exit 1
    ;;
esac

print_header "All Tests Completed Successfully!"
echo -e "${GREEN}Environment: $ENV${NC}"
echo ""
