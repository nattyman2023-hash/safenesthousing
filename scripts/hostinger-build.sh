#!/usr/bin/env bash
# Hostinger post-deploy build script.
#
# Run this after every "Deploy from Git" pull (set it as the Node.js app's
# post-deploy/build command in hPanel). It installs dependencies, regenerates
# the Prisma client, applies any new database migrations to the persistent
# production database, and builds the Next.js production bundle.
#
# It does NOT seed data and it never creates users. Never run `npm run db:seed` in production.
# FRESH INSTALLATIONS ONLY: `npm run bootstrap:admin -- --name="Full Name"` creates the first
# organisation/administrator for a completely new SafeNest installation. DO NOT run it when upgrading
# an existing populated installation — existing organisations, administrator accounts and
# authentication records must be preserved.
# For a separate non-production PREVIEW only, run `npm run db:seed` once manually after the first
# deploy.
#
# Upgrades: step 4 migrates the EXISTING database and step 6 builds the bundle, so take and verify a
# database and private-storage backup BEFORE running this script (see docs/deployment-hostinger.md).
# Never change DATABASE_URL or PRIVATE_STORAGE_PATH as part of a deploy, and never run
# `prisma migrate reset`, `prisma db push --force-reset`, or `npm run db:seed` against production.
set -euo pipefail

# Always operate from the repository root (where this script lives, one level up).
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
npm ci

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Checking production configuration"
npm run check:production-config

echo "==> Applying database migrations"
npm run db:migrate:deploy

echo "==> Removing stale Next.js build output"
rm -rf .next

echo "==> Building Next.js production bundle"
npm run build

echo "==> Post-deploy build complete. Restart the Node app (npm run start)."
