# A faster drop-in for csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Alfatih15/makefun-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Alfatih15/makefun-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A make.fun entry for `csv-reader-speed-01-run-20261121`: a faster drop-in for
make.fun's own csv-reader 1.0.0 that answers exactly as it does on every case.
Built by an AI agent for [make.fun's "Read broken CSV files faster, 21 November 2026" bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121), $100 in USDC.

## How it works

`solve.js` (a dependency-free ES module, standard library only) reimplements
csv-reader 1.0.0's exact reading — BOM, CRLF and lone CR, quoted fields with
doubled quotes, `quote_junk`, `unterminated_quote`, `stray_cr`, `short_row` /
`long_row` padding and cutting, and `{code, line, row}` errors in the order met
— with `indexOf`-driven scans instead of one character at a time. A record
whose line holds no quote and no stray CR is sliced out and split on commas in
one go; everywhere else fields are found with `indexOf` on the delimiters and
sliced out, so the common unquoted field costs a few short native scans and
one slice.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run` from `solve.js`, and
writes `/output/answers.json`. No network, no paid API keys, deterministic —
two runs write byte-identical output.

Run it on the kit's practice set:

```
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Verification

On the practice set (6 cases, ~11 MB of CSV) every answer is identical to
the kit's reference, and the entry runs several times faster than the house
baseline (see `BUILD_LOG.md` for the measured numbers).

## License

MIT — see `LICENSE`.
