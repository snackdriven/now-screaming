import assert from 'node:assert/strict';
import { stageCounts } from '../app/releases.ts';
import type { Movie } from '../app/releases.ts';

function oldStageCounts(pool: Movie[]) {
  return {
    all: pool.length,
    theaters: pool.filter((movie) => movie.stage === "theaters").length,
    streaming: pool.filter((movie) => movie.stage === "streaming").length,
    released: pool.filter((movie) => movie.stage === "released").length,
    soon: pool.filter((movie) => movie.stage === "soon").length,
  };
}

// Generate data
const stages = ["theaters", "streaming", "released", "soon"] as const;
const pool: Movie[] = [];
for (let i = 0; i < 100000; i++) {
  pool.push({
    title: "Movie " + i,
    date: "2024-01-01",
    month: "January",
    year: "2024",
    genre: "Action",
    stage: stages[i % 4],
    availability: "Out",
    note: "",
    color: "",
  });
}

// Warmup
for (let i = 0; i < 100; i++) {
  oldStageCounts(pool);
  stageCounts(pool);
}

assert.deepEqual(stageCounts(pool), oldStageCounts(pool));

// Benchmark Old
const startOld = performance.now();
for (let i = 0; i < 100; i++) {
  oldStageCounts(pool);
}
const timeOld = performance.now() - startOld;

// Benchmark New
const startNew = performance.now();
for (let i = 0; i < 100; i++) {
  stageCounts(pool);
}
const timeNew = performance.now() - startNew;

console.log(`Old: ${timeOld.toFixed(2)}ms`);
console.log(`New: ${timeNew.toFixed(2)}ms`);
console.log(`Improvement: ${((timeOld - timeNew) / timeOld * 100).toFixed(2)}%`);
