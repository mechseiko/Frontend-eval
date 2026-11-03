# Normalise Nigerian mobile numbers

Implement two named exports in `src/solution.js`.

```js
normalizeNigerianPhone(input) -> string | null   // E.164 like "+2348031234567", or null if invalid
formatNigerianPhone(input)    -> string | null   // national display like "0803 123 4567", or null if invalid
```

A valid number has the form: country code 234 plus a 10 digit national number. The 10 digit national number must match `^[789][01]\d{8}$` (this covers prefixes 70, 71, 80, 81, 90, 91).

Accepted input shapes (all of these are the same number, `+2348031234567`):
`08031234567`, `8031234567`, `2348031234567`, `+2348031234567`, `+234 803 123 4567`, `+234(0)803 123 4567`, `+2340803 123 4567`, `0803-123-4567`, `(0803) 123 4567`, `002348031234567`, and any of these with leading or trailing whitespace.

Rules
1. Non-string input returns `null`.
2. Remove whitespace, `-`, `.`, `(` and `)` first. After that the value may contain only digits, with at most one leading `+`. Anything else (letters, a second `+`, a `+` anywhere else) returns `null`.
3. Country code forms: a leading `+234`, `00234` or `234`. After the country code, **at most one** leading `0` (the trunk digit) is dropped. `+23400803...` (two zeros) is invalid.
4. A leading `+` must be followed by `234`. Numbers from other countries return `null`.
5. A leading single `0` (not `00`) means a national format: drop it.
6. Otherwise the digits are taken as the national number as-is.
7. The resulting national number must match the pattern above, otherwise return `null`.
8. `formatNigerianPhone` returns the valid number as `0` + national number grouped 4-3-4, for example `0803 123 4567`.
