# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Thiagosian Health** is a comprehensive health performance system consisting of:

1. **Codex CLI** - Python-based command-line interface for health data analysis and prescription
2. **Codex Frontend** - Next.js web application with tRPC for type-safe API communication
3. **Health Sync** - Automated Garmin Connect synchronization service
4. **PostgreSQL Database** - TimescaleDB-enabled database storing all health metrics

The system tracks body composition, vitals, workouts, nutrition, biomarkers, and sleep data with advanced analytics and intervention planning capabilities.

## 🚨 CRITICAL: Remote Execution Model

**The files in `thiagosian-health/` are on a REMOTE SERVER, mounted in your local environment.**

### File Operations vs Command Execution

**✅ LOCAL (use normal tools):**
- Reading files: `Read`, `Glob`, `Grep`
- Writing/editing files: `Write`, `Edit`
- Searching code: All file tools work locally

**⚠️ REMOTE (must use `sshc`):**
- Running applications: `npm run dev`, `python codex.py`, etc.
- Installing dependencies: `npm install`, `pip install`
- System commands: `systemctl`, `docker`, `apt`
- Any command that executes code on the server

### Using `sshc` (SSH with Vault Credentials)

`sshc` is a Vault-integrated SSH wrapper. Use it instead of traditional `ssh`.

**Basic Usage:**
```bash
# Execute single command
sshc thiagosian-health-codex "whoami"
sshc thiagosian-health-codex "ls -la"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py status"

# Multiple commands (chain with &&)
sshc thiagosian-health-codex "whoami && pwd"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run build"
```

**With Sudo (`--sudo` or `-su`):**
```bash
# Root commands
sshc --sudo thiagosian-health-codex "whoami"                      # Returns: root
sshc -su thiagosian-health-codex "apt update"
sshc -su thiagosian-health-codex "systemctl status vault-agent"
sshc --sudo thiagosian-health-codex "docker ps"
```

**Examples:**
```bash
# ❌ WRONG - Will execute locally (not on server)
cd ~/thiagosian-health/codex/frontend
npm run dev

# ✅ CORRECT - Executes on remote server
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run dev"

# ❌ WRONG - Installs packages locally
cd ~/thiagosian-health/codex
pip install -r requirements.txt

# ✅ CORRECT - Installs on remote server
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && source venv/bin/activate && pip install -r requirements.txt"

# ✅ CORRECT - Check service status (requires sudo)
sshc --sudo thiagosian-health-codex "systemctl status vault-agent"
```

### Network Context

**Important:** When commands run on the remote server (172.31.3.100), "localhost" refers to that server, not your local machine.

- Remote server IP: **172.31.3.100**
- PostgreSQL host (from server perspective): **172.31.3.1:5432**
- Frontend dev server: Runs on remote `localhost:3000` (accessible via 172.31.3.100:3000)

### Quick Reference

| Task | Tool | Example |
|------|------|---------|
| Read file | `Read` | `Read file_path="/home/thiagosian/thiagosian-health/codex/README.md"` |
| Edit file | `Edit` | `Edit file_path="..." old_string="..." new_string="..."` |
| Search code | `Grep` | `Grep pattern="function" path="codex/"` |
| Run Python CLI | `sshc` | `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py status"` |
| Start Next.js dev | `sshc` | `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run dev"` |
| Install packages | `sshc` | `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && pip install -r requirements.txt"` |
| Check system service | `sshc --sudo` | `sshc --sudo thiagosian-health-codex "systemctl status vault-agent"` |
| Query database | `pgquery` | `pgquery health_system "SELECT * FROM daily_vitals LIMIT 5"` |

## Architecture

### High-Level Structure

