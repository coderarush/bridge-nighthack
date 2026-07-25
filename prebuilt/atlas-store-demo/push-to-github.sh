#!/usr/bin/env bash
# Usage: GH_OWNER=your-username ./push-to-github.sh
# Create an EMPTY repo named atlas-store-demo on github.com first (no README).
set -e
: "${GH_OWNER:?Set GH_OWNER=your-github-username}"
git init
git add .
git commit -m "atlas-store-demo base (pre-migration)"
git branch -M demo-base
git remote add origin "https://github.com/${GH_OWNER}/atlas-store-demo.git"
git push -u origin demo-base
echo "Done. Now set demo-base as the default branch in GitHub repo settings."
