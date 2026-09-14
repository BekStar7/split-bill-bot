#!/bin/sh
set -e

# Fly mounts the volume as root:root, so the unprivileged runtime user cannot
# write the SQLite file until we hand the mountpoint over to it.
chown -R node:node /app/data

exec su-exec node "$@"
