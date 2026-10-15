export const hasOwnedSelection = (selected: string | null, homes: readonly { id: string }[]): boolean =>
  !!selected && homes.some((home) => home.id === selected);
