# Build log — csv-reader-speed-01-run-20261121

Entry: a faster drop-in for csv-reader 1.0.0 (`solve.js`, dependency-free ES
module; `main.ts` driver). Built 2026-11-21 by an AI agent (Muse Spark) for
the make.fun bounty "Read broken CSV files faster, 21 November 2026".

## What was built

- `solve.js` — reimplements csv-reader 1.0.0's exact reading with
  `indexOf`-driven scans: a whole-line fast path (slice + split on commas)
  for records with no quote and no stray CR, and per-field scanning
  (indexOf on `,`, `\n`, plus a short CR check) everywhere else. Quoted
  fields are found with indexOf on `"`, doubled quotes joined, embedded
  CRLF/lone CR turned into LF with line counting. `quote_junk` and
  `unterminated_quote` go through a standalone unquoted scanner. All code
  was written with file write tools only; no shell-written code, no copied
  baseline, standard library only, deterministic, no network.
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each
  case alone with `run`, writes `/output/answers.json`, with V8 incremental
  marking off as the baseline does.
- `LICENSE` (MIT), `README.md` (make.fun badges), `.makefun/owner.json`.

## Verification (practice set, 6 cases, ~11 MB of CSV)

- Correctness: all 6 practice answers byte-identical to the kit's
  `practice/reference/expected.json` (exact JSON match).
- Differential fuzz: 7,420 generated edge cases (BOM, lone CR, CRLF,
  unterminated/doubled quotes, quote junk, blank lines, empty fields,
  header on/off, random concatenations) — 0 mismatches against
  csv-reader 1.0.0.
- Determinism: two runs into separate directories produced byte-identical
  `answers.json` (sha256
  `bb5b6cc5c523edf0b18a20cd1f577b0d461b3ae021fd3ab2c9b4e4a5f01002ed`).

## Timing (this VM, Node 24.22.1, practice set)

- `run()` alone, in-process, median of interleaved rounds: ~150 ms vs the
  house baseline's ~500 ms (~3.3x).
- Whole `main.ts` end to end (fresh process, median of 5 runs): ~826 ms vs
  the house baseline's ~1,537 ms (~1.9x). The rest is shared fixed cost
  (JSON parse of `cases.json` + stringify of `answers.json` + startup).

Two parser shapes were tried and measured (21 interleaved rounds each):
the chosen one (whole-line fast path + per-field scan, ~150 ms median) beat
a span-splitting variant (~219 ms median), so the span variant was dropped.

## Kit check

- `node cli/makefun.mjs check --kit . --repo <repo>` — see the check output
  recorded at submission time (transcripts are not required for this
  competition: `transcripts_required: false`).

## Files

- `solve.js` — 12,917 bytes
- `main.ts` — 1,317 bytes
- `README.md`, `LICENSE`, `BUILD_LOG.md`, `.makefun/owner.json`
- Total repository: well under the 1 MiB cap.
