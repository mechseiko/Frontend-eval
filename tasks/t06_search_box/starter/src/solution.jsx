import { useState } from "react";

export function SearchBox({ search, debounceMs = 300, minChars = 2 }) {
  const [value, setValue] = useState("");
  // TODO: implement the behaviour described in the task
  return (
    <div>
      <input type="search" aria-label="Search" value={value} onChange={(e) => setValue(e.target.value)} />
      <div role="status"></div>
      <ul aria-label="Results"></ul>
    </div>
  );
}
