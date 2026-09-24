import { BANDS, COMPARE_OPACITY, SLOT_COLOR } from "../_lib/walkreach";
import styles from "./Legend.module.css";

// What the colours on the map mean, for whichever mode is showing.
export function Legend({ compare }: { compare: boolean }) {
  const items = compare
    ? (["a", "b"] as const).map((key) => ({
        key,
        color: SLOT_COLOR[key],
        opacity: COMPARE_OPACITY,
        label: <>Place {key.toUpperCase()}</>,
      }))
    : BANDS.map((band) => ({
        key: band.minutes,
        color: band.color,
        opacity: band.opacity,
        label: <>{band.minutes} minutes</>,
      }));

  return (
    <div className={styles.legend}>
      <div className={styles.title}>
        {compare ? "15 minute walk from each place" : "Walking time from the pin"}
      </div>
      {items.map((item) => (
        <div key={item.key} className={styles.item}>
          <span
            className={styles.swatch}
            style={{ background: item.color, opacity: item.opacity }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
