// Solution detail — intro, the list of capabilities (title + optional
// description), and an outro. Content comes from the loaded solutions list.

import { View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useContent } from '@/src/content/ContentProvider'
import { openUrl } from '@/src/lib/whatsapp'
import { useTheme } from '@/src/theme'
import { Screen, Text, Card, Header, Icon, Button, EmptyState } from '@/src/ui'
import RemoteImage from '@/src/components/RemoteImage'

export default function SolutionDetailScreen() {
  const theme = useTheme()
  const { slug } = useLocalSearchParams()
  const { content } = useContent()
  const solution = (content.solutions || []).find((s) => s.slug === slug)

  if (!solution) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Solution" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="info" title="Not found" message="This solution isn't available." actionLabel="Back to What We Do" onAction={() => router.replace('/what-we-do')} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={solution.title} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        {solution.image ? (
          <RemoteImage uri={solution.image} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radii['2xl'] }} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.alpha(theme.colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={solution.icon} size={28} color={theme.colors.primary} />
          </View>
        )}

        <Text variant="h1">{solution.title}</Text>
        {solution.intro ? (
          <Text variant="bodyLg" muted>
            {solution.intro}
          </Text>
        ) : null}

        {(solution.items || []).length > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            {solution.items.map((it, i) => (
              <Card key={i} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <Icon name="checkCircle" size={20} color={theme.colors.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">{it.title}</Text>
                  {it.description ? (
                    <Text variant="body" muted style={{ marginTop: 4 }}>
                      {it.description}
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {solution.outro ? (
          <Text variant="body" muted>
            {solution.outro}
          </Text>
        ) : null}

        <Button
          label="Talk to us"
          icon="whatsapp"
          onPress={() => openUrl(content.contact?.whatsapp)}
          fullWidth
          style={{ marginTop: theme.spacing.sm }}
        />
      </View>
    </Screen>
  )
}
