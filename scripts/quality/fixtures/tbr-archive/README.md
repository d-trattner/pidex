# Synthetic stored TBR archive

Static test input for `scripts/quality/tbr.tdd.test.mjs`, resolved from the test's
module URL rather than the current working directory or ignored root `/wiki/`.
All narratives, titles and provenance fields here are synthetic. No developer
wiki contents are copied. These files are not evidence of actual project history.

The seven IDs are compatibility keys already present in the test contract:

| Key suffix | Stored status |
|---|---|
| 18e85fb4a129 | open |
| 1fff0cbba029 | superseded |
| 33ff593e189e | resolved |
| 42bb07ce181e | resolved |
| 6bda935cbb2b | resolved |
| d131e8cdcc17 | resolved |
| adde5f88e282 | resolved |

Keep these fixture files static and LF-only. Tests compare the stored index and
each stored item with canonical renderer bytes; they must not generate expected
bytes using that renderer at test runtime. `.gitattributes` pins LF for this
archive even when `core.autocrlf=true`.

The six-item manifest/status check, additional resolved record, multiline
resolution/history notes, parser/render round trips, terminal-writer immutability,
terminal-promotion denial and exact state-field checks remain in the existing
suite. Mutation cases copy this fixture into private temporary directories.
Missing/malformed fixture data must fail; never fall back to the local wiki.

This fixture tests the stored-record contract, not the completeness or status of
any user's live archive. A separate live-archive validation, if desired, must be
explicitly directed at that archive rather than required by the ordinary suite.
