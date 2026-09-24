import styles from "./ModeSwitch.module.css";

export function ModeSwitch({
  compare,
  onChange,
}: {
  compare: boolean;
  onChange: (compare: boolean) => void;
}) {
  return (
    <div role="group" aria-label="Mode" className={styles.group}>
      {[false, true].map((on) => (
        <button
          key={String(on)}
          onClick={() => onChange(on)}
          aria-pressed={compare === on}
          className={styles.option}
        >
          {on ? "Compare two places" : "One place"}
        </button>
      ))}
    </div>
  );
}
