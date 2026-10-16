import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Disposable zero-service acceptance harness.
 *
 * The release question this exists to answer is narrow: can an organisation with ZERO Service rows
 * bootstrap its own operational configuration through the CRM, with no seed script, no Prisma Studio
 * and no developer? A green suite against the seeded development database (six services) cannot
 * answer that, because the seeded services are exactly the thing the failing installation lacked.
 *
 * So this harness builds throwaway SQLite databases from the migrations alone, runs the real
 * first-administrator bootstrap (`npm run bootstrap:admin`), and then hands the database to
 * Playwright, which drives the actual CRM UI. Nothing here is ever pointed at `prisma/dev.db`:
 * every subcommand refuses a database name that is not one of its own.
 *
 * Subcommands
 *   db-zero                       build prisma/acceptance-zero.db      (migrations + org + admin, zero services)
 *   db-populated                  build prisma/acceptance-populated.db (existing installation, zero services)
 *   build      --db=NAME          production build against that database
 *   test       --db=NAME --mode=dev|production --suite=zero|operations|populated
 *                                 start the server, point Playwright at it through BASE_URL, report the result
 *
 * The production-mode run is the one that matters most: `npm run dev` compiles on demand and hides
 * build-output problems, so the same workflows are repeated against `node server.mjs --production`.
 */

const WINDOWS = process.platform === 'win32';
const npm = WINDOWS ? 'npm.cmd' : 'npm';

/** Database file names this harness owns. Anything else is refused rather than migrated. */
const ZERO_DB = 'acceptance-zero.db';
const POPULATED_DB = 'acceptance-populated.db';
const OWNED_DATABASES = new Set([ZERO_DB, POPULATED_DB]);

/** The single administrator the real bootstrap script creates. These are throwaway credentials for a
 * throwaway database; they are deliberately not reusable anywhere else and never touch production. */
const ADMIN_EMAIL = 'admin@safenesthousing.co.uk';
const ADMIN_NAME = 'Acceptance Administrator';
const ADMIN_PASSWORD = 'AcceptanceOnly!2026';

/** Production-mode configuration. `runtimeConfigChecks` (src/lib/env.ts) refuses a production start
 * without these, and `hasStrongSecret` rejects any value containing "replace", "change",
 * "development", "local" or "secret" — so the words below are chosen to pass a real check rather
 * than to look like placeholders. They are acceptance-only and grant access to nothing. */
const PRODUCTION_ENVIRONMENT = {
  APP_URL: 'https://acceptance.safenest.test',
  AUTH_SECRET: 'AcceptanceRunAuthKey_9f3b7c2d81ae4056fbd1e7c9a2b4',
  FILE_SIGNING_SECRET: 'AcceptanceRunFileSigningKey_4d8e1a6c09bf3725e8a1c6d4',
  RETENTION_REVIEW_SECRET: 'AcceptanceRunRetentionKey_7b2f5e9d31ac8046bf02de95',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.acceptance.invalid',
  SMTP_PORT: '587',
  STORAGE_PROVIDER: 'local',
  RATE_LIMIT_PROVIDER: 'memory',
  MALWARE_SCAN_PROVIDER: 'disabled',
  REQUIRE_MALWARE_SCAN: 'false'
};

