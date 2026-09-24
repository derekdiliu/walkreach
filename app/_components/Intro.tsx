import ui from "./ui.module.css";
import styles from "./Intro.module.css";

// The panel before any place is chosen.
export function Intro({ mapReady, onTry }: { mapReady: boolean; onTry: () => void }) {
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
      <button
        onClick={onTry}
        disabled={!mapReady}
        className={`${ui.primary} ${ui.example} ${styles.try}`}
      >
        Try the city centre
      </button>
    </div>
  );
}
