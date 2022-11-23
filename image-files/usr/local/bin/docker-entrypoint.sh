#!/bin/sh

set -e

# Execute migration
npm run migrate:up

exec "$@"
