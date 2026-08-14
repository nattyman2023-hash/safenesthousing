#!/usr/bin/env bash
# Hostinger post-deploy build script.
#
# Run this after every "Deploy from Git" pull (set it as the Node.js app's
# post-deploy/build command in hPanel). It installs dependencies, regenerates
# the Prisma client, builds the Next.js production bundle, and applies any new
# database migrations to the persistent production database.
#
# It does NOT seed data. For a public PREVIEW run `npm run db:seed` once
# manually after the first deploy; for a real go-live run
# `npm run bootstrap:admin -- --name="Full Name"` instead — never seed production.
set -euo pipefail

# Always operate from the repository root (where this script lives, one level up).
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
npm ci

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Building Next.js production bundle"
npm run build

echo "==> Applying database migrations"
npm run db:migrate:deploy

echo "==> Post-deploy build complete. Restart the Node app (npm run start)."
