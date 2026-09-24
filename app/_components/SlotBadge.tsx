import { SLOT_COLOR, type SlotKey } from "../_lib/walkreach";
import styles from "./SlotBadge.module.css";

export function SlotBadge({ slotKey }: { slotKey: SlotKey }) {
  return (
    <span className={styles.badge} style={{ background: SLOT_COLOR[slotKey] }}>
      {slotKey.toUpperCase()}
    </span>
  );
}
