// The standard layout for anything rendered inside a Sheet: a titled header row
// (with a close button), a body (scrollable or not), and an optional pinned
// footer that respects the home-indicator safe area. Keeps every sheet in the
// app visually identical — the RN equivalent of the web store's <Sheet> chrome.
//
//   <SheetScaffold title="Filter" onClose={close} footer={<Button .../>}>
//     …rows…
//   </SheetScaffold>

import { View } from 'react-native';
import { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from '../Text';
import Icon from '../Icon';

export default function SheetScaffold({ title, subtitle, onClose, footer, scroll = false, children, contentStyle }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  // With a pinned footer the safe-area padding lives on the footer; otherwise it
  // pads the body so the last row clears the home indicator.
  const bottomPad = Math.max(insets.bottom, theme.spacing.md);
  const Body = scroll ? BottomSheetScrollView : BottomSheetView;
  const bodyProps = scroll
    ? { showsVerticalScrollIndicator: false, contentContainerStyle: [styles.body, !footer && { paddingBottom: bottomPad }, contentStyle] }
    : { style: [styles.body, !footer && { paddingBottom: bottomPad }, contentStyle] };

  return (
    <View style={styles.root}>
      {title != null ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {onClose ? (
            <Pressable onPress={onClose} hitSlop={theme.layout.hitSlop} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Body {...bodyProps}>{children}</Body>

      {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
    </View>
  );
}

const makeStyles = t => ({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.md,
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.xs,
    paddingBottom: t.spacing.md
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceAlt
  },
  body: { paddingHorizontal: t.layout.screenPadding },
  footer: {
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface
  }
});
