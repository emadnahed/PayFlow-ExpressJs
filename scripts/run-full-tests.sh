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
      npm run docker:test:down 2>/dev/null || true
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

wait_for_mongodb() {
  local host=${1:-localhost}
  local port=${2:-27018}
  local max_attempts=${3:-60}
  local attempt=1

  echo -n "  Waiting for MongoDB ($host:$port)"
  while [ $attempt -le $max_attempts ]; do
    # Check if MongoDB is accepting connections
    if docker exec payflow-mongodb-test mongosh --eval "db.adminCommand('ping')" --quiet 2>/dev/null | grep -q "ok"; then
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

wait_for_redis() {
  local host=${1:-localhost}
  local port=${2:-6380}
  local max_attempts=${3:-30}
  local attempt=1

  echo -n "  Waiting for Redis ($host:$port)"
  while [ $attempt -le $max_attempts ]; do
    if docker exec payflow-redis-test redis-cli ping 2>/dev/null | grep -q "PONG"; then
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
    print_success "Test infrastructure containers started"

    # Wait for services to be healthy (not just running)
    print_step "Waiting for services to be healthy..."

    if ! wait_for_mongodb localhost 27018 60; then
      print_error "MongoDB failed to become healthy"
      docker logs payflow-mongodb-test --tail=20 2>/dev/null || true
      exit 1
    fi

    if ! wait_for_redis localhost 6380 30; then
      print_error "Redis failed to become healthy"
      docker logs payflow-redis-test --tail=20 2>/dev/null || true
      exit 1
    fi

    print_success "All infrastructure services are healthy"

    # Step 2: Run Jest tests (unit, integration, e2e)
    print_header "Step 2: Running Jest Tests"
    npm run test:jest:local
    print_success "Jest tests completed"

    # Step 3: Start API server for curl and k6 tests
    print_header "Step 3: Starting API Server"
    print_step "Starting API server in background..."

    # Start the dev server in background with test environment for lenient rate limits
    # Use TEST_* variables to configure test infrastructure ports
    # These override .env values to ensure server connects to test containers
    NODE_ENV=test \
      TEST_MONGODB_URI=mongodb://localhost:27018/payflow_test \
      MONGODB_URI=mongodb://localhost:27018/payflow_test \
      TEST_REDIS_PORT=6380 \
      REDIS_PORT=6380 \
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
    print_step "Environment: DOCKER (full Docker test stack)"
    echo ""

    # Step 1: Start full Docker test stack (uses docker-compose.test.yml)
    print_step "Step 1: Starting Docker test infrastructure..."
    npm run docker:test:all
    STARTED_INFRA=true

    # Wait for API to be ready (test container exposes on port 3001)
    if wait_for_service "http://localhost:3001/health/live" "API server" 90; then
      print_success "Docker test stack is running"
    else
      print_error "Docker test stack failed to start"
      docker-compose -f docker/docker-compose.test.yml logs --tail=50
      exit 1
    fi

    # Warm-up delay: Docker containers need extra time for full initialization
    # (connection pools, Redis subscriptions, etc.)
    print_step "Warming up API server..."
    sleep 10
    # Make a few warm-up requests to ensure everything is connected
    curl -s http://localhost:3001/health > /dev/null 2>&1
    curl -s http://localhost:3001/health/ready > /dev/null 2>&1
    print_success "API server warmed up"

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
