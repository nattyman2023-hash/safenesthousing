#!/usr/bin/env bash
# Hostinger post-deploy build script.
#
# Run this after every "Deploy from Git" pull (set it as the Node.js app's
# post-deploy/build command in hPanel). It installs dependencies, regenerates
# the Prisma client, applies any new database migrations to the persistent
# production database, and builds the Next.js production bundle.
#
# It does NOT seed data. For a separate non-production PREVIEW run `npm run db:seed` once
# manually after the first deploy; for a real go-live run
# `npm run bootstrap:admin -- --name="Full Name"` instead — never seed production.
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
