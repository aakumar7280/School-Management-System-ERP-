#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
fi

npm install

docker compose up -d postgres

npm run db:migrate
npm run db:generate
npm run db:seed

echo "Bootstrap complete."
echo "Start API: npm run dev:api"
echo "Start Web: npm run dev:web"
