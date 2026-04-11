#!/bin/sh

set -e

TRADOVATE_POSTGRES_HOST=$1
TRADOVATE_POSTGRES_PORT=$2
TRADOVATE_POSTGRES_DATABASE=$3
TRADOVATE_POSTGRES_USER=$4
BACKUP_PATH=$5

if [ -z "$BACKUP_PATH" ] || [ -z "$TRADOVATE_POSTGRES_HOST" ] || [ -z "$TRADOVATE_POSTGRES_PORT" ] || [ -z "$TRADOVATE_POSTGRES_DATABASE" ] || [ -z "$TRADOVATE_POSTGRES_USER" ];
then
    echo "Usage: $0 tradovate-postgres 5432 tradovate_bot tradovate /tmp/backup-20220828.dump"
    exit 1
fi

# Restore using pg_restore (clean mode drops existing objects before recreating)
PGPASSWORD="${TRADOVATE_POSTGRES_PASSWORD}" pg_restore \
    --host="$TRADOVATE_POSTGRES_HOST" \
    --port="$TRADOVATE_POSTGRES_PORT" \
    --username="$TRADOVATE_POSTGRES_USER" \
    --dbname="$TRADOVATE_POSTGRES_DATABASE" \
    --clean \
    --if-exists \
    "$BACKUP_PATH"

# Flush redis
redis-cli -h "$TRADOVATE_REDIS_HOST" -p "$TRADOVATE_REDIS_PORT" -a "$TRADOVATE_REDIS_PASSWORD" FLUSHALL

# Signal the Node process to restart gracefully.
# SIGTERM gives the process a chance to flush connections/buffers before exit.
# If it doesn't exit within 10 seconds, escalate to SIGKILL.
pkill -SIGTERM -f node || true
sleep 10
pkill -SIGKILL -f node || true
