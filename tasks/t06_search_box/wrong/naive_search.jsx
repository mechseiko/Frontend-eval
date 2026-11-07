// Plausible but wrong: debounce works, but no abort, no stale protection, no min length, no dedupe, errors on abort.
import { useEffect, useRef, useState } from "react";

export function SearchBox({ search, debounceMs = 300 }) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const t = useRef();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      setLoading(true);
      setError(false);
      search(value.trim(), {})
        .then((r) => { setResults(r); setLoading(false); })
        .catch(() => { setError(true); setLoading(false); });
    }, debounceMs);
    return () => clearTimeout(t.current);
  }, [value]);
  return (
    <div>
      <input type="search" aria-label="Search" value={value} onChange={(e) => setValue(e.target.value)} />
      <div role="status">{loading ? "Searching..." : results.length === 0 ? "No results" : ""}</div>
      {error && <div role="alert">Something went wrong <button onClick={() => setValue(value + "")}>Retry</button></div>}
      <ul aria-label="Results">{results.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}
