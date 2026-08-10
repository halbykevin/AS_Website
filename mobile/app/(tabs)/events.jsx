import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useContent } from '@/src/content/ContentProvider';
import { isEventPast } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Chip, EmptyState } from '@/src/ui';
import AppHeader from '@/src/components/AppHeader';
import EventCard from '@/src/components/EventCard';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function EventsScreen() {
  const theme = useTheme();
  const { events, content, loading, refresh } = useContent();
  const [category, setCategory] = useState('all');

  const categories = content.categories || [];

  const { upcoming, past } = useMemo(() => {
    let list = events || [];
    if (category !== 'all') list = list.filter(e => e.categorySlug === category);
    return {
      upcoming: list.filter(e => !isEventPast(e)),
      past: list.filter(e => isEventPast(e))
    };
  }, [events, category]);

  return (
    <Screen edges={['left', 'right']} contentStyle={{ paddingHorizontal: 0 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.primary} />} header={s => <AppHeader brand="company" title="Events" bell scrolled={s} />}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: 6 }}>
          <Text variant="h1">{content.eventsSection?.heading || 'Upcoming Events'}</Text>
          <Text variant="body" muted>
            {content.eventsSection?.intro}
          </Text>
        </View>

        {/* Category filter chips */}
        {categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -theme.layout.screenPadding }} contentContainerStyle={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.sm }}>
            <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
            {categories.map(c => (
              <Chip key={c.slug} label={c.name} selected={category === c.slug} onPress={() => setCategory(c.slug)} />
            ))}
          </ScrollView>
        ) : null}

        {/* Upcoming */}
        {upcoming.length === 0 && past.length === 0 ? <EmptyState icon="calendar" title="No events" message="There are no events to show right now. Pull to refresh." /> : null}

        {upcoming.length > 0 ? (
          <View style={{ gap: theme.spacing.lg }}>
            {upcoming.map(ev => (
              <EventCard key={ev.id} event={ev} wide />
            ))}
          </View>
        ) : null}

        {/* Past */}
        {past.length > 0 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Text variant="overline" faint>
              PAST EVENTS
            </Text>
            {past.map(ev => (
              <View key={ev.id} style={{ opacity: 0.6 }}>
                <EventCard event={ev} wide />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