```
thiagosian-health/
├── codex/                      # Main application directory
│   ├── codex.py               # CLI entry point (Typer framework)
│   ├── modules/               # Python modules for CLI commands
│   │   ├── db.py             # Database layer with connection pooling
│   │   ├── status.py         # Status dashboard formatting
│   │   ├── prescribe.py      # Intervention plan prescription logic
│   │   ├── log.py            # Interactive data logging
│   │   ├── analyze.py        # Advanced analytics (correlation, trends)
│   │   ├── models.py         # Pydantic models for validation
│   │   ├── healthcheck.py    # Data integrity validation
│   │   ├── migrate.py        # Database migration system
│   │   └── visualize.py      # Terminal-based visualizations
│   │
│   ├── frontend/              # Next.js application
│   │   ├── app/              # Next.js 16 App Router pages
│   │   ├── server/           # tRPC backend
│   │   │   ├── _app.ts      # Main tRPC router aggregation
│   │   │   ├── trpc.ts      # tRPC configuration
│   │   │   └── routers/     # API route handlers
│   │   │       ├── auth.ts
│   │   │       ├── foods.ts
│   │   │       ├── nutrition.ts
│   │   │       ├── metrics.ts
│   │   │       ├── training.ts
│   │   │       ├── mealPlans.ts
│   │   │       ├── health.ts
│   │   │       └── measurements.ts
│   │   ├── lib/              # Shared utilities
│   │   │   ├── db.ts        # Database connection
│   │   │   ├── auth.ts      # JWT authentication
│   │   │   ├── vault.ts     # HashiCorp Vault integration
│   │   │   └── trpc.ts      # tRPC client setup
│   │   └── components/       # React components
│   │
│   ├── health-sync/          # Garmin synchronization service
│   │   ├── garmin/           # Garmin Connect scripts
│   │   │   ├── sync_smart.py         # Smart sync (cron: 7h, 23h)
│   │   │   ├── import_connect.py     # Historical import
│   │   │   └── test_auth.py          # Authentication test
│   │   ├── database/         # Database setup scripts
│   │   ├── shared/           # Shared modules
│   │   │   ├── vault_config.py       # Vault credential loading
│   │   │   └── notifications.py      # Google Chat notifications
│   │   └── monitoring/       # Health monitoring
│   │
│   ├── db/                    # Database management
│   │   └── migrations/        # Versioned SQL migrations
│   │
│   ├── templates/             # YAML templates for prescriptions
│   ├── scripts/               # Utility scripts
│   └── tests/                 # Pytest test suite
│
└── docs/                      # Documentation
```

### Technology Stack

**Python Backend (CLI & Sync):**
- typer - CLI framework
- rich - Terminal UI rendering
- psycopg2 - PostgreSQL driver with connection pooling
- pydantic - Schema validation
- pandas + scipy - Data analysis
- garminconnect - Garmin API client
- hvac - HashiCorp Vault client

**Frontend:**
- Next.js 16 (App Router)
- React 19
- tRPC 11 - Type-safe API layer
- TailwindCSS + Radix UI
- @tanstack/react-query
- Recharts for visualizations

**Database:**
- PostgreSQL 16.10
- TimescaleDB 2.22.1 (time-series optimization)
- 16 core tables + 101+ views/functions

**Infrastructure:**
- HashiCorp Vault - Credential management
- Docker - Deployment (docker-compose.yml)
- Cron - Automated sync scheduling

### Database Schema Overview

**Core Tables:**
- `athletes` - User profiles
- `daily_vitals` - RHR, HRV, sleep, stress (daily)
- `peso_biometria` - Weight and body fat (daily)
- `medidas_corporais` - Body measurements (periodic)
- `workout_sessions` + `workout_sets` - Training logs
- `workout_activities` - Garmin activity imports
- `intervention_plans` - Diet and training prescriptions
- `biomarkers`, `biomarker_results`, `lab_reports` - Lab results
- `supplement_log` - Supplement tracking
- `foods` - TACO nutrition database (~3000 items)
- `meal_plan_items` - Detailed meal planning

**Key Design Patterns:**
- Temporal validity: `valid_from`, `valid_to` for plans
- Soft deletes: Plans closed by setting `valid_to`
- UUID athlete_id for multi-user support
- TimescaleDB hypertables for time-series data
- Audit trail via `change_reason` fields

### Authentication & Security

**Credential Storage:**
All credentials stored in HashiCorp Vault (never in code):
- Database: `claude/postgres/health_system`
- Garmin: `thiagosian-health/garmin`
- Google Chat: `thiagosian-health/google-chat`

**Frontend Auth:**
- JWT tokens (jose library)
- Signed with HS256
- Stored in httpOnly cookies
- Session middleware on tRPC routes

**Database Access:**
- Connection pooling (10 max connections)
- Retry logic with exponential backoff
- Vault token via `/var/run/secrets/vault-token`

## Development Commands

### Python CLI (Codex)

**Setup (Remote):**
```bash
# Create virtual environment
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python3 -m venv venv"

# Install dependencies
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && source venv/bin/activate && pip install -r requirements.txt"
```

