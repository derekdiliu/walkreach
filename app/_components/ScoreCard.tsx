import {
  BANDS,
  CATEGORY_LABEL,
  ROUTE_COLOR,
  amenityName,
  categoryLabel,
  scoreBand,
  walkMinutes,
  withinMinutes,
  type Reached,
  type Result,
  type Slot,
} from "../_lib/walkreach";
import { useState, type CSSProperties } from "react";
import ui from "./ui.module.css";
import styles from "./ScoreCard.module.css";

// One place's result: the score, what is within reach, and the nearest of
// each kind, each opening into everything of that kind within the walk.
export function ScoreCard({
  place,
  result,
  openCategory,
  onToggleCategory,
  selected,
  onPick,
}: {
  place: NonNullable<Slot["point"]>;
  result: Result;
  openCategory: string | null;
  onToggleCategory: (category: string) => void;
  selected: number | null;
  onPick: (amenity: Reached) => void;
}) {
  const band = scoreBand(result.total_score);
  return (
    <div>
      {/* Named, so a screenshot of the score says where it is for. */}
      <h2 className={`${styles.place} ${ui.truncate}`} title={place.label ?? undefined}>
        {place.label ?? `Pin at ${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}
      </h2>
      <div className={styles.header}>
        <div className={styles.score} style={{ "--band": band.color } as CSSProperties}>
          <div className={styles.outOf}>out of 100</div>
          <div className={styles.total}>{result.total_score}</div>
        </div>
        <div className={styles.band}>
          <div className={styles.bandLabel}>{band.label}</div>
          <div className={styles.blurb}>{band.blurb}</div>
        </div>
      </div>

      <ReachCounts amenities={result.amenities} />

      <div className={`${ui.eyebrow} ${styles.nearestHeading}`}>Nearest of each</div>

      {result.breakdown.map((b) => {
        const reached = result.amenities.filter((a) => a.category === b.category);
        const open = openCategory === b.category;
        return (
          <div key={b.category} className={styles.category}>
            <button
              onClick={() => onToggleCategory(b.category)}
              disabled={reached.length === 0}
              aria-expanded={reached.length > 0 ? open : undefined}
              className={styles.row}
            >
              <div className={styles.rowText}>
                <div className={styles.categoryName}>
                  {categoryLabel(b.category)}
                  {reached.length > 0 && (
                    <span className={styles.count}>
                      {" "}
                      {open ? "▾" : "▸"} {reached.length} within 15 min
                    </span>
                  )}
                </div>
                {b.nearest_m === null ? (
                  <div className={styles.detail}>None within a 15 minute walk</div>
                ) : (
                  // The distance is the measurement and the name is context,
                  // so a long name truncates rather than pushing the metres
                  // onto a line of their own.
                  <div className={`${styles.detail} ${styles.nearest}`}>
                    <span className={ui.truncate}>
                      {amenityName({ name: b.nearest_name, category: b.category })}
                    </span>
                    <span className={styles.metres}>· {b.nearest_m} m walk</span>
                  </div>
                )}
              </div>
              <div className={`${styles.points} ${b.nearest_m === null ? styles.none : ""}`}>
                {b.weighted_score}
                <span className={styles.max}>
                  {" "}
                  / {b.max_score}
                </span>
              </div>
            </button>

            {open && (
              <ReachList
                category={b.category}
                amenities={reached}
                selected={selected}
                onPick={onPick}
              />
            )}
          </div>
        );
      })}

      <p className={styles.footnote}>
        Each category scores by how close its nearest one is on foot, up
        to its own maximum. Distances follow the street network. Open a
        category to see everything of that kind within reach, and pick
        one to see the walk there.
      </p>
    </div>
  );
}

// How many of each kind are within 5, 10 and 15 minutes. Cumulative, like the
// bands: whatever is within 5 minutes is within 10 as well.
function ReachCounts({ amenities }: { amenities: Reached[] }) {
  const minutes = BANDS.map((b) => b.minutes);
  return (
    <table aria-label="Amenities within 5, 10 and 15 minutes" className={styles.counts}>
      <thead>
        <tr className={ui.eyebrow}>
          <th className={styles.countsCorner}>Within reach</th>
          {BANDS.map((b) => (
            <th key={b.minutes} className={`${styles.number} ${styles.countsHead}`}>
              {/* The band's colour on the map, so the column reads against it. */}
              <span
                className={styles.bandSwatch}
                style={{ background: b.color, opacity: b.opacity }}
              />
              {b.minutes} min
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.keys(CATEGORY_LABEL).map((category) => {
          const ofKind = amenities.filter((a) => a.category === category);
          return (
            <tr key={category} className={styles.countsRow}>
              <td className={styles.countsName}>{CATEGORY_LABEL[category]}</td>
              {minutes.map((m) => {
                const n = ofKind.filter((a) => withinMinutes(a.walk_m, m)).length;
                return (
                  <td key={m} className={`${styles.number} ${n === 0 ? styles.zero : ""}`}>
                    {n}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const LIST_LENGTH = 5;

function ReachList({
  category,
  amenities,
  selected,
  onPick,
}: {
  category: string;
  amenities: Reached[];
  selected: number | null;
  onPick: (a: Reached) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // A city-centre walk reaches dozens of bus stops; the nearest few are what
  // most people want. Keep the picked one in view even when it is further.
  const shown = showAll
    ? amenities
    : amenities.filter((a, i) => i < LIST_LENGTH || a.id === selected);
  return (
    <ul aria-label={`${categoryLabel(category)} within 15 minutes`} className={styles.list}>
      {shown.map((a) => {
        const on = selected === a.id;
        return (
          <li key={a.id}>
            <button
              onClick={() => onPick(a)}
              aria-pressed={on}
              className={styles.amenity}
              style={on ? { borderLeftColor: ROUTE_COLOR } : undefined}
            >
              <span className={`${ui.truncate} ${styles.amenityName}`}>{amenityName(a)}</span>
              <span className={styles.walk}>
                {a.walk_m} m · {walkMinutes(a.walk_m)} min
              </span>
            </button>
          </li>
        );
      })}
      {shown.length < amenities.length && (
        <li>
          <button onClick={() => setShowAll(true)} className={`${ui.link} ${styles.showAll}`}>
            Show all {amenities.length}
          </button>
        </li>
      )}
      {selected !== null && amenities.some((a) => a.id === selected) && (
        <li className={styles.routeNote}>
          The walk is drawn on the map. Its dashed ends, onto the network and
          off it to the amenity, are not counted in the distance.
        </li>
      )}
    </ul>
  );
}
