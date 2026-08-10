import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { openUrl } from '@/src/lib/whatsapp';
import { eventDateLabel, isEventPast } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Icon, Button, Badge, Card, Divider, EmptyState } from '@/src/ui';
import RemoteImage from '@/src/components/RemoteImage';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function EventDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams();
  const { events } = useContent();
  const event = (events || []).find(e => e.id === id);

  if (!event) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Event" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="ticket" title="Not found" message="This event isn't available." actionLabel="Back to Events" onAction={() => router.replace('/events')} />
        </View>
      </Screen>
    );
  }

  const past = isEventPast(event);
  const multiDay = Array.isArray(event.dates) && event.dates.length > 1;

  const reserve = () => {
    const url = event.bookingUrl || event.ticketUrl;
    if (url) openUrl(url);
  };

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        <View style={{ padding: theme.layout.screenPadding, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }}>
          <Button label={past ? 'Event has ended' : 'Reserve on WhatsApp'} icon={past ? undefined : 'whatsapp'} onPress={reserve} disabled={past || !(event.bookingUrl || event.ticketUrl)} fullWidth size="lg" />
          <Text variant="caption" faint center style={{ marginTop: 8 }}>
            Reservations powered by Ticketing Box Office
          </Text>
        </View>
      }
    >
      <Header title="Event" transparent />
      <RemoteImage uri={event.image} style={{ width: '100%', aspectRatio: 16 / 10 }} fallbackIcon="ticket" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {event.categoryName ? <Badge label={event.categoryName} tone="ink" /> : null}
          {past ? <Badge label="Past event" tone="neutral" /> : <Badge label="Open" tone="success" />}
        </View>

        <Text variant="h1">{event.title}</Text>

        <Card style={{ gap: theme.spacing.md }}>
          <MetaRow icon="calendar" label={eventDateLabel(event) || 'Date to be announced'} />
          {event.time ? (
            <>
              <Divider />
              <MetaRow icon="play" label={event.time} />
            </>
          ) : null}
          {event.venue || event.city ? (
            <>
              <Divider />
              <MetaRow icon="pin" label={[event.venue, event.city].filter(Boolean).join(', ')} />
            </>
          ) : null}
        </Card>

        {/* Multi-day schedule */}
        {multiDay ? (
          <View>
            <Text variant="h3" style={{ marginBottom: theme.spacing.sm }}>
              Schedule
            </Text>
            <Card style={{ gap: theme.spacing.sm }}>
              {event.dates.map((d, i) => (
                <View key={i}>
                  {i > 0 ? <Divider style={{ marginVertical: 6 }} /> : null}
                  <Text variant="body">{d.label || d.date}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {event.description ? (
          <View>
            <Text variant="h3" style={{ marginBottom: theme.spacing.sm }}>
              About this event
            </Text>
            <Text variant="body" muted>
              {event.description}
            </Text>
          </View>
        ) : event.excerpt ? (
          <Text variant="body" muted>
            {event.excerpt}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function MetaRow({ icon, label }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}