**Common Commands (Remote Execution):**
```bash
# Status dashboard
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py status"

# View historical data
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py show measurements --days 90"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py show vitals --days 30"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py show energy-balance --days 30"

# Prescribe interventions (create YAML file locally first with Write tool)
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py prescribe diet --file plan.yml"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py prescribe diet --new"

# Analytics
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py analyze correlation sleep_duration_hours hrv_average_ms --days 90"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py analyze plan-effectiveness --plan-name 'Cutting' --metric peso_kg"

# Database management
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py db migrate --list"
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py db migrate --apply"

# Data integrity
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py healthcheck"
```

**Running Tests (Remote):**
```bash
# All tests with coverage
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && source venv/bin/activate && pytest"

# Specific test categories
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && source venv/bin/activate && pytest -m unit"

# Single test file
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && source venv/bin/activate && pytest tests/test_db.py -v"
```

### Next.js Frontend

**Setup (Remote):**
```bash
# Install dependencies
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm install"
```

**Development (Remote):**
```bash
# Start dev server (http://localhost:3000)
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run dev"

# Production build
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run build"

# Start production server
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run start"

# Lint
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npm run lint"
```

**Important Notes:**
- Uses Next.js App Router (not Pages Router)
- tRPC endpoints at `/api/trpc/[trpc]`
- All pages require authentication except `/login`
- Database queries via Postgres connection pool in `lib/db.ts`
- Vault credentials loaded server-side in `lib/vault.ts`

### Health Sync (Garmin)

**Setup (Remote):**
```bash
# Create virtual environment
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/health-sync && python3 -m venv venv"

# Install dependencies
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/health-sync && source venv/bin/activate && pip install -r requirements.txt"
```

**Manual Sync (Remote):**
```bash
# Smart sync (preferred - runs via cron)
sshc thiagosian-health-codex "sg vault -c '/home/thiagosian/health-sync/venv/bin/python3 /home/thiagosian/health-sync/garmin/sync_smart.py'"

# Test authentication
sshc thiagosian-health-codex "sg vault -c '/home/thiagosian/health-sync/venv/bin/python3 /home/thiagosian/health-sync/garmin/test_auth.py'"

# View logs
sshc thiagosian-health-codex "tail -f /home/thiagosian/health-sync/garmin/logs/sync_smart.log"
```

**Automated Schedule:**
- 07:00 UTC - Morning sync (after Garmin overnight sync)
- 23:00 UTC - Evening sync (final data capture)

**Note:** Sync runs automatically via cron on the server.

### Database Access (pgquery)

**`pgquery` replaces traditional `psql` commands** with Vault-integrated credential loading.

**Usage:**
```bash
# BEFORE (traditional psql):
# PGPASSWORD=senha psql -h host -p port -U user -d db -c "query"

# NOW (with pgquery - credentials from Vault):
pgquery health_system "SELECT * FROM workout_sets LIMIT 10"
pgquery health_system "SELECT * FROM daily_vitals WHERE date >= CURRENT_DATE - INTERVAL '7 days'"
pgquery health_system "SELECT COUNT(*) FROM intervention_plans WHERE valid_to IS NULL"
```

**Features:**
- Automatically loads credentials from HashiCorp Vault (`claude/postgres/health_system`)
- No need to specify host, port, user, or password
- Direct query execution without interactive session
- Perfect for quick data inspection and debugging

**Examples:**
```bash
# View recent vitals
pgquery health_system "SELECT date, resting_heart_rate, hrv_average_ms FROM daily_vitals ORDER BY date DESC LIMIT 7"

# Check active plans
pgquery health_system "SELECT name, plan_type, valid_from FROM intervention_plans WHERE valid_to IS NULL"

# Count workout sets by exercise
pgquery health_system "SELECT exercise_name, COUNT(*) FROM workout_sets GROUP BY exercise_name ORDER BY COUNT(*) DESC LIMIT 10"

# Verify migration status
pgquery health_system "SELECT * FROM schema_migrations ORDER BY id"
```

## Key Workflows

### Adding a New CLI Command

1. Add query function to `modules/db.py`
2. Create formatting logic (use rich.Table for display)
3. Add Typer command in `codex.py`
4. Add unit tests in `tests/`
5. Update help documentation

### Adding a New tRPC Endpoint

