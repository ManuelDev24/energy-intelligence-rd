// Pure form state: refresh untouched fields, keep user intent, track edits across awaits.
export type EditableDraft<T extends object> = {
  baseline: T; value: T; revision: number; pendingRevision?: number; editedAt: Partial<Record<keyof T, number>>;
};
export const createDraft = <T extends object>(value: T): EditableDraft<T> => ({ baseline: value, value, revision: 0, editedAt: {} });
export const beginDraft = <T extends object>(state: EditableDraft<T>): EditableDraft<T> => ({ ...state, pendingRevision: state.revision });
export const endDraft = <T extends object>(state: EditableDraft<T>): EditableDraft<T> => ({ ...state, pendingRevision: undefined });
export function editDraft<T extends object, K extends keyof T>(state: EditableDraft<T>, key: K, value: T[K]): EditableDraft<T> {
  return { ...state, value: { ...state.value, [key]: value }, revision: state.revision + 1,
    editedAt: { ...state.editedAt, [key]: state.revision + 1 } };
}
export function rebaseDraft<T extends object>(state: EditableDraft<T>, baseline: T): EditableDraft<T> {
  const value = { ...baseline };
  for (const key of Object.keys(baseline) as (keyof T)[]) {
    if (!Object.is(state.value[key], state.baseline[key]) || (state.pendingRevision !== undefined && (state.editedAt[key] ?? 0) > state.pendingRevision)) value[key] = state.value[key];
  }
  return { ...state, baseline, value };
}
export function confirmDraft<T extends object>(state: EditableDraft<T>, submitted: EditableDraft<T>, baseline: T): EditableDraft<T> {
  const value = { ...baseline };
  for (const key of Object.keys(baseline) as (keyof T)[]) {
    if ((state.editedAt[key] ?? 0) > submitted.revision) value[key] = state.value[key];
  }
  return { ...state, baseline, value, pendingRevision: undefined };
}
export function sameDraft<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every(key => Object.is(a[key], b[key]));
}
