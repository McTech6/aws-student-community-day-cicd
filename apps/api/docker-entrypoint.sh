#!/bin/sh
# Container start-up: work out the database URL, migrate, then start the API.
set -eu

# Locally you pass DATABASE_URL. In AWS, ECS injects the fields of the
# RDS-generated secret one by one (DB_HOST, DB_USER, DB_PASSWORD, ...), so the
# URL is assembled here. The password is used as-is: the CDK stack generates it
# without URL-unsafe characters.
if [ -z "${DATABASE_URL:-}" ]; then
  : "${DB_HOST:?Set DATABASE_URL, or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME}"
  : "${DB_USER:?DB_USER is required when DATABASE_URL is not set}"
  : "${DB_PASSWORD:?DB_PASSWORD is required when DATABASE_URL is not set}"
  : "${DB_NAME:?DB_NAME is required when DATABASE_URL is not set}"
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?sslmode=${DB_SSLMODE:-require}"
  export DATABASE_URL
fi

# Prisma takes a database lock, so two tasks starting together is safe.
# If this fails the container exits, the health check never passes, and ECS
# rolls the deployment back.
echo "Applying database migrations..."
prisma migrate deploy --schema prisma/schema.prisma

echo "Starting Forge API..."
exec node dist/main.js
