# Search box with debounce, abort and stale-response protection

Implement the React component `SearchBox` in `src/solution.jsx` (named export, function component, React 18, hooks allowed, no other libraries).

```jsx
<SearchBox search={search} debounceMs={300} minChars={2} />
```

`search(query, { signal })` returns a Promise of an array of strings. `signal` is an `AbortSignal`.

Markup (the tests query these exactly)
- `<input type="search" aria-label="Search">` (role `searchbox`), a controlled input that always shows exactly what the user typed.
- `<div role="status">`, always rendered. Its text is `Searching...` while a request is in flight, `No results` after the latest request finished with an empty array, otherwise empty.
- `<ul aria-label="Results">`, always rendered, one `<li>` per result string.
- On a failed request (a rejection that is not an AbortError): render `<div role="alert">` containing the text `Something went wrong` and a `<button>` labelled `Retry`.

Behaviour
1. The query is the input value **trimmed**. If its length is less than `minChars`: cancel any pending debounce timer, abort the in-flight request, clear the results, clear any error, and show an empty status. No request is made. This happens immediately, with no debounce.
2. Otherwise start a request only after `debounceMs` ms with no further typing (each keystroke restarts the timer). Call `search(trimmedQuery, { signal })` with a fresh `AbortController` signal per request.
3. When a new request starts, abort the previous request's signal.
4. **Stale responses**: only the latest request may update the UI. A response or failure from an earlier or aborted request must be ignored completely. An `AbortError` rejection never shows the error UI.
5. While a request is in flight the previous results stay visible (no flicker) and the status reads `Searching...`.
6. **No duplicate requests**: when the debounce timer fires, if the trimmed query equals the query of the latest request and that request is in flight or finished successfully, do nothing. (After a failed request the same query may be requested again.)
7. On failure of the latest request: clear the results and show the error UI. Clicking `Retry` immediately re-runs the current trimmed query (no debounce), clears the error and shows `Searching...`.
8. On unmount: clear any pending timer and abort the in-flight request.
