#!/bin/bash
git rm -r --cached attached_assets/
git add .gitignore
git commit -m "Remove large attached_assets files from tracking"
git push origin main
