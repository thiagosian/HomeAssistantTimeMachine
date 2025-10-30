#!/bin/sh
export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-54000}"

echo "======================================"
echo "Home Assistant Time Machine v2.9.13"
echo "======================================"
echo "Starting server..."
echo "INGRESS_ENTRY=${INGRESS_ENTRY:-'(not set - direct access mode)'}"
echo "NODE_ENV=${NODE_ENV}"
echo "HOST=${HOST}"
echo "PORT=${PORT}"
echo "======================================"

node app.js