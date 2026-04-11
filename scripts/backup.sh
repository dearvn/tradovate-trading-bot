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

# Backup using pg_dump excluding trailing_trade_logs
PGPASSWORD="${TRADOVATE_POSTGRES_PASSWORD}" pg_dump \
    --host="$TRADOVATE_POSTGRES_HOST" \
    --port="$TRADOVATE_POSTGRES_PORT" \
    --username="$TRADOVATE_POSTGRES_USER" \
    --dbname="$TRADOVATE_POSTGRES_DATABASE" \
    --format=custom \
    --exclude-table=trailing_trade_logs \
    --file="$BACKUP_PATH"
