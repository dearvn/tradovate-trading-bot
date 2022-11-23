#!/bin/sh

set -e

TRADOVATE_MONGO_HOST=$1
TRADOVATE_MONGO_PORT=$2
BACKUP_PATH=$3

if [ -z "$BACKUP_PATH" ] || [ -z "$TRADOVATE_MONGO_HOST" ] || [ -z "$TRADOVATE_MONGO_PORT" ] ;
then
    echo "Usage: $0 tradovate-mongo 27017 /tmp/backup-20220828.archive"
    exit 1
fi

# Restore using mongorestore excluding `trailing_trade_logs`
mongorestore --host="$TRADOVATE_MONGO_HOST" --port="$TRADOVATE_MONGO_PORT" --gzip --archive="$BACKUP_PATH" --drop

# Flush redis
redis-cli -h "$TRADOVATE_REDIS_HOST" -p "$TRADOVATE_REDIS_PORT" -a "$TRADOVATE_REDIS_PASSWORD" FLUSHALL

# Kill the node process to restart
pkill -f node
