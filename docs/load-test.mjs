#!/usr/bin/env node
/**
 * Lightweight load test (no deps) for the CRM API.
 *
 *   node docs/load-test.mjs [url] [totalRequests] [concurrency]
 *   node docs/load-test.mjs http://localhost:4000/api/health 2000 50
 *
 * Reports throughput and p50/p95/p99 latency. For sustained, production-grade
 * load testing use k6 or autocannon; this is a quick smoke for a single box.
 */
const url = process.argv[2] ?? 'http://localhost:4000/api/health';
const total = Number(process.argv[3] ?? 1000);
const concurrency = Number(process.argv[4] ?? 50);

const latencies = [];
let done = 0;
let errors = 0;
let next = 0;

async function worker() {
  while (next < total) {
    next++;
    const start = performance.now();
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      if (res.status >= 500) errors++;
    } catch {
      errors++;
    }
    latencies.push(performance.now() - start);
    done++;
  }
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const t0 = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const secs = (performance.now() - t0) / 1000;

console.log(`\n  URL          ${url}`);
console.log(`  Requests     ${done}  (concurrency ${concurrency})`);
console.log(`  Duration     ${secs.toFixed(2)}s`);
console.log(`  Throughput   ${(done / secs).toFixed(0)} req/s`);
console.log(`  Errors(5xx)  ${errors}`);
console.log(`  Latency p50  ${pct(latencies, 50).toFixed(1)}ms`);
console.log(`  Latency p95  ${pct(latencies, 95).toFixed(1)}ms`);
console.log(`  Latency p99  ${pct(latencies, 99).toFixed(1)}ms\n`);
