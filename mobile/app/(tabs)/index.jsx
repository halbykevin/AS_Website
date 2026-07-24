// Home tab — the AS Company marketing homepage: hero, what-we-do preview, an
// events rail, the AS Store entry point, the predictor teaser, about stats and
// contact. All copy comes from useContent() (API-driven, offline fallbacks).

import { useMemo } from 'react'
import { RefreshControl, View } from 'react-native'
import { router } from 'expo-router'
import { useContent } from '@/src/content/ContentProvider'
import { isEventPast } from '@/src/lib/format'
import { openUrl } from '@/src/lib/whatsapp'
import { useTheme } from '@/src/theme'
import { Screen, Text, Button, Card, Icon, SectionHeader, Divider } from '@/src/ui'
import BrandBar from '@/src/components/BrandBar'
import AnnouncementBar from '@/src/components/AnnouncementBar'
import EventCard from '@/src/components/EventCard'
import HRail from '@/src/components/HRail'

export default function HomeScreen() {
  const theme = useTheme()
  const { content, events, storeSettings, loading, refresh } = useContent()

  const upcoming = useMemo(() => {
    const list = (events || []).filter((e) => !isEventPast(e))
    return (list.length ? list : events || []).slice(0, 6)
  }, [events])

  const services = content.services?.items || []
  const predictor = content.predictor

  return (
    <Screen
      edges={['top']}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.primary} />}
      contentStyle={{ paddingHorizontal: 0 }}
    >
      <AnnouncementBar announcement={storeSettings?.announcement} />
      <BrandBar variant="company" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['3xl'] }}>
        {/* Hero */}
        <View style={{ paddingTop: theme.spacing.lg, gap: theme.spacing.md }}>
          <Text variant="overline" color="primary">
            {(content.hero?.eyebrow || '').toUpperCase()}
          </Text>
          <Text variant="display">{content.hero?.title}</Text>
          <Text variant="bodyLg" muted>
            {content.hero?.subtitle}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Button label="Browse Events" icon="calendar" onPress={() => router.push('/events')} />
            <Button label="What We Do" variant="ghost" onPress={() => router.push('/what-we-do')} />
          </View>
        </View>

        {/* AS Store entry */}
        <Card onPress={() => router.push('/store')} padded={false} radius="3xl" style={{ backgroundColor: theme.colors.inverse }}>
          <View style={{ padding: theme.spacing['2xl'], gap: theme.spacing.sm }}>
            <Text variant="overline" color="primaryLight">
              {(content.store?.eyebrow || 'AS STORE').toUpperCase()}
            </Text>
            <Text variant="h2" color="textOnInverse">
              {content.store?.title || 'AS Store'}
            </Text>
            <Text variant="body" color="textOnInverseMuted">
              {content.store?.description}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm }}>
              <Text variant="callout" color="primaryLight" weight="semibold">
                {content.store?.cta || 'Open AS Store'}
              </Text>
              <Icon name="arrowRight" size={16} color={theme.colors.primaryLight} />
            </View>
          </View>
        </Card>

        {/* What We Do */}
        {services.length > 0 ? (
          <View>
            <SectionHeader
              eyebrow={content.services?.heading}
              title={content.services?.heading || 'What We Do'}
              subtitle={content.services?.subheading}
              actionLabel="Learn more"
              onAction={() => router.push('/what-we-do')}
            />
            <View style={{ gap: theme.spacing.md }}>
              {services.map((s, i) => (
                <Card key={i} style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.alpha(theme.colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="title">{s.title}</Text>
                    <Text variant="body" muted style={{ marginTop: 4 }}>
                      {s.description}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {/* Events rail */}
        {upcoming.length > 0 ? (
          <View>
            <SectionHeader
              eyebrow={content.eventsSection?.heading}
              title={content.eventsSection?.heading || 'Upcoming Events'}
              subtitle={content.eventsSection?.intro}
              actionLabel="See all"
              onAction={() => router.push('/events')}
            />
            <HRail data={upcoming} itemWidth={300} renderItem={(ev) => <EventCard event={ev} />} />
          </View>
        ) : null}

        {/* Predictor teaser */}
        {predictor && !predictor.closed ? (
          <Card onPress={() => router.push('/predictor')} radius="3xl" style={{ backgroundColor: theme.colors.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
              <Icon name="basketball" size={40} color={theme.colors.white} />
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="textOnPrimary">
                  {predictor.subtitle ? predictor.subtitle.toUpperCase() : 'PLAY & WIN'}
                </Text>
                <Text variant="h3" color="textOnPrimary">
                  {predictor.title}
                </Text>
                {predictor.prize?.title ? (
                  <Text variant="caption" color="textOnPrimary" style={{ opacity: 0.85, marginTop: 2 }}>
                    Win {predictor.prize.title}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevronRight" size={22} color={theme.colors.white} />
            </View>
          </Card>
        ) : null}

        {/* About */}
        {content.about ? (
          <View>
            <Text variant="h2">{content.about.heading}</Text>
            {(content.about.body || []).map((p, i) => (
              <Text key={i} variant="body" muted style={{ marginTop: theme.spacing.md }}>
                {p}
              </Text>
            ))}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
              {(content.about.stats || []).map((st, i) => (
                <Card key={i} style={{ flex: 1, alignItems: 'center' }} padded>
                  <Text variant="h2" color="primary">
                    {st.value}
                  </Text>
                  <Text variant="caption" muted center style={{ marginTop: 2 }}>
                    {st.label}
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {/* Contact */}
        {content.contact ? (
          <View>
            <SectionHeader title={content.contact.heading} subtitle={content.contact.subheading} />
            <Card style={{ gap: theme.spacing.md }}>
              <ContactRow icon="mail" label={content.contact.email} onPress={() => openUrl(`mailto:${content.contact.email}`)} />
              <Divider />
              <ContactRow icon="whatsapp" label="Chat on WhatsApp" onPress={() => openUrl(content.contact.whatsapp)} />
              <Divider />
              <ContactRow icon="instagram" label={content.contact.instagramHandle} onPress={() => openUrl(content.contact.instagram)} />
            </Card>
          </View>
        ) : null}

        <Text variant="caption" faint center style={{ marginTop: theme.spacing.lg }}>
          {content.brand?.legalName} · Since 2008
        </Text>
      </View>
    </Screen>
  )
}

function ContactRow({ icon, label, onPress }) {
  const theme = useTheme()
  if (!label) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1} onPress={onPress}>
        {label}
      </Text>
      <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
    </View>
  )
}
