#!/bin/sh
set -e

COMMAND="${1:-scheduled}"

case "$COMMAND" in
  init-db)
    echo "Initializing database..."
    pnpm db:generate
    pnpm db:push
    ;;

  scheduled)
    echo "Generating Prisma client..."
    pnpm db:generate

    echo "Starting scheduled tweet cron..."
    pnpm exec ts-node src/lib/scheduler.ts
    ;;

  run-once)
    echo "Generating Prisma client..."
    pnpm db:generate

    echo "Running daily tweet job once..."
    pnpm exec ts-node src/lib/scheduler.ts daily
    ;;

  *)
    echo "Unknown command: $COMMAND"
    echo ""
    echo "Available commands:"
    echo "  init-db    - generate Prisma client and push schema"
    echo "  scheduled  - start scheduled cron service"
    echo "  run-once   - run daily tweet once"
    exit 1
    ;;
esac