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
        <h2 className={styles.title}>How far can you really walk?</h2>
        <p className={styles.lede}>
          See what is within a 5, 10 and 15 minute walk of any address in
          Hamilton, measured along real streets.
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