1. Create/modify router in `frontend/server/routers/`
2. Add to main router in `frontend/server/_app.ts`
3. Use in frontend via `trpc.routerName.procedureName.useQuery()` or `.useMutation()`
4. Database queries use `pool.query()` from `lib/db.ts`
5. Ensure proper error handling and Zod validation

### Creating a Database Migration

```bash
# Generate migration file (locally - creates file in db/migrations/)
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py db migrate --generate 'add_column_description'"

# Edit generated SQL file in db/migrations/ (use Edit tool)

# Apply migration (remote execution)
sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py db migrate --apply"

# Verify migration was applied
pgquery health_system "SELECT * FROM schema_migrations ORDER BY id DESC LIMIT 5"
```

**Migration Guidelines:**
- Always use transactions
- Include rollback comments
- Test on dev database first
- Migrations are append-only (never modify existing)
- Use `pgquery` to verify schema changes after applying

### Prescribing Intervention Plans

**Diet Plans:**
- Create YAML file (use `codex prescribe diet --new` for template)
- Validate against Pydantic schema (models.DietPlan)
- Automatically closes previous active plan
- Required fields: name, goal, daily_calories, protein_g, carbs_g, fats_g

**Training Plans:**
- YAML structure: name, goal, training_days, mesocycle_weeks
- Can include detailed workout templates
- Links to `workout_templates` and `template_exercises` tables

### Data Flow

1. **Garmin Wearable** → Garmin Connect (automatic sync)
2. **Garmin Connect** → health-sync scripts → PostgreSQL (cron: 2x daily)
3. **PostgreSQL** ← Codex CLI (queries, prescriptions, analytics)
4. **PostgreSQL** ← Codex Frontend (tRPC API, real-time dashboard)
5. **Manual Logging** → Codex CLI → PostgreSQL (workout sets, measurements)

## Important Implementation Notes

### Connection Management

- Python CLI uses singleton Database class with connection pooling
- Frontend uses `pg.Pool` in `lib/db.ts` (shared across tRPC handlers)
- Always close connections in try/finally blocks
- Retry logic implemented for transient failures

### YAML Prescription System

- All plans validated via Pydantic models before DB insertion
- Templates stored in `codex/templates/`
- Interactive mode available via `--interactive` flag
- Plans support temporal validity (valid_from/valid_to)

### tRPC Error Handling

- Use `TRPCError` with appropriate error codes
- Authentication failures throw UNAUTHORIZED
- Validation errors throw BAD_REQUEST
- Database errors throw INTERNAL_SERVER_ERROR

### Testing Strategy

- Unit tests: Pure functions, models, validation
- Integration tests: Database queries (requires test DB)
- CLI tests: Invoke commands, verify output
- Minimum 40% coverage enforced

### Vault Integration

- Token managed by Vault Agent (systemd service)
- Scripts must run with vault group: `sg vault -c 'command'`
- Never hardcode credentials
- Fallback to .env only in development

## Troubleshooting

**CLI Database Connection Issues:**
- Verify Vault token: `sshc --sudo thiagosian-health-codex "cat /var/run/secrets/vault-token"`
- Check Vault Agent: `sshc --sudo thiagosian-health-codex "systemctl status vault-agent"`
- Test vault access: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/health-sync && python shared/vault_config.py"`

**Frontend Build Failures:**
- Clear Next.js cache: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && rm -rf .next"`
- Reinstall dependencies: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && rm -rf node_modules package-lock.json && npm install"`
- Check TypeScript errors: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/frontend && npx tsc --noEmit"`

**Garmin Sync Failures:**
- Run authentication test: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex/health-sync && python garmin/test_auth.py"`
- Check logs: `sshc thiagosian-health-codex "tail -100 ~/thiagosian-health/codex/health-sync/garmin/logs/sync_smart.log"`
- Verify credentials in Vault: `sshc thiagosian-health-codex "vault kv get thiagosian-health/garmin"`

**Migration Issues:**
- List applied migrations: `sshc thiagosian-health-codex "cd ~/thiagosian-health/codex && python codex.py db migrate --list"`
- Manually verify: `pgquery health_system "SELECT * FROM schema_migrations ORDER BY id"`
- Rollback via SQL if needed (migrations include rollback hints)

**Remember:** Always use `sshc` for command execution on the remote server. File operations (Read, Edit, Write) work locally on the mounted filesystem.
