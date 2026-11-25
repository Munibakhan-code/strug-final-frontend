#!/usr/bin/env bash
# Safe CI / deploy install: skip lifecycle scripts (ChainDrop/Shai-Hulud preinstall),
# then rebuild esbuild so Vite has its platform binary.
set -euo pipefail

npm ci --ignore-scripts --no-audit --no-fund
npm rebuild esbuild
