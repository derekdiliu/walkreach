import {
  SLOT_COLOR,
  categoryLabel,
  isOffNetwork,
  scoreBand,
  type Breakdown,
  type Result,
  type Slot,
  type SlotKey,
} from "../_lib/walkreach";
import { SlotBadge } from "./SlotBadge";
import ui from "./ui.module.css";
import styles from "./ComparePanel.module.css";

const usable = (slot: Slot) =>
  slot.result && !isOffNetwork(slot.result) ? slot.result : null;

// Two places side by side: both scores, the gap, and the nearest of each.
export function ComparePanel({ a, b }: { a: Slot; b: Slot }) {
  const results = { a: usable(a), b: usable(b) };
  const categories = (results.a ?? results.b)?.breakdown.map((r) => r.category);

  const gap =
    results.a && results.b
      ? Math.round((results.a.total_score - results.b.total_score) * 10) / 10
      : null;

  return (
    <div>
      <div className={styles.summaries}>
        <PlaceSummary slotKey="a" slot={a} result={results.a} />
        <PlaceSummary slotKey="b" slot={b} result={results.b} />
      </div>

      {gap !== null && (
        <p className={styles.gap}>
          {gap === 0
            ? "Both places score the same."
            : `Place ${gap > 0 ? "A" : "B"} scores ${Math.abs(gap)} higher.`}
        </p>
      )}

      {categories && (
        <>
          <div className={`${styles.grid} ${styles.head}`}>
            <div className={ui.eyebrow}>Nearest of each</div>
            <SlotBadge slotKey="a" />
            <SlotBadge slotKey="b" />
          </div>

          {categories.map((category) => {
            const rowA = results.a?.breakdown.find((r) => r.category === category);
            const rowB = results.b?.breakdown.find((r) => r.category === category);
            return (
              <div key={category} className={`${styles.grid} ${styles.row}`}>
                <div className={styles.category}>{categoryLabel(category)}</div>
                <DistanceCell row={rowA} other={rowB} />
                <DistanceCell row={rowB} other={rowA} />
              </div>
            );
          })}

          <p className={styles.footnote}>
            Walking distance along the street network. Bold marks whichever of
            the two is closer.
          </p>
        </>
      )}
    </div>
  );
}

function PlaceSummary({
  slotKey,
  slot,
  result,
}: {
  slotKey: SlotKey;
  slot: Slot;
  result: Result | null;
}) {
  return (
    <div className={styles.summary} style={{ borderTopColor: SLOT_COLOR[slotKey] }}>
      <div className={styles.place}>
        <SlotBadge slotKey={slotKey} />
        Place {slotKey.toUpperCase()}
      </div>
      {!slot.point ? (
        <div className={styles.unset}>Not set yet</div>
      ) : slot.loading ? (
        <div className={styles.loading}>Calculating…</div>
      ) : !slot.result ? (
        <div className={styles.error}>Could not score this point.</div>
      ) : !result ? (
        <div className={styles.error}>Outside the walking network.</div>
      ) : (
        <>
          <div className={styles.total}>
            {result.total_score}
            <span className={styles.outOf}>
              {" "}
              / 100
            </span>
          </div>
          <div className={styles.band}>{scoreBand(result.total_score).label}</div>
        </>
      )}
    </div>
  );
}

// Bold marks the closer of the two, so it is only drawn when both places
// have an answer for that category to be closer than.
function DistanceCell({ row, other }: { row?: Breakdown; other?: Breakdown }) {
  if (!row) return <div className={styles.missing}>—</div>;
  const closer =
    !!other &&
    row.nearest_m !== null &&
    (other.nearest_m === null || row.nearest_m < other.nearest_m);
  return (
    <div className={styles.cell} title={row.nearest_name ?? undefined}>
      <div
        className={`${styles.metres} ${closer ? styles.closer : ""} ${
          row.nearest_m === null ? styles.none : ""
        }`}
      >
        {row.nearest_m === null ? "None" : `${row.nearest_m} m`}
      </div>
      <div className={`${ui.truncate} ${styles.name}`}>
        {row.nearest_m === null ? "within 15 min" : (row.nearest_name ?? "Unnamed")}
      </div>
    </div>
  );
}
