import { useContent } from '@/src/content/ContentProvider';
import { Screen } from '@/src/ui';
import ComingSoon from '@/src/components/ComingSoon';
import CatalogScreen from '@/src/components/store/CatalogScreen';

// Shop is the products.
//
// It used to be a menu — an "All products" card and a wall of category tiles —
// which made browsing the catalog a two-tap errand and gave the tab nothing to
// show but signposts. Now the tab IS the catalog, with the same sort/filter
// toolbar as a category page; the categories live on inside it, as the category
// filter, and the home tab's tiles still deep-link to /category/<slug>.
//
// No list heading here on purpose: the nav bar already says Shop, and repeating
// it would push the first row of products below the fold to say nothing new.

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function ShopScreen() {
  const { storeSettings } = useContent();

  if (storeSettings && storeSettings.published === false) {
    return (
      <Screen edges={['top']} scroll={false} padded={false}>
        <ComingSoon settings={storeSettings} />
      </Screen>
    );
  }

  return <CatalogScreen slug="all" headerTitle="Shop" listTitle={null} />;
}
