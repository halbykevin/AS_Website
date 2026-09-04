import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useContent } from '@/src/content/ContentProvider';
import { isEventPast } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Chip, EmptyState, useScrolled } from '@/src/ui';
import AppHeader from '@/src/components/AppHeader';
import EventCard from '@/src/components/EventCard';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

// The list is virtualized, and on this screen that is not a micro-optimisation.
// The calendar is 75 events and every card carries a 1600x900 photo off the
// ticketing sites; rendering them all into a ScrollView — which is what this
// screen used to do — mounts 75 card subtrees and asks the OS to decode 75
// full-size JPEGs before the first scroll, which is exactly as slow as it
// sounds. A FlatList keeps about eight alive.
//
// The past-events divider rides in the data rather than sitting outside the
// list, because two lists inside one scroll view would put us straight back to
// mounting everything.
const HEADER = { type: 'header' };

export default function EventsScreen() {
  const theme = useTheme();
  const { events, content, loading, refresh } = useContent();
  const [category, setCategory] = useState('all');
  const { scrolled, onScroll } = useScrolled();

  const categories = content.categories || [];

  const { data, upcomingCount, pastCount } = useMemo(() => {
    let list = events || [];
    if (category !== 'all') list = list.filter(e => e.categorySlug === category);
    const upcoming = list.filter(e => !isEventPast(e));
    const past = list.filter(e => isEventPast(e));
    return {
      data: [...upcoming, ...(past.length ? [HEADER] : []), ...past.map(e => ({ ...e, past: true }))],
      upcomingCount: upcoming.length,
      pastCount: past.length
    };
  }, [events, category]);

  const renderItem = useCallback(
    ({ item }) =>
      item.type === 'header' ? (
        <Text variant="overline" faint style={{ marginTop: theme.spacing.md }}>
          PAST EVENTS
        </Text>
      ) : item.past ? (
        <View style={{ opacity: 0.6 }}>
          <EventCard event={item} wide />
        </View>
      ) : (
        <EventCard event={item} wide />
      ),
    [theme]
  );

  const keyExtractor = useCallback((item, i) => (item.type === 'header' ? 'past-divider' : `${item.past ? 'p' : 'u'}${item.id ?? i}`), []);

  const header = (
    <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text variant="h1">{content.eventsSection?.heading || 'Upcoming Events'}</Text>
        {content.eventsSection?.intro ? (
          <Text variant="body" muted>
            {content.eventsSection.intro}
          </Text>
        ) : null}
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
    </View>
  );

  return (
    <Screen edges={['left', 'right']} scroll={false} padded={false} contentStyle={{ flex: 1 }} header={<AppHeader brand="company" title="Events" bell scrolled={scrolled} />}>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing['4xl'],
          gap: theme.spacing.lg
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={upcomingCount + pastCount === 0 ? <EmptyState icon="calendar" title="No events" message="There are no events to show right now. Pull to refresh." /> : null}
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
