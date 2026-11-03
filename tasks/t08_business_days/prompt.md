# Business-day arithmetic with observed holidays

Implement three named exports in `src/solution.js`. Dates are plain calendar dates written `"YYYY-MM-DD"`. The result must never depend on the machine's timezone or daylight saving time.

```js
isBusinessDay(date, holidays = [])            -> boolean
addBusinessDays(date, n, holidays = [])       -> "YYYY-MM-DD"
businessDaysBetween(start, end, holidays = [])-> integer
```

`holidays` is an array of official holiday dates (`"YYYY-MM-DD"`).

Rules
1. Business days are Monday to Friday that are not an **observed holiday**.
2. A holiday that falls on Monday to Friday is observed on that day.
3. A holiday that falls on a Saturday or Sunday is observed on the **next Monday**, but if that Monday is already an observed holiday, move to the next weekday after it, and keep moving forward over weekdays until a day is free. Weekday holidays in the list always keep their own day, regardless of list order. Weekend holidays are placed in ascending date order and each takes the first free weekday.
   - Example: Saturday 25 Dec and Sunday 26 Dec (2027) are observed on Monday 27 Dec and Tuesday 28 Dec.
4. `addBusinessDays(date, n, holidays)`: the start date itself is never counted.
   - `n > 0`: move forward until `n` business days have been passed. `n < 0`: move backwards the same way.
   - `n === 0`: return `date` if it is a business day, otherwise the **next** business day.
5. `businessDaysBetween(start, end, holidays)` counts the business days `d` with `start < d <= end`. If `end` is before `start` the result is the negative of `businessDaysBetween(end, start)`. Equal dates give 0.
6. Throw a `RangeError` for any date or holiday that is not a real calendar date in `YYYY-MM-DD` form (for example `"2026-02-30"`, `"2026-13-01"`, `"2026-1-5"`, a non-string), and for a non-integer `n`.
7. Return dates zero-padded as `YYYY-MM-DD`.
