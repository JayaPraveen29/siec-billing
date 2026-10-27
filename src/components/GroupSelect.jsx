// Group / Work Type filter dropdowns shared by every report page.
import { PO_GROUPS, WORK_TYPES, WORK_NOT_SET } from "../utils/groups";

export default function GroupSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">Group</option>
      {PO_GROUPS.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}

export function WorkTypeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">Work Type</option>
      {WORK_TYPES.map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
      <option value={WORK_NOT_SET}>Not Set</option>
    </select>
  );
}
