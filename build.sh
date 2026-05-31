#!/bin/bash
set -e

echo "Installing pnpm..."
npm install -g pnpm

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building PREGA SQUAD Manager..."
cd artifacts/pregasquad-manager
PORT=${PORT:-8000} BASE_PATH=/ pnpm run build

echo "Build complete!"
ls -la dist/public/
