#!/usr/bin/env bash
set -euo pipefail

# Release script for mcp-server-cantrip
# Usage: ./scripts/release.sh [patch|minor|major]  (default: patch)

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Ensure working tree is clean
if [[ -n "$(git status --porcelain -- src/ package.json tsconfig.json)" ]]; then
  echo "Error: uncommitted changes in src/, package.json, or tsconfig.json. Commit first."
  exit 1
fi

# Bump version in package.json + create git tag
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
echo "Bumped to $NEW_VERSION"

# Build
npm run build
echo "Build succeeded."

# Commit and tag
git add package.json package-lock.json
git commit -m "release: $NEW_VERSION"
git tag "$NEW_VERSION"

echo ""
echo "Done. To publish:"
echo "  git push && git push --tags"
echo "  npm publish"
