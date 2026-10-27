// Single source of truth for the two PO classifications.
//
//  - Group      = the company the PO belongs to      (SIEC, ST)
//  - Work Type  = the kind of work the PO is for     (STRL, CT)
//
// Every PO carries both: po.group and po.workType.

export const PO_GROUPS = ["SIEC", "ST"];
export const WORK_TYPES = ["STRL", "CT"];
export const WORK_NOT_SET = "none"; // filter value: PO has no work type assigned

const isAll = (v) => !v || v === "all" || v === "All";

/** Does the PO's company group match the selected Group filter? */
export function matchesGroup(poGroup, selected) {
  return isAll(selected) || poGroup === selected;
}

/** Does the PO's work type match the selected Work Type filter? */
export function matchesWorkType(poWorkType, selected) {
  if (selected === WORK_NOT_SET) return !poWorkType; // POs with no work type yet
  return isAll(selected) || poWorkType === selected;
}
