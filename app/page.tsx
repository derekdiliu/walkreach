"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CITY_CENTRE,
  EMPTY_GEOJSON,
  EMPTY_SLOT,
  formatPoint,
  isOffNetwork,
  parsePoint,
  type LngLat,
  type Place,
  type Result,
  type Slot,
  type SlotKey,
} from "./_lib/walkreach";
import { useWalkMap } from "./_components/use-walk-map";
import { useWalkRoute } from "./_components/use-walk-route";
import { useAddressSearch } from "./_components/use-address-search";
import { WelcomeCard } from "./_components/WelcomeCard";
import { ModeSwitch } from "./_components/ModeSwitch";
import { SlotPicker } from "./_components/SlotPicker";
import { SearchBox } from "./_components/SearchBox";
import { Intro } from "./_components/Intro";
import { ScoreCard } from "./_components/ScoreCard";
import { ComparePanel } from "./_components/ComparePanel";
import { Legend } from "./_components/Legend";
import ui from "./_components/ui.module.css";
import styles from "./page.module.css";

export default function Home() {
  const [slots, setSlots] = useState<Record<SlotKey, Slot>>({
    a: EMPTY_SLOT,
    b: EMPTY_SLOT,
  });
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<SlotKey>("a");
  const [showWelcome, setShowWelcome] = useState(true);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Bumped each time a slot is re-placed or cleared, so a response for a point
  // that is no longer there is dropped rather than drawn over its replacement.
  const requestRef = useRef<Record<SlotKey, number>>({ a: 0, b: 0 });

  const map = useWalkMap({ compare, onClick: (p) => setPoint(p, null) });
  const route = useWalkRoute(map);
  const search = useAddressSearch({ mapReady: map.ready, goTo: (place) => goTo(place) });

  const { result, loading } = slots.a;
  const offNetwork = !!result && isOffNetwork(result);
  // A point with no result once loading is over: the request itself failed.
  const failed = !!slots.a.point && !loading && !result;

  const updateSlot = (key: SlotKey, patch: Partial<Slot>) =>
    setSlots((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const analyse = async (key: SlotKey, p: LngLat, label: string | null, coloured: boolean) => {
    setShowWelcome(false);
    map.putMarker(key, p, coloured);
    const request = ++requestRef.current[key];

    updateSlot(key, { point: { ...p, label }, result: null, loading: true });
    map.setData(`isochrone-${key}`, EMPTY_GEOJSON);
    // The route is from A; a new A leaves it starting somewhere else.
    if (key === "a") route.clear();

    let data: Result | null;
    try {
      const res = await fetch(`/api/livability?lng=${p.lng}&lat=${p.lat}`);
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }

    if (request !== requestRef.current[key]) return;
    updateSlot(key, { result: data, loading: false });
    if (data) map.setData(`isochrone-${key}`, data.isochrone);
    // Coloured pins mean two places, which fitBoth has already framed.
    if (data && !coloured) map.showWalk(data.isochrone);
  };

  // A shared link opens on what was shared, not on the welcome card. Read
  // once the map is up: nothing can place a point before then, so the effect
  // mirroring points into the address bar has not rewritten it yet.
  useEffect(() => {
    if (!map.ready) return;
    const params = new URLSearchParams(window.location.search);
    const sharedA = parsePoint(params.get("a"));
    const sharedB = parsePoint(params.get("b"));
    if (sharedA && sharedB) {
      setCompare(true);
      setActive("b");
      analyse("a", sharedA, null, true);
      analyse("b", sharedB, null, true);
      map.fitBoth(sharedA, sharedB);
    } else if (sharedA) {
      analyse("a", sharedA, null, false);
      map.jumpTo(sharedA, 15);
    }
    // Only on the map becoming ready; analyse and map change every render.
  }, [map.ready]);

  // Mirror the placed points into the address bar, so copying the URL shares
  // exactly what is on screen.
  useEffect(() => {
    const a = slots.a.point;
    const b = slots.b.point;
    if (!a) return;
    const qs = `?a=${formatPoint(a)}` + (b ? `&b=${formatPoint(b)}` : "");
    window.history.replaceState(null, "", qs);
  }, [slots.a.point, slots.b.point]);

  const setPoint = (p: LngLat, label: string | null) => {
    analyse(active, p, label, compare);
    // B is almost always what comes after A, so move on to it.
    if (compare && active === "a" && !slots.b.point) setActive("b");
  };

  const setMode = (on: boolean) => {
    if (on === compare) return;
    const a = slots.a.point;
    if (a) map.putMarker("a", a, on);
    route.clear();
    if (!on) {
      requestRef.current.b++;
      map.removeMarker("b");
      map.setData("isochrone-b", EMPTY_GEOJSON);
      updateSlot("b", EMPTY_SLOT);
    }
    setCompare(on);
    setActive(on && a ? "b" : "a");
    search.clearResults();
  };

  const goTo = (place: Place) => {
    const other = slots[active === "a" ? "b" : "a"].point;
    if (compare && other) map.fitBoth(place, other);
    else map.flyTo(place, 15);
    setPoint(place, place.label);
  };

  // A link opens on the point it carries, and so does a refresh, so clearing
  // the page has to be something you can ask for.
  const startOver = () => {
    for (const key of ["a", "b"] as const) {
      requestRef.current[key]++;
      map.removeMarker(key);
      map.setData(`isochrone-${key}`, EMPTY_GEOJSON);
    }
    route.clear();
    setOpenCategory(null);
    setSlots({ a: EMPTY_SLOT, b: EMPTY_SLOT });
    setCompare(false);
    setActive("a");
    search.reset();
    setShowWelcome(true);
    map.flyTo(CITY_CENTRE, 13);
    // The effect mirroring the points into the address bar stops at an empty
    // A, so the query string is cleared here.
    window.history.replaceState(null, "", window.location.pathname);
  };

  // Everything that places a point waits for the map: before it exists there
  // is no Marker to put down and no source to draw the walk into. On a slow
  // connection MapLibre arrives well after the buttons do, and a click in
  // between threw instead of scoring, so those buttons stay disabled until
  // map.ready.
  // The address bar already carries the points, so the link is the page's own.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
  };

  const retry = () => {
    const p = slots.a.point;
    if (p) analyse("a", p, p.label, false);
  };

  const tryCityCentre = () => {
    map.flyTo(CITY_CENTRE, 14);
    setPoint(CITY_CENTRE, null);
  };

  return (
    <div className="layout">
      <div className="map-pane">
        <div ref={map.containerRef} />
        {showWelcome && (
          <WelcomeCard
            mapReady={map.ready}
            onExample={tryCityCentre}
            onDismiss={() => setShowWelcome(false)}
          />
        )}
      </div>
      <aside className="panel">
        {/* Comparing only means something once there is a first place. */}
        {compare && <ModeSwitch compare={compare} onChange={setMode} />}

        {compare && <SlotPicker slots={slots} active={active} onSelect={setActive} />}

        <SearchBox
          search={search}
          mapReady={map.ready}
          placeholder={
            compare
              ? `Search for place ${active.toUpperCase()}`
              : "Enter a Hamilton address or suburb"
          }
        />

        {(slots.a.point || slots.b.point) && (
          <div className={styles.actions}>
            {!compare && (
              <button
                onClick={() => setMode(true)}
                aria-label="Compare with another place"
                className={ui.secondary}
              >
                Compare
              </button>
            )}
            <button onClick={copyLink} className={ui.secondary}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button onClick={startOver} className={ui.secondary}>
              Start over
            </button>
          </div>
        )}

        <div className={styles.spacer} />

        {!compare && !slots.a.point && (
          <Intro mapReady={map.ready} onTry={tryCityCentre} />
        )}

        <div aria-live="polite">
          {!compare && loading && <p className={styles.status}>Calculating…</p>}

          {!compare && failed && (
            <p className={styles.failed}>
              We couldn’t calculate this location.{" "}
              <button onClick={retry} className={`${ui.link} ${styles.retry}`}>
                Try again
              </button>
            </p>
          )}

          {!compare && offNetwork && (
            <p className={styles.offNetwork}>
              This location is outside the Hamilton walking network, so no
              catchment could be computed. Try a point inside the city.
            </p>
          )}
        </div>

        {!compare && result && !offNetwork && (
          <ScoreCard
            place={slots.a.point!}
            result={result}
            openCategory={openCategory}
            onToggleCategory={(c) => setOpenCategory(openCategory === c ? null : c)}
            selected={route.selected}
            onPick={(amenity) => slots.a.point && route.toggle(slots.a.point, amenity)}
          />
        )}

        {compare && <ComparePanel a={slots.a} b={slots.b} />}

        {/* Only once there is something on the map for it to explain. */}
        {(compare ? slots.a.result || slots.b.result : result && !offNetwork) && (
          <Legend compare={compare} />
        )}
      </aside>
    </div>
  );
}
