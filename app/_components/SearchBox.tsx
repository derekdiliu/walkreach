import { useRef } from "react";
import { suggestionKind } from "../_lib/walkreach";
import type { AddressSearch } from "./use-address-search";
import ui from "./ui.module.css";
import styles from "./SearchBox.module.css";

export function SearchBox({
  search,
  placeholder,
  mapReady,
}: {
  search: AddressSearch;
  placeholder: string;
  mapReady: boolean;
}) {
  const { query, suggestions, highlighted } = search;
  // Not held back for a short query: a button that looks switched off reads as
  // broken. Submitting too little says what is missing instead.
  const canSubmit = mapReady && !search.searching;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <form
        onSubmit={(e) => {
          search.submit(e);
          if (query.trim().length < 3) inputRef.current?.focus();
        }}
        className={styles.form}
      >
        <input
          ref={inputRef}
          id="address"
          value={query}
          onChange={(e) => search.type(e.target.value)}
          onKeyDown={search.onKeyDown}
          onBlur={search.closeSuggestions}
          // The browser's own history of past entries would open over the
          // suggestions.
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls="address-suggestions"
          aria-activedescendant={
            highlighted >= 0 ? `address-suggestion-${highlighted}` : undefined
          }
          placeholder={placeholder}
          aria-label="Search for an address in Hamilton"
          className={styles.input}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`${ui.primary} ${styles.submit}`}
        >
          {search.searching ? "…" : "Search"}
        </button>

        {suggestions.length > 0 && (
          <ul
            id="address-suggestions"
            role="listbox"
            aria-label="Suggestions"
            className={styles.suggestions}
          >
            {suggestions.map((s, i) => (
              <li
                key={`${s.kind}|${s.label}|${s.context}`}
                id={`address-suggestion-${i}`}
                role="option"
                aria-selected={i === highlighted}
                // mousedown, not click: click comes after the input's blur,
                // which has closed the list by then.
                onMouseDown={(e) => {
                  e.preventDefault();
                  search.pick(s);
                }}
                onMouseEnter={() => search.setHighlighted(i)}
                className={styles.suggestion}
              >
                <span className={`${ui.truncate} ${styles.label}`}>{s.label}</span>
                <span className={styles.kind}>{suggestionKind(s)}</span>
              </li>
            ))}
          </ul>
        )}
      </form>

      {search.note && <p className={styles.note}>{search.note}</p>}

      {search.choices && (
        <div className={styles.choices}>
          <div className={styles.which}>Which one?</div>
          {search.choices.map((c) => (
            <button
              key={c.label}
              onClick={() => search.choose(c)}
              className={styles.choice}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
