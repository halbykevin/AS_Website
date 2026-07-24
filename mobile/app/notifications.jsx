import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/src/lib/account';
import { notificationsApi, resolveDeepLink, useNotifications } from '@/src/lib/notifications';
import { formatDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Card, Icon, Button, EmptyState, Skeleton } from '@/src/ui';

const CATEGORY_ICON = {
  order: 'box',
  promo: 'tag',
  news: 'info',
  survey: 'star',
  account: 'shield'
};

export default function NotificationsScreen() {
  const theme = useTheme();
  const account = useAccount();
  const qc = useQueryClient();
  const { enablePush } = useNotifications();
  const [extra, setExtra] = useState([]); // older pages appended by "load more"
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const signedIn = Boolean(account?.customer);
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: () => notificationsApi.list(),
    enabled: signedIn
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const items = [...(data?.items ?? []), ...extra];
  const lastId = items.length ? items[items.length - 1].id : null;
  const hasMore = extra.length
    ? extra.length % 20 === 0 && extra[extra.length - 1]?.id !== 1
    : Boolean(data?.nextBefore);

  const onRefresh = async () => {
    setRefreshing(true);
    setExtra([]);
    await qc.refetchQueries({ queryKey: ['notifications'] });
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!lastId) return;
    setLoadingMore(true);
    try {
      const page = await notificationsApi.list(lastId);
      setExtra(prev => [...prev, ...page.items]);
    } catch {
      /* keep what we have */
    }
    setLoadingMore(false);
  };

  const open = async n => {
    // Optimistic read state, then navigate along the (validated) deep link.
    notificationsApi.click(n.id).catch(() => {}).finally(invalidate);
    router.push(resolveDeepLink(n.deepLink));
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      invalidate();
    } catch {
      /* transient */
    }
  };

  if (!account?.loading && !signedIn) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Notifications" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.spacing.xl }}>
          <EmptyState
            icon="bell"
            title="Sign in to see your notifications"
            message="Order updates, offers and news land here once you're signed in."
            actionLabel="Sign in"
            onAction={() => router.push('/auth/login?next=/notifications')}
          />
        </View>
      </Screen>
    );
  }

  const unread = data?.unreadCount ?? 0;

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <Header
        title="Notifications"
        right={
          unread > 0 ? (
            <Pressable onPress={markAllRead} hitSlop={theme.layout.hitSlop} accessibilityLabel="Mark all as read">
              <Icon name="checkCircle" size={22} color={theme.colors.primary} />
            </Pressable>
          ) : null
        }
      />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        {isLoading ? (
          [0, 1, 2, 3].map(i => <Skeleton key={i} height={76} radius="2xl" />)
        ) : error ? (
          <EmptyState icon="info" title="Couldn't load notifications" message={error.message} actionLabel="Try again" onAction={onRefresh} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nothing here yet"
            message="Order updates, offers and announcements will show up here."
          />
        ) : (
          <>
            {items.map(n => (
              <NotificationRow key={n.id} n={n} onPress={() => open(n)} />
            ))}
            {hasMore ? (
              <Button label={loadingMore ? 'Loading…' : 'Load older'} variant="ghost" onPress={loadMore} fullWidth />
            ) : null}
          </>
        )}
        <Pressable onPress={() => router.push('/account/notifications')} style={{ paddingVertical: theme.spacing.md }}>
          <Text variant="caption" muted center>
            Notification settings
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function NotificationRow({ n, onPress }) {
  const theme = useTheme();
  return (
    <Card
      onPress={onPress}
      style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start', opacity: n.read ? 0.75 : 1 }}
      accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}`}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: theme.alpha(theme.colors.primary, n.read ? 0.06 : 0.12),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon name={CATEGORY_ICON[n.category] || 'bell'} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ fontWeight: n.read ? '400' : '600' }}>
          {n.title}
        </Text>
        {n.body ? (
          <Text variant="caption" muted numberOfLines={2}>
            {n.body}
          </Text>
        ) : null}
        <Text variant="overline" muted style={{ marginTop: 2 }}>
          {formatDateTime(n.createdAt)}
        </Text>
      </View>
      {!n.read ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary, marginTop: 6 }} />
      ) : null}
    </Card>
  );
}
