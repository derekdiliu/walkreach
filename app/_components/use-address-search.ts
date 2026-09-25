"use client";

import { useRef, useState } from "react";
import type { Place, Suggestion } from "../_lib/walkreach";

// The address box: suggestions while typing, then a Nominatim lookup when a
// street is picked or the search is submitted. goTo places the point.
export function useAddressSearch({
  mapReady,
  goTo,
}: {
  mapReady: boolean;
  goTo: (place: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [choices, setChoices] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever the list closes, so a slow answer for what was typed
  // earlier is dropped.
  const requestRef = useRef(0);

  const closeSuggestions = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestRef.current++;
    setSuggestions([]);
    setHighlighted(-1);
  };

  // What was found for one place is no answer for another.
  const clearResults = () => {
    setChoices(null);
    setNote(null);
  };

  const reset = () => {
    setQuery("");
    clearResults();
  };

  // Suggestions come from our own names (/api/suggest), a short pause after
  // each keystroke. Nominatim is not asked until a street is picked or the
  // search submitted: its usage policy rules out a lookup per keystroke.
  const type = (value: string) => {
    setQuery(value);
    closeSuggestions();
    setNote(null);
    const q = value.trim();
    if (q.length < 2) return;

    const request = requestRef.current;
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const { suggestions } = (await res.json()) as { suggestions?: Suggestion[] };
        if (request === requestRef.current) setSuggestions(suggestions ?? []);
      } catch {
        // No suggestions is fine: the search button still works.
      }
    }, 150);
  };

  const lookUp = async (text: string) => {
    const q = text.trim();
    if (q.length < 3) return;

    setSearching(true);
    clearResults();
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const { results } = (await res.json()) as { results?: Place[] };

      if (!results || results.length === 0) {
        setNote("No match in Hamilton. Try a street name, or click the map.");
      } else if (results.length === 1) {
        goTo(results[0]);
      } else {
        // A street runs for kilometres and scores differently along it, so
        // picking the top hit silently would be picking one end of it.
        setChoices(results);
      }
    } catch {
      setNote("Address lookup is unavailable. Click the map instead.");
    }
    setSearching(false);
  };

  // A place or an amenity comes with its point, so it is gone to straight
  // away. A street does not - it runs for kilometres - so it is looked up,
  // which asks which part of it when there is more than one.
  const pick = (s: Suggestion) => {
    closeSuggestions();
    setQuery(s.label);
    if (!mapReady) return;
    if (s.point) {
      clearResults();
      goTo({ ...s.point, label: s.label });
    } else lookUp(s.label);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;
    // -1 is the text as typed; the arrows wrap through it.
    const last = suggestions.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i >= last ? -1 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i <= -1 ? last : i - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  };

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    closeSuggestions();
    if (query.trim().length < 3) {
      setNote("Type at least three letters of an address or suburb.");
      return;
    }
    lookUp(query);
  };

  const choose = (place: Place) => {
    setChoices(null);
    setQuery(place.label);
    goTo(place);
  };

  return {
    query,
    searching,
    choices,
    note,
    suggestions,
    highlighted,
    setHighlighted,
    type,
    pick,
    onKeyDown,
    submit,
    choose,
    closeSuggestions,
    clearResults,
    reset,
  };
}

export type AddressSearch = ReturnType<typeof useAddressSearch>;