const SUITES = {
  // The full zero-service acceptance: service management and referral intake first, then the rest of
  // the operational CRM on the same empty installation. Alphabetical order is the run order.
  zero: ['tests/acceptance/01-zero-service.spec.ts', 'tests/acceptance/02-operations.spec.ts'],
  services: ['tests/acceptance/01-zero-service.spec.ts'],
  operations: ['tests/acceptance/02-operations.spec.ts'],
  populated: ['tests/acceptance/03-populated-upgrade.spec.ts']
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readFlag(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function assertOwnedDatabase(name) {
  if (!OWNED_DATABASES.has(name)) {
    fail(`Refusing to touch "${name}". This harness only builds and runs against ${[...OWNED_DATABASES].join(' or ')}, so it can never migrate, reset or seed a real database.`);
  }
  return name;
}

const databaseUrl = (name) => `file:./${name}`;
const databaseFile = (name) => resolve('prisma', name);

/** Environment for every child process: the acceptance database first, so nothing can fall back to
 * `file:./dev.db` from .env and quietly operate on the development database instead. */
function childEnvironment(name, { production = false, port } = {}) {
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: production ? 'production' : 'development',
    HOST: '127.0.0.1',
    PORT: String(port ?? 3100),
    APP_URL: production ? PRODUCTION_ENVIRONMENT.APP_URL : `http://127.0.0.1:${port ?? 3100}`,
    ACCEPTANCE_DATABASE_URL: databaseUrl(name),
    ACCEPTANCE_ADMIN_EMAIL: ADMIN_EMAIL,
    ACCEPTANCE_ADMIN_PASSWORD: ADMIN_PASSWORD
  };
  if (production) Object.assign(environment, PRODUCTION_ENVIRONMENT);
  // Never inherit a developer's real secrets or a stale database pointer into an acceptance run.
  delete environment.ADMIN_PASSWORD;
  return environment;
}

function run(command, args, environment, label) {
  // One command string rather than an args array: with shell:true Node only concatenates array args
  // (and warns about it, DEP0190), while a single string is passed to cmd.exe quoted as written.
  // This is the same approach scripts/migrate-local.mjs already uses on Windows.
  const line = [command, ...args].join(' ');
  console.log(`\n$ ${line}`);
  const result = spawnSync(line, { stdio: 'inherit', shell: true, env: environment, cwd: process.cwd() });
  if (result.error) fail(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} exited with status ${result.status}.`);
}

/** Deletes a disposable database and its SQLite sidecars. Refuses anything it does not own. */
function removeDatabase(name) {
  assertOwnedDatabase(name);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = `${databaseFile(name)}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
}

/** Opens the disposable database directly, for counting rows and for building the upgrade-case
 * fixture. The URL is passed explicitly so this client can never resolve .env's dev.db pointer. */
function openDatabase(name) {
  return new PrismaClient({ datasources: { db: { url: databaseUrl(name) } } });
}

async function count(client, table) {
  const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${table}"`);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Builds a database that represents a brand-new organisation installed the supported way:
 * migrations only, then `npm run bootstrap:admin`. No seed, no copy of dev.db, no operational rows.
 * This is the state the failing production installation was in.
 */
async function buildZeroDatabase(name) {
  assertOwnedDatabase(name);
  removeDatabase(name);
  const environment = childEnvironment(name);

  // 1. Schema from the reviewed migration history alone — the same script a deployment runs.
  run('node', ['scripts/migrate-local.mjs'], environment, 'migrations');

  // 2. The real first-administrator bootstrap: organisation, compatibility role labels, one admin.
  //    It creates no services, which is precisely the point being proven.
  run(npm, ['run', 'bootstrap:admin', '--', `--name="${ADMIN_NAME}"`], environment, 'bootstrap:admin');

  // 3. A known password so Playwright can sign in through the real login form. The production
  //    equivalent is the one-time reset link the bootstrap printed; this is the throwaway shortcut.
  run(npm, ['run', 'set:admin-password', '--', `--email=${ADMIN_EMAIL}`], { ...environment, ADMIN_PASSWORD }, 'set:admin-password');

  const client = openDatabase(name);
  const tables = ['Organisation', 'User', 'Membership', 'Service', 'Client', 'Referral', 'Placement', 'Property', 'Room', 'Task', 'CaseNote', 'Incident'];
  const counts = {};
  for (const table of tables) counts[table] = await count(client, table);
  await client.$disconnect();

  console.log(`\n${name} — row counts immediately after installation:`);
  for (const [table, value] of Object.entries(counts)) console.log(`  ${table.padEnd(14)} ${value}`);

  if (counts.Service !== 0) fail('Expected zero Service rows in a freshly installed database.');
  if (counts.Organisation !== 1 || counts.User !== 1) fail('Expected exactly one organisation and one administrator.');
  console.log(`\nSELECT COUNT(*) FROM Service = ${counts.Service}  (proved before any UI action)`);
  console.log(`Database ready at ${databaseFile(name)}. Sign in as ${ADMIN_EMAIL}.`);
}


/**
 * Builds the upgrade case: an organisation already in use — staff, service users, a property, rooms,
 * a placement, a case note, an incident, a task — that still has ZERO Service rows.
 *
 * A Referral cannot be part of that history: `Referral.serviceId` is NOT NULL with a foreign key to
 * Service, so the schema itself makes a referral impossible while no service exists. That is the
 * structural reason zero services is fatal rather than merely untidy.
 *
 * These rows are written directly because they represent data an earlier installation already stored.
 * The recovery that follows — first Service, first referral — happens only through the CRM UI.
 */
async function buildPopulatedDatabase(name) {
  assertOwnedDatabase(name);
  await buildZeroDatabase(name);

  const client = openDatabase(name);
  try {
    const organisation = await client.organisation.findFirstOrThrow({ where: { slug: 'safe-nest' } });
    const admin = await client.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const role = await client.role.findFirst({ where: { organisationId: organisation.id } });

    const staff = await client.user.create({
      data: { organisationId: organisation.id, email: 'acceptance.staff@safenest.test', name: 'Acceptance Support Lead', jobTitle: 'Support lead', passwordHash: admin.passwordHash }
    });
    if (role) await client.membership.create({ data: { organisationId: organisation.id, userId: staff.id, roleId: role.id } });

    const historic = new Date(Date.now() - 120 * 86_400_000);
    const property = await client.property.create({
      data: {
        organisationId: organisation.id, publicName: 'Acceptance Terrace', slug: 'acceptance-terrace', neighbourhood: 'Northside',
        serviceType: 'Supported accommodation', publicSummary: 'Pre-existing property written by the earlier installation.',
        eligibility: 'Pre-existing record.', capacity: 2, publicVacancyState: '1 room available', confidential: false, published: true
      }
    });
    const roomOne = await client.room.create({ data: { propertyId: property.id, label: 'Room 1', status: 'OCCUPIED' } });
    await client.room.create({ data: { propertyId: property.id, label: 'Room 2', status: 'AVAILABLE' } });

    const people = [['One', 'CURRENT'], ['Two', 'CURRENT'], ['Three', 'MOVED_ON']];
    const clients = [];
    for (const [index, [label, status]] of people.entries()) {
      clients.push(await client.client.create({
        data: {
          organisationId: organisation.id, reference: `SN-C-ACC-${index + 1}`, displayName: `Acceptance Resident ${label}`,
          status, riskLevel: 'Medium', admissionDate: historic, keyWorkerId: index === 0 ? admin.id : staff.id, createdAt: historic
        }
      }));
    }

    const placement = await client.placement.create({ data: { clientId: clients[0].id, propertyId: property.id, roomId: roomOne.id, status: 'ACTIVE', startDate: historic, tenancyRef: 'ACC-TENANCY-1' } });
    await client.occupancyRecord.create({ data: { propertyId: property.id, roomId: roomOne.id, clientId: clients[0].id, placementId: placement.id, startDate: historic } });
    await client.caseNote.create({ data: { clientId: clients[0].id, authorId: admin.id, contactType: 'SUPPORT_SESSION', category: 'Support', note: 'Pre-existing support contact written before any service existed.', completed: true, meaningful: true, occurredAt: historic, createdAt: historic } });
    await client.incident.create({ data: { organisationId: organisation.id, clientId: clients[1].id, reference: 'SN-I-ACC-001', category: 'Property', severity: 'LOW', status: 'CLOSED', description: 'Pre-existing incident, closed before the upgrade.', incidentAt: historic, assignedLeadId: admin.id, createdAt: historic } });
    await client.task.create({ data: { organisationId: organisation.id, clientId: clients[2].id, title: 'Pre-existing open task', description: 'Written by the earlier installation.', priority: 'MEDIUM', status: 'OPEN', dueAt: new Date(Date.now() + 7 * 86_400_000), assignedToId: staff.id } });

    const tables = ['Service', 'Client', 'Referral', 'Placement', 'Property', 'Room', 'User', 'CaseNote', 'Incident', 'Task'];
    const counts = {};
    for (const table of tables) counts[table] = await count(client, table);
    console.log(`\n${name} — pre-existing installation state:`);
    for (const [table, value] of Object.entries(counts)) console.log(`  ${table.padEnd(14)} ${value}`);
    if (counts.Service !== 0) fail('The upgrade-case database must start with zero Service rows.');
    if (counts.Client < 3 || counts.Placement < 1) fail('The upgrade-case database must start with historical operational records.');
    console.log('\nNo Referral rows are possible here: Referral.serviceId is NOT NULL and references Service.');
  } finally {
    await client.$disconnect();
  }
}


/** Starts `node server.mjs` against the disposable database and waits until it answers /health.
 * `--production` is passed straight through, so the production run is the real production server
 * (`NODE_ENV=production`, prebuilt .next output) rather than a development server in disguise. */
function startServer(name, { production, port }) {
  if (!existsSync(databaseFile(name))) fail(`${databaseFile(name)} does not exist. Run "node scripts/acceptance/run.mjs ${name === POPULATED_DB ? 'db-populated' : 'db-zero'}" first.`);
  if (production && !existsSync(resolve('.next', 'BUILD_ID'))) {
    fail('Production mode needs a build. Run "node scripts/acceptance/run.mjs build --db=' + name + '" first.');
  }
  const environment = childEnvironment(name, { production, port });
  const args = ['server.mjs', ...(production ? ['--production'] : [])];
  console.log(`\n$ node ${args.join(' ')}   (NODE_ENV=${environment.NODE_ENV}, PORT=${port}, DATABASE_URL=${environment.DATABASE_URL})`);
  const child = spawn(process.execPath, args, { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  const collect = (chunk) => { const text = chunk.toString(); lines.push(text); process.stdout.write(text); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const baseUrl = `http://127.0.0.1:${port}`;
  const ready = new Promise((resolveReady, rejectReady) => {
    const deadline = Date.now() + (production ? 180_000 : 240_000);
    const poll = async () => {
      while (Date.now() < deadline) {
        if (child.exitCode !== null) return rejectReady(new Error(`server exited early with code ${child.exitCode}`));
        try {
          const response = await fetch(`${baseUrl}/health`);
          const body = await response.text();
          console.log(`\n/health -> ${response.status} ${body.slice(0, 400)}`);
          return resolveReady();
        } catch { await new Promise((wait) => setTimeout(wait, 1000)); }
      }
      rejectReady(new Error('server did not answer /health in time'));
    };
    void poll();
  });
  return { child, baseUrl, ready, output: () => lines.join('') };
}

async function withServer(name, options, body) {
  const server = startServer(name, options);
  try {
    await server.ready;
    return await body(server.baseUrl);
  } catch (error) {
    console.error(`\nServer output:\n${server.output()}`);
    throw error;
  } finally {
    server.child.kill('SIGTERM');
    await new Promise((wait) => setTimeout(wait, 1500));
    if (server.child.exitCode === null) server.child.kill('SIGKILL');
  }
}

/** Production build against the disposable database, so any statically rendered page reflects the
 * zero-service state instead of the development database. */
function buildFor(name) {
  assertOwnedDatabase(name);
  if (!existsSync(databaseFile(name))) fail(`${databaseFile(name)} does not exist. Build the database first.`);
  run(npm, ['run', 'build'], childEnvironment(name, { production: true }), 'npm run build');
}

/** Runs the acceptance specs against an already-started server, through BASE_URL exactly as the
 * production route audit does. */
async function runSuite(name, { mode, suite, port }) {
  assertOwnedDatabase(name);
  const files = SUITES[suite];
  if (!files) fail(`Unknown suite "${suite}". Expected one of: ${Object.keys(SUITES).join(', ')}.`);
  const production = mode === 'production';
  return withServer(name, { production, port }, async (baseUrl) => {
    const environment = { ...childEnvironment(name, { production, port }), BASE_URL: baseUrl, PLAYWRIGHT_BASE_URL: baseUrl };
    const args = ['playwright', 'test', '--config', 'playwright.acceptance.config.ts', ...files];
    const line = `${WINDOWS ? 'npx.cmd' : 'npx'} ${args.join(' ')}`;
    console.log(`\n$ BASE_URL=${baseUrl} ${line}`);
    const result = spawnSync(line, { stdio: 'inherit', shell: true, env: environment, cwd: process.cwd() });
    return result.status ?? 1;
  });
}

const [, , command] = process.argv;
const database = assertOwnedDatabase(readFlag('db', ZERO_DB));
const mode = readFlag('mode', 'dev');
const suite = readFlag('suite', 'zero');
const port = Number(readFlag('port', mode === 'production' ? 3101 : 3100));

const actions = {
  'db-zero': async () => { await buildZeroDatabase(ZERO_DB); },
  'db-populated': async () => { await buildPopulatedDatabase(POPULATED_DB); },
  build: async () => { buildFor(database); },
  test: async () => { process.exitCode = await runSuite(database, { mode, suite, port }) ? 1 : 0; }
};

if (!actions[command]) {
  console.error(`Usage: node scripts/acceptance/run.mjs <db-zero|db-populated|build|test> [--db=${ZERO_DB}|${POPULATED_DB}] [--mode=dev|production] [--suite=${Object.keys(SUITES).join('|')}] [--port=NNNN]`);
  process.exit(1);
}

await actions[command]();

