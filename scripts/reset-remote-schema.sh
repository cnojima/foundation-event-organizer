#!/usr/bin/env bash
fly ssh console -C "rm -f /data/app.db /data/app.db-shm /data/app.db-wal"
fly machine restart
