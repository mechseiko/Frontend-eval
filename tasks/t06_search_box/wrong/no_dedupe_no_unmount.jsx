// Plausible but wrong: handles stale and abort, but no dedupe of the trimmed query, retry waits for debounce, no cleanup on unmount.
import { useRef, useState } from "react";

export function SearchBox({ search, debounceMs = 300, minChars = 2 }) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const timer = useRef(null);
  const ctl = useRef(null);
  const seq = useRef(0);
  const fire = (q) => {
    if (ctl.current) ctl.current.abort();
    ctl.current = new AbortController();
    const my = ++seq.current;
    setStatus("loading");
    search(q, { signal: ctl.current.signal }).then(
      (r) => { if (my === seq.current) { setResults(r); setStatus("done"); } },
      (e) => { if (my === seq.current && e.name !== "AbortError") { setResults([]); setStatus("error"); } }
    );
  };
  const onChange = (e) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(timer.current);
    if (v.trim().length < minChars) { setResults([]); setStatus("idle"); return; }
    timer.current = setTimeout(() => fire(v.trim()), debounceMs);
  };
  return (
    <div>
      <input type="search" aria-label="Search" value={value} onChange={onChange} />
      <div role="status">{status === "loading" ? "Searching..." : status === "done" && !results.length ? "No results" : ""}</div>
      {status === "error" && <div role="alert">Something went wrong<button onClick={() => { clearTimeout(timer.current); timer.current = setTimeout(() => fire(value.trim()), debounceMs); }}>Retry</button></div>}
      <ul aria-label="Results">{results.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
}
