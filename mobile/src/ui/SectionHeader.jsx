// Eyebrow + heading + optional "See all" action. The recurring section title
// pattern used across the home, store and events screens.

import { Pressable, View } from 'react-native';
import { useTheme } from '@/src/theme';
import Text from './Text';
import Icon from './Icon';

export default function SectionHeader({ eyebrow, title, subtitle, actionLabel, onAction, onInverse = false, style }) {
  const theme = useTheme();
  return (
    <View style={[{ marginBottom: theme.spacing.lg }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text variant="overline" color={onInverse ? 'primaryLight' : 'primary'} style={{ marginBottom: 4 }}>
              {eyebrow.toUpperCase()}
            </Text>
          ) : null}
          <Text variant="h2" onInverse={onInverse}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" muted onInverse={onInverse} style={{ marginTop: 6 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={theme.layout.hitSlop} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: theme.spacing.md }}>
            <Text variant="callout" color="primary">
              {actionLabel}
            </Text>
            <Icon name="chevronRight" size={16} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
