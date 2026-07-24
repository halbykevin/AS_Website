// Event card — tapping it opens the event detail. Mirrors the marketing site's
// EventCard: image, category chip, title, date + venue, and a "past" dimming.

import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useTheme, useThemedStyles } from '@/src/theme'
import { isEventPast } from '@/src/lib/format'
import Text from '@/src/ui/Text'
import Badge from '@/src/ui/Badge'
import Icon from '@/src/ui/Icon'
import RemoteImage from './RemoteImage'

export default function EventCard({ event, wide = false }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const past = isEventPast(event)

  return (
    <Pressable
      onPress={() => router.push(`/events/${event.id}`)}
      style={({ pressed }) => [styles.card, wide && styles.wide, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.imageWrap}>
        <RemoteImage uri={event.image} style={styles.image} fallbackIcon="ticket" />
        {event.categoryName ? <Badge label={event.categoryName} tone="ink" style={styles.cat} /> : null}
        {past ? (
          <View style={styles.pastOverlay}>
            <Badge label="Past event" tone="neutral" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text variant="title" numberOfLines={2}>
          {event.title}
        </Text>
        {event.dateLabel ? (
          <View style={styles.metaRow}>
            <Icon name="calendar" size={14} color={theme.colors.primary} />
            <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
              {event.dateLabel}
            </Text>
          </View>
        ) : null}
        {event.venue || event.city ? (
          <View style={styles.metaRow}>
            <Icon name="pin" size={14} color={theme.colors.primary} />
            <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
              {[event.venue, event.city].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const makeStyles = (t) => ({
  card: {
    borderRadius: t.radii['2xl'],
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
    ...t.shadows.card,
  },
  wide: { width: '100%' },
  imageWrap: { width: '100%', aspectRatio: 16 / 10, backgroundColor: t.colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  cat: { position: 'absolute', left: t.spacing.md, top: t.spacing.md },
  pastOverlay: { position: 'absolute', right: t.spacing.md, top: t.spacing.md },
  body: { padding: t.spacing.lg, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
