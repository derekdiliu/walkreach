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
        <p className={styles.hint}>
          Search an address, or click anywhere on the map.
        </p>

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
