import { useLocalSearchParams } from 'expo-router';
import CatalogScreen from '@/src/components/store/CatalogScreen';

// One department's products. The screen itself is CatalogScreen — the same one
// the Shop tab renders for the whole catalog.

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function CategoryRoute() {
  const params = useLocalSearchParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return <CatalogScreen slug={slug} showBack />;
}
