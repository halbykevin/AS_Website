// What We Do — the Absolute Solution division page: intro, the solution tiles
// (each opens a detail screen), vision & mission, and the company divisions.

import { View } from 'react-native'
import { router } from 'expo-router'
import { useContent } from '@/src/content/ContentProvider'
import { useTheme } from '@/src/theme'
import { Screen, Text, Card, Header, Icon, SectionHeader } from '@/src/ui'

export default function WhatWeDoScreen() {
  const theme = useTheme()
  const { content } = useContent()
  const wwd = content.whatWeDo || {}
  const solutions = content.solutions || []

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="What We Do" />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing['3xl'], paddingTop: theme.spacing.lg }}>
        {/* Intro */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="overline" color="primary">
            {(wwd.eyebrow || 'ABSOLUTE SOLUTION').toUpperCase()}
          </Text>
          <Text variant="h1">{wwd.title}</Text>
          {(wwd.intro || []).map((p, i) => (
            <Text key={i} variant="body" muted>
              {p}
            </Text>
          ))}
        </View>

        {/* Solutions */}
        {solutions.length > 0 ? (
          <View>
            <SectionHeader eyebrow={wwd.solutionsHeading} title={wwd.solutionsHeading || 'Our Solutions'} subtitle={wwd.solutionsIntro} />
            <View style={{ gap: theme.spacing.md }}>
              {solutions.map((s) => (
                <Card key={s.slug} onPress={() => router.push(`/what-we-do/${s.slug}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: theme.alpha(theme.colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={24} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="title">{s.title}</Text>
                    {s.summary ? (
                      <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>
                        {s.summary}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {/* Vision & Mission */}
        <View style={{ gap: theme.spacing.md }}>
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <Text variant="overline" color="primary">
              {(wwd.visionHeading || 'OUR VISION').toUpperCase()}
            </Text>
            <Text variant="body" style={{ marginTop: 6 }}>
              {wwd.vision}
            </Text>
          </Card>
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <Text variant="overline" color="primary">
              {(wwd.missionHeading || 'OUR MISSION').toUpperCase()}
            </Text>
            <Text variant="body" style={{ marginTop: 6 }}>
              {wwd.mission}
            </Text>
          </Card>
        </View>

        {/* Divisions */}
        {(wwd.divisions || []).length > 0 ? (
          <View>
            <SectionHeader title={wwd.divisionsHeading || 'Our Divisions'} subtitle={wwd.divisionsIntro} />
            <View style={{ gap: theme.spacing.md }}>
              {wwd.divisions.map((d, i) => (
                <Card key={i}>
                  <Text variant="title" color="primary">
                    {d.name}
                  </Text>
                  <Text variant="body" muted style={{ marginTop: 4 }}>
                    {d.description}
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
