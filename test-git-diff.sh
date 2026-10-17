cat << 'DIFF' | patch -p1
--- a/package.json
+++ b/package.json
@@ -11,11 +11,7 @@
     "build:pages": "vite build --config vite.pages.config.ts",
     "test:pages": "npm run build:pages && node --test tests/pages-404.test.mjs",
     "start": "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext start",
-<<<<<<< HEAD
-    "test": "npm run build && node --test tests/rendered-html.test.mjs tests/watched-filter.test.mjs tests/cinema.test.mjs tests/route.test.mjs",
-=======
-    "test": "npm run build && node --test tests/rendered-html.test.mjs tests/watched-filter.test.mjs tests/cinema.test.mjs tests/releases.test.mjs",
->>>>>>> origin/main
+    "test": "npm run build && node --test tests/rendered-html.test.mjs tests/watched-filter.test.mjs tests/cinema.test.mjs tests/releases.test.mjs tests/route.test.mjs",
     "validate:artifact": "bash scripts/validate-artifact.sh",
     "lint": "bash scripts/sites-env.sh -- eslint . --ignore-pattern dist --ignore-pattern .next",
     "db:generate": "bash scripts/sites-env.sh -- drizzle-kit generate"
DIFF
