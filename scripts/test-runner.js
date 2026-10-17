import { spawnSync } from "child_process";

const args = [
  "--experimental-strip-types",
  "--import",
  `data:text/javascript,import { register } from 'node:module'; import { pathToFileURL } from 'node:url'; register(pathToFileURL('./scripts/test-loader.mjs'), import.meta.url)`,
  "--test",
  "tests/rendered-html.test.mjs",
  "tests/watched-filter.test.mjs",
  "tests/cinema.test.mjs",
  "tests/chatgpt-auth.test.mjs"
];

const result = spawnSync("node", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
