#!/usr/bin/env bash
# scripts/test-all.sh
# Runs all Jest test suites (unit / integration / e2e / chaos) in sequence,
# shows live output for each, then prints a summary table.

set -uo pipefail

COMPOSE_FILE="docker/docker-compose.test.yml"

# ── Start Docker test containers ─────────────────────────────────────────────
start_infra() {
  printf '\n\033[1m════  Starting test infrastructure  ════\033[0m\n'
  docker-compose -f "$COMPOSE_FILE" up -d mongodb-test redis-test

  printf 'Waiting for MongoDB and Redis to be healthy'
  local attempts=0
  until docker-compose -f "$COMPOSE_FILE" ps mongodb-test 2>/dev/null | grep -q "healthy" && \
        docker-compose -f "$COMPOSE_FILE" ps redis-test   2>/dev/null | grep -q "healthy"; do
    sleep 2
    printf '.'
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      printf '\n\033[0;31mContainers did not become healthy in time. Aborting.\033[0m\n'
      docker-compose -f "$COMPOSE_FILE" down
      exit 1
    fi
  done
  printf ' ready\n'
}

stop_infra() {
  printf '\n\033[1m════  Stopping test infrastructure  ════\033[0m\n'
  docker-compose -f "$COMPOSE_FILE" down
}

start_infra
trap stop_infra EXIT

# ── Column widths (content only; each cell gets 1-space padding on each side) ─
C1=22   # Suite name
C2=7    # Tests count
C3=22   # Status

# ── Box-drawing helpers ───────────────────────────────────────────────────────
_seg() { printf '%*s' "$1" '' | tr ' ' '─'; }

_hline() {   # args: left  mid  right
  printf '%s' "$1"; _seg $((C1+2))
  printf '%s' "$2"; _seg $((C2+2))
  printf '%s' "$2"; _seg $((C3+2))
  printf '%s\n' "$3"
}

_row() {
  printf '│ %-*s │ %-*s │ %-*s │\n' $C1 "$1" $C2 "$2" $C3 "$3"
}

_row_c() {   # col1  col2  col3  ansi-color
  printf '│ %-*s │ %-*s │ %b%-*s\033[0m │\n' \
    $C1 "$1" $C2 "$2" "$4" $C3 "$3"
}

# ── Run one Jest suite; exports: SUITE_LABEL SUITE_TESTS SUITE_STATUS SUITE_COLOR
run_suite() {
  local label="$1" path="$2"
  local tmpfile; tmpfile=$(mktemp)

  printf '\n\033[1m════  %s  ════\033[0m\n' "$label"

  # Run jest: show output live AND capture it for parsing
  npx jest --runInBand "$path" --detectOpenHandles --forceExit 2>&1 | tee "$tmpfile"
  local rc=${PIPESTATUS[0]}

  # ── Docker / infrastructure unavailable? ──────────────────────────────────
  if grep -qE 'ECONNREFUSED|ENOTFOUND|MongoServerSelectionError|ETIMEDOUT|connect ECONNREFUSED' "$tmpfile"; then
    SUITE_LABEL="$label"
    SUITE_TESTS='—'
    SUITE_STATUS='Docker not running'
    SUITE_COLOR='\033[1;33m'   # yellow
    rm "$tmpfile"
    return
  fi

  # ── Parse Jest summary ────────────────────────────────────────────────────
  local total_tests passed_suites failed_tests
  total_tests=$(grep '^Tests:' "$tmpfile" | tail -1 \
    | sed 's/.*[^0-9]\([0-9][0-9]*\) total.*/\1/')
  passed_suites=$(grep '^Test Suites:' "$tmpfile" | tail -1 \
    | sed 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/')
  failed_tests=$(grep '^Tests:' "$tmpfile" | tail -1 \
    | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p')

  SUITE_LABEL="$label"

  if [ "$rc" -eq 0 ] && [ -n "$total_tests" ]; then
    SUITE_TESTS="$total_tests"
    # Annotate with suite count when > 1 (e.g. "Unit (41 suites)")
    if [ -n "$passed_suites" ] && [ "$passed_suites" -gt 1 ]; then
      SUITE_LABEL="${label} (${passed_suites} suites)"
    fi
    SUITE_STATUS='All passed'
    SUITE_COLOR='\033[0;32m'   # green
    OVERALL_PASS=$((OVERALL_PASS + 1))
  elif [ -n "$total_tests" ]; then
    SUITE_TESTS="$total_tests"
    SUITE_STATUS="${failed_tests:-?} test(s) failed"
    SUITE_COLOR='\033[0;31m'   # red
    OVERALL_FAIL=$((OVERALL_FAIL + 1))
  else
    SUITE_TESTS='—'
    SUITE_STATUS='No tests found'
    SUITE_COLOR='\033[0;33m'   # yellow
  fi

  rm "$tmpfile"
}

# ── Accumulators ─────────────────────────────────────────────────────────────
OVERALL_PASS=0
OVERALL_FAIL=0
SUITE_LABEL='' SUITE_TESTS='' SUITE_STATUS='' SUITE_COLOR=''
declare -a R_LABELS=() R_TESTS=() R_STATUSES=() R_COLORS=()

_record() {
  R_LABELS+=("$SUITE_LABEL")
  R_TESTS+=("$SUITE_TESTS")
  R_STATUSES+=("$SUITE_STATUS")
  R_COLORS+=("$SUITE_COLOR")
}

# ── Execute suites ────────────────────────────────────────────────────────────
run_suite "Unit"         "tests/unit";        _record
run_suite "Integration"  "tests/integration"; _record
run_suite "E2E"          "tests/e2e";         _record
run_suite "Chaos"        "tests/chaos";       _record

# ── Summary table ─────────────────────────────────────────────────────────────
printf '\n\033[1m  TEST SUMMARY\033[0m\n'
printf '  '; _hline '┌' '┬' '┐'
printf '  '; _row    'Suite' 'Tests' 'Status'
printf '  '; _hline  '├' '┼' '┤'

last=$(( ${#R_LABELS[@]} - 1 ))
for i in "${!R_LABELS[@]}"; do
  printf '  '; _row_c "${R_LABELS[$i]}" "${R_TESTS[$i]}" "${R_STATUSES[$i]}" "${R_COLORS[$i]}"
  [ "$i" -lt "$last" ] && { printf '  '; _hline '├' '┼' '┤'; }
done

printf '  '; _hline '└' '┴' '┘'
printf '\n'

# ── Exit code ────────────────────────────────────────────────────────────────
[ "$OVERALL_FAIL" -eq 0 ]
