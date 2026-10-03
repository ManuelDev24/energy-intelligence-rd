import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'energyrd.session.v1';

interface Persisted {
  selectedHomeId: string | null;
  onboardingDone: boolean;
}

interface SessionState extends Persisted {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  selectHome: (id: string | null) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const persist = (s: Persisted) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => undefined);

export const useSession = create<SessionState>((set, get) => ({
  selectedHomeId: null,
  onboardingDone: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        set({
          selectedHomeId: typeof p.selectedHomeId === 'string' ? p.selectedHomeId : null,
          onboardingDone: p.onboardingDone === true,
        });
      }
    } catch {
      /* almacenamiento ilegible: se empieza limpio */
    }
    set({ hydrated: true });
  },
  selectHome: (id) => {
    set({ selectedHomeId: id });
    const { onboardingDone } = get();
    void persist({ selectedHomeId: id, onboardingDone });
  },
  completeOnboarding: () => {
    set({ onboardingDone: true });
    void persist({ selectedHomeId: get().selectedHomeId, onboardingDone: true });
  },
  reset: () => {
    set({ selectedHomeId: null, onboardingDone: false });
    void AsyncStorage.removeItem(KEY).catch(() => undefined);
  },
}));
