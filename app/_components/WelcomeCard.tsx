import ui from "./ui.module.css";
import styles from "./WelcomeCard.module.css";

export function WelcomeCard({
  mapReady,
  onExample,
  onDismiss,
}: {
  mapReady: boolean;
  onExample: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.title}>WalkReach</h2>
        <p className={styles.lede}>
          Find out how walkable any address in Hamilton really is.
        </p>
        <p className={styles.method}>
          Distances are measured along real streets and footpaths, not
          straight lines — so the Waikato River and every other barrier
          counts, the way it does when you actually walk.
        </p>

        <ol className={styles.steps}>
          <li>
            Search an address, or click anywhere on the map — a
            street, a suburb, a place you are thinking of renting.
          </li>
          <li>
            See how far you can walk from there in 5, 10 and 15 minutes.
          </li>
          <li>
            Get a walkability score and how far the nearest supermarket,
            clinic, school, park and bus stop are on foot.
          </li>
        </ol>

        <div className={styles.actions}>
          <button
            onClick={onExample}
            disabled={!mapReady}
            className={`${ui.primary} ${ui.example} ${styles.example}`}
          >
            Show me an example
          </button>
          <button onClick={onDismiss} className={`${ui.link} ${styles.dismiss}`}>
            Pick a spot myself
          </button>
        </div>
      </div>
    </div>
  );
}
