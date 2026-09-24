import { SLOT_COLOR, type Slot, type SlotKey } from "../_lib/walkreach";
import { SlotBadge } from "./SlotBadge";
import ui from "./ui.module.css";
import styles from "./SlotPicker.module.css";

// Comparing: which of the two places the next click or search sets.
export function SlotPicker({
  slots,
  active,
  onSelect,
}: {
  slots: Record<SlotKey, Slot>;
  active: SlotKey;
  onSelect: (key: SlotKey) => void;
}) {
  return (
    <>
      <div className={styles.row}>
        {(["a", "b"] as const).map((key) => {
          const point = slots[key].point;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              aria-pressed={active === key}
              className={`${styles.slot} ${point ? styles.set : ""}`}
              style={{ borderColor: active === key ? SLOT_COLOR[key] : "#e2e2e2" }}
            >
              <SlotBadge slotKey={key} />
              <span className={ui.truncate}>
                {point ? (point.label ?? "Pin on the map") : "Not set"}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.hint}>
        Click the map or search to place {active.toUpperCase()}.
      </p>
    </>
  );
}
