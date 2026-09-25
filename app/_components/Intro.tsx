import { EXAMPLE_PLACES, type Place } from "../_lib/walkreach";
import ui from "./ui.module.css";
import styles from "./Intro.module.css";

// The panel before any place is chosen.
export function Intro({
  mapReady,
  onTry,
}: {
  mapReady: boolean;
  onTry: (place: Place) => void;
}) {
  return (
    <div>
      <p className={styles.question}>
        How much of everyday life is within a short walk?
      </p>
      <p className={styles.how}>
        Search an address above, or click any point on the map.
        WalkReach traces how far you can actually walk from there in 5,
        10 and 15 minutes, then scores how close the nearest supermarket,
        clinic, school, park and bus stop are.
      </p>
      <p className={styles.network}>
        Distances follow the real street and footpath network, not
        straight lines — so the Waikato River and other barriers count.
      </p>
      <div className={`${ui.eyebrow} ${styles.tryHeading}`}>Or try one of these</div>
      <div className={styles.places}>
        {EXAMPLE_PLACES.map((place) => (
          <button
            key={place.label}
            onClick={() => onTry(place)}
            disabled={!mapReady}
            className={`${ui.secondary} ${ui.example}`}
          >
            {place.label}
          </button>
        ))}
      </div>
    </div>
  );
}
