#!/bin/bash
echo "=== Fixing git for GitHub sync ==="
echo "Step 1: Removing large files from tracking..."
git rm -r --cached attached_assets/ 2>/dev/null
git add .gitignore
git commit -m "Remove large attached_assets files from tracking" 2>/dev/null || true

echo "Step 2: Force pushing to GitHub (overwrites remote)..."
git push origin main --force

echo "=== Done! Git tab should work normally now ==="
