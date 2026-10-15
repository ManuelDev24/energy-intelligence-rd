import { useState } from 'react';
import { createDraft, editDraft, rebaseDraft, sameDraft, confirmDraft, beginDraft, endDraft, type EditableDraft } from './editableDraft';

export function useEditableDraft<T extends object>(canonical: T) {
  const [stored, setStored] = useState(() => ({ source: canonical, state: createDraft(canonical) }));
  // Adjust during render: no frame or event handler can use the old untouched values.
  let current = stored;
  if (!sameDraft(stored.source, canonical)) {
    current = { source: canonical, state: rebaseDraft(stored.state, canonical) };
    setStored(current);
  }
  const set = <K extends keyof T>(key: K, value: T[K]) => setStored(previous => ({ ...previous, state: editDraft(previous.state, key, value) }));
  const confirm = (value: T, submitted: EditableDraft<T>) => setStored(previous => ({ ...previous, state: confirmDraft(previous.state, submitted, value) }));
  const begin = () => setStored(previous => ({ ...previous, state: beginDraft(previous.state) }));
  const end = () => setStored(previous => ({ ...previous, state: endDraft(previous.state) }));
  return { state: current.state, set, confirm, begin, end };
}
