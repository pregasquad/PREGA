#!/bin/bash
echo "=== Fixing git for GitHub sync ==="
echo "Step 1: Pulling remote with unrelated histories..."
git pull origin main --allow-unrelated-histories --no-edit
echo "Step 2: Pushing to GitHub..."
git push origin main
echo "=== Done! Git tab should work normally now ==="
