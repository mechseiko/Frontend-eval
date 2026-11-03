import { useEffect, useRef, useState } from "react";

export function SearchBox({ search, debounceMs = 300, minChars = 2 }) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const timer = useRef(null);
  const latest = useRef({ id: 0, query: null, state: "none", controller: null });
  const searchRef = useRef(search);
  searchRef.current = search;

  function run(query) {
    const cur = latest.current;
    if (cur.controller) cur.controller.abort();
    const controller = new AbortController();
    const id = ++cur.id;
    cur.controller = controller;
    cur.query = query;
    cur.state = "loading";
    setStatus("loading");
    let p;
    try {
      p = Promise.resolve(searchRef.current(query, { signal: controller.signal }));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (list) => {
        if (id !== cur.id || controller.signal.aborted) return;
        cur.state = "done";
        setResults(Array.isArray(list) ? list : []);
        setStatus("done");
      },
      (err) => {
        if (id !== cur.id || controller.signal.aborted) return;
        if (err && err.name === "AbortError") return;
        cur.state = "error";
        setResults([]);
        setStatus("error");
      }
    );
  }

  function onChange(e) {
    const v = e.target.value;
    setValue(v);
    const q = v.trim();
    clearTimeout(timer.current);
    timer.current = null;
    const cur = latest.current;
    if (q.length < minChars) {
      if (cur.controller) cur.controller.abort();
      cur.id++;
      cur.query = null;
      cur.state = "none";
      setResults([]);
      setStatus("idle");
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      if (cur.query === q && (cur.state === "loading" || cur.state === "done")) return;
      run(q);
    }, debounceMs);
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const cur = latest.current;
      cur.id++;
      if (cur.controller) cur.controller.abort();
    },
    []
  );

  const statusText = status === "loading" ? "Searching..." : status === "done" && results.length === 0 ? "No results" : "";
  return (
    <div>
      <input type="search" aria-label="Search" value={value} onChange={onChange} />
      <div role="status">{statusText}</div>
      {status === "error" && (
        <div role="alert">
          <span>Something went wrong</span>
          <button type="button" onClick={() => run(value.trim())}>Retry</button>
        </div>
      )}
      <ul aria-label="Results">
        {results.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
