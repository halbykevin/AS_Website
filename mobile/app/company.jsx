// AS Company — the informative (website) side, one tap away from the store:
// hero, what-we-do services, about stats and contact. Linked from Home + Account.

import { View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { openUrl } from '@/src/lib/whatsapp';
import { useTheme } from '@/src/theme';
import { Screen, Text, Button, Card, Header, Icon, SectionHeader, Divider } from '@/src/ui';

export default function CompanyScreen() {
  const theme = useTheme();
  const { content } = useContent();
  const services = content.services?.items || [];

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={content.brand?.name || 'AS Company'} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['3xl'], paddingTop: theme.spacing.lg }}>
        {/* Hero */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="overline" color="primary">
            {(content.hero?.eyebrow || '').toUpperCase()}
          </Text>
          <Text variant="display">{content.hero?.title}</Text>
          <Text variant="bodyLg" muted>
            {content.hero?.subtitle}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Button label="What We Do" icon="sparkles" onPress={() => router.push('/what-we-do')} />
            <Button label="Browse Events" variant="ghost" icon="calendar" onPress={() => router.push('/events')} />
          </View>
        </View>

        {/* Services */}
        {services.length > 0 ? (
          <View>
            <SectionHeader eyebrow="What We Do" title={content.services?.heading || 'What We Do'} subtitle={content.services?.subheading} actionLabel="Learn more" onAction={() => router.push('/what-we-do')} />
            <View style={{ gap: theme.spacing.md }}>
              {services.map((s, i) => (
                <Card key={i} style={{ flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: theme.alpha(theme.colors.primary, 0.1),
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
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

        <Text variant="caption" faint center>
          {content.brand?.legalName} · Since 2008
        </Text>
      </View>
    </Screen>
  );
}

function ContactRow({ icon, label, onPress }) {
  const theme = useTheme();
  if (!label) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1} onPress={onPress}>
        {label}
      </Text>
      <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
    </View>
  );
}
