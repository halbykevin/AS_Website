import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import { Screen, Text, Card, Icon } from '@/src/ui';
import AppHeader from '@/src/components/AppHeader';
import ComingSoon from '@/src/components/ComingSoon';
import Boundary from '@/src/components/Boundary';
import SpinBanner from '@/src/components/spin/SpinBanner';
import { StorePanel, EventsPanel, WhatWeDoPanel } from '@/src/components/home/HomePanels';
import useConfirmExit from '@/src/lib/useConfirmExit';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

// Home is AS Company, the way as.com.lb is AS Company: the three panels — the
// store, the ticketing hub, what we do — and nothing else.
//
// It used to be a second storefront: deals, rails, a category wall, a product
// grid. That made sense when Home was the first thing the app opened, but the
// app opens on Shop now (see the tabs layout), so all of that was the Shop tab
// said twice, and it pushed the company itself off a screen that carries its
// name. The three panels are what the website's front door is, so they are what
// this one is.
//
// Every panel stays inside the app — Shop, Events, What We Do — rather than
// opening a browser. Handing someone off to the website from inside the app
// that already has the thing they tapped would be the app losing to it.
export default function HomeScreen() {
  const theme = useTheme();
  const { content, storeSettings, loading, refresh } = useContent();

  const onRefresh = useCallback(() => refresh(), [refresh]);

  // Home is the only screen where Android's back means "leave the app" — every
  // other tab unwinds to here first, and pushed screens just pop. Must sit above
  // the early return below so the hook order stays stable.
  useConfirmExit();

  if (storeSettings && storeSettings.published === false) {
    return (
      <Screen edges={['top']} scroll={false} padded={false}>
        <ComingSoon settings={storeSettings} />
      </Screen>
    );
  }

  return (
    <Screen
      edges={['left', 'right']}
      statusBarStyle="light"
      contentStyle={{ paddingHorizontal: 0 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      header={s => <AppHeader brand="company" title="AS Company" bell scrolled={s} />}
    >
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        <View style={{ gap: 4 }}>
          <Text variant="overline" color="primary">
            {(content.brand?.name || 'AS COMPANY').toUpperCase()}
          </Text>
          <Text variant="bodyLg" muted>
            {content.brand?.tagline || 'Market leader in telecommunication and electronics in Lebanon since 2008.'}
          </Text>
        </View>

        {/* Each panel is contained on its own: the store slideshow reads live
            products off two APIs in sequence, and a bad row there must not take
            the events panel down with it. */}
        <Boundary name="home:store" label="The store panel didn't load.">
          <StorePanel banner={content.storeBanner} />
        </Boundary>

        <Boundary name="home:events" label="The events panel didn't load.">
          <EventsPanel />
        </Boundary>

        <Boundary name="home:what-we-do" label="This panel didn't load.">
          <WhatWeDoPanel services={content.services} />
        </Boundary>

        {/* Daily Spin — hidden entirely unless a wheel is running in the CMS.
            Fails silently: a promotional banner is never worth an error notice
            in its place. */}
        <Boundary name="home:spin" fallback={null}>
          <SpinBanner />
        </Boundary>

        {/* Guess the Score, while a round is open. */}
        {content.predictor && !content.predictor.closed ? (
          <Boundary name="home:predictor" fallback={null}>
            <Card onPress={() => router.push('/predictor')} radius="3xl" style={{ backgroundColor: theme.colors.primary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
                <Icon name="basketball" size={36} color={theme.colors.white} />
                <View style={{ flex: 1 }}>
                  <Text variant="overline" color="textOnPrimary">
                    PLAY &amp; WIN
                  </Text>
                  <Text variant="h3" color="textOnPrimary">
                    {content.predictor.title}
                  </Text>
                </View>
                <Icon name="chevronRight" size={22} color={theme.colors.white} />
              </View>
            </Card>
          </Boundary>
        ) : null}

        {/* The company itself — the informative pages, one tap away. */}
        <Card onPress={() => router.push('/company')} radius="3xl" style={{ backgroundColor: theme.colors.inverse }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" color="primaryLight">
                ABOUT
              </Text>
              <Text variant="callout" color="textOnInverseMuted" style={{ marginTop: 4 }}>
                {content.about?.heading || 'About AS Company'}
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={theme.colors.textOnInverseMuted} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
