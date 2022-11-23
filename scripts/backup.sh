#!/bin/sh

set -e

TRADOVATE_MONGO_HOST=$1
TRADOVATE_MONGO_PORT=$2
TRADOVATE_MONGO_DATABASE=$3
BACKUP_PATH=$4

if [ -z "$BACKUP_PATH" ] || [ -z "$TRADOVATE_MONGO_HOST" ] || [ -z "$TRADOVATE_MONGO_PORT" ] || [ -z "$TRADOVATE_MONGO_DATABASE" ];
then
    echo "Usage: $0 tradovate-mongo 27017 tradovate-bot /tmp/backup-20220828.archive"
    exit 1
fi

# Backup using mongodump excluding `trailing_trade_logs`
mongodump --host="$TRADOVATE_MONGO_HOST" --port="$TRADOVATE_MONGO_PORT" --gzip --archive="$BACKUP_PATH" --db="$TRADOVATE_MONGO_DATABASE" --excludeCollection=trailing_trade_logs

