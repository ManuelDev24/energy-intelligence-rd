import { AlertCard } from './AlertCard';

/** ERD-UI-KIT: recomendación que redacta la API (tono «ahorro»). Sin texto no se pinta nada: no se inventan consejos. */
export function RecommendationCard({ text, onPress, testID = 'card-reco' }: { text: string | null | undefined; onPress?: () => void; testID?: string }) {
  if (!text) return null;
  return <AlertCard tone="savings" title="Recomendación" message={text} onPress={onPress} accessibilityHint={onPress ? 'Abre la lista de equipos' : undefined} testID={testID} />;
}
