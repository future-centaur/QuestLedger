#!/usr/bin/env bash
# Typecheck helper for the shared types + frontend.
#
# `tsconfig.json` has `include: ["src"]`, which never checks backend/.
# This runs tsc over the API entry as well.
#
# Note this is a convenience check, not a regression gate: the authoritative
# verification is the six tests/tests.json scenarios run against a deployed
# build by the platform's agent.

set -u
cd "$(dirname "$0")"

echo "=== backend API ==="
npx --yes -p typescript@5.7 tsc --noEmit --strict --skipLibCheck \
  --module esnext --moduleResolution bundler --target es2022 \
  backend/http/nodeHandler.ts backend/dev.ts
echo "backend exit=$?"

echo
echo "=== shared/types.ts + src/client.ts ==="
npx --yes -p typescript@5.7 tsc --noEmit --strict --skipLibCheck \
  --module esnext --moduleResolution bundler --target es2020 \
  --noUnusedLocals shared/types.ts src/client.ts
echo "shared+client exit=$?"

echo
echo "=== check-union.ts (App.tsx money expressions, isolated from React) ==="
npx --yes -p typescript@5.7 tsc --noEmit --strict --skipLibCheck \
  --module esnext --moduleResolution bundler --target es2020 check-union.ts
echo "union exit=$?"

echo
echo "=== src (needs react + the platform client; expect module-resolution errors) ==="
npx --yes -p typescript@5.7 tsc --noEmit --strict --skipLibCheck \
  --jsx react-jsx --module esnext --moduleResolution bundler --target es2020 \
  --noUnusedLocals --lib es2020,dom,dom.iterable src/main.tsx 2>&1 \
  | grep -v "Cannot find module 'react'\|Cannot find module 'lucide-react'\|Cannot find module 'react-dom'" \
  | head -40
echo "App.tsx exit=${PIPESTATUS[0]:-?}"