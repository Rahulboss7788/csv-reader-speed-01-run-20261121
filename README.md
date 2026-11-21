[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rahulboss7788/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rahulboss7788/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# Fast csv-reader drop-in

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
competition ("Read broken CSV files faster").

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly
what csv-reader 1.0.0 returns for `{text, header}`: `{columns, rows,
errors}` — the same broken-row policy (BOM dropped, CRLF/LF record ends,
blank lines skipped, stray CR dropped with `stray_cr`, quoted fields with
`""` escapes and CR/LF inside read as LF, junk after a closing quote with
`quote_junk`, unterminated quotes read again as unquoted with
`unterminated_quote`, short rows padded and long rows cut to the first
record's width with `short_row` / `long_row` errors, in the order met).

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Why it is faster

The reference reader walks the text one character at a time and builds every
field a character at a time. This reader slices whole fields out of the text
with `indexOf` (native search): an unquoted field is one slice up to the
next comma or line break, a quoted field one slice up to its closing quote,
and only the rare broken pieces — a stray CR, a doubled quote, a line break
inside quotes — take a slower path. Nothing is cached from one case to the
next, and the answer is built once, in order, with no re-scanning.

## Layout

- `solve.js` — the fast reader (`run`)
- `main.ts` — the harness driver
- `LICENSE` — MIT

## License

MIT — see [LICENSE](LICENSE).
