#!/usr/bin/env bash
# run_local.sh — start the trading bot locally without Docker
# Usage:  bash run_local.sh
set -euo pipefail

# ── PostgreSQL 15 (Homebrew) ───────────────────────────────────────────────────
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[run_local]${NC} $*"; }
warn() { echo -e "${YELLOW}[run_local]${NC} $*"; }
fail() { echo -e "${RED}[run_local] ERROR:${NC} $*"; exit 1; }
step() { echo -e "\n${CYAN}──────────────────────────────────────────${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}──────────────────────────────────────────${NC}"; }

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
step "1/5  Checking prerequisites"

command -v psql      >/dev/null 2>&1 || fail "psql not found. Run: brew install postgresql@15"
command -v redis-cli >/dev/null 2>&1 || fail "redis-cli not found. Run: brew install redis"
command -v node      >/dev/null 2>&1 || fail "node not found. Run: brew install node"

pg_isready -h localhost -p 5432 >/dev/null 2>&1 \
  || fail "PostgreSQL is not running. Start it with: brew services start postgresql@15"

redis-cli -h localhost ping >/dev/null 2>&1 \
  || fail "Redis is not running. Start it with: brew services start redis"

log "Node $(node --version) | psql $(psql --version | awk '{print $3}') | Redis $(redis-cli --version | awk '{print $2}')"
log "Prerequisites OK"

# ── 2. .env ───────────────────────────────────────────────────────────────────
step "2/5  Environment (.env)"

if [ ! -f .env ]; then
  cp .env.example .env
  # Patch to local values
  sed -i '' 's|TRADOVATE_POSTGRES_HOST=tradovate-postgres|TRADOVATE_POSTGRES_HOST=localhost|' .env
  sed -i '' 's|TRADOVATE_REDIS_HOST=.*|TRADOVATE_REDIS_HOST=localhost|' .env 2>/dev/null || true
  warn ".env created from .env.example (patched for localhost). Edit API keys if needed."
else
  log ".env already exists"
fi

# Export all vars from .env into the current shell (so seed.js can read them)
set -a
# shellcheck disable=SC1091
source .env
set +a

# ── 3. PostgreSQL: user + database ────────────────────────────────────────────
step "3/5  PostgreSQL setup"

DB_USER="${TRADOVATE_POSTGRES_USER:-tradovate}"
DB_PASS="${TRADOVATE_POSTGRES_PASSWORD:-tradovate_pass}"
DB_NAME="${TRADOVATE_POSTGRES_DATABASE:-tradovate_bot}"

# Create role if missing
if psql -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  log "Role '${DB_USER}' already exists"
else
  psql -d postgres -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
  log "Role '${DB_USER}' created"
fi

# Create database if missing
if psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  log "Database '${DB_NAME}' already exists"
else
  psql -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
  psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null
  log "Database '${DB_NAME}' created"
fi

# Always ensure schema tables exist (idempotent CREATE TABLE IF NOT EXISTS)
log "Applying schema migration..."
psql -U "${DB_USER}" -d "${DB_NAME}" -f migrations/001_initial_schema.sql >/dev/null
log "Schema up to date"

# ── 4. npm install ────────────────────────────────────────────────────────────
step "4/5  Installing dependencies"

if [ ! -d node_modules ] || [ ! -d node_modules/pg ]; then
  log "Running npm install..."
  npm install
else
  log "node_modules up to date"
fi

# ── 5. Seed data ──────────────────────────────────────────────────────────────
step "5/6  Seeding data"

node scripts/seed.js

# ── 6. Start dev server ───────────────────────────────────────────────────────
step "6/6  Starting development server"
log "Running: npm run dev"
log "Dashboard → http://localhost:3000"
log "Password  → ${TRADOVATE_AUTHENTICATION_PASSWORD:-admin123}"
echo ""

npm run dev
