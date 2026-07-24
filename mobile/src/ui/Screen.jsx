import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/src/theme';
import useScrolled from './useScrolled';

export default function Screen({ children, scroll = true, padded = true, edges = ['top', 'left', 'right'], background = 'background', statusBarStyle = 'dark', contentStyle, keyboardAware = false, refreshControl, header, footer, onScroll, ...rest }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bg = theme.colors[background] || background;
  const { scrolled, onScroll: trackScroll } = useScrolled();

  const inner = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: padded ? theme.layout.screenPadding : 0
        },
        // Non-scroll screens fill the height so their content can center.
        !scroll && { flex: 1 },
        contentStyle
      ]}
    >
      {children}
    </View>
  );

  const handleScroll = header
    ? e => {
        trackScroll(e);
        onScroll?.(e);
      }
    : onScroll;

  const body = scroll ? (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing['4xl'], flexGrow: 1 }} refreshControl={refreshControl} onScroll={handleScroll} scrollEventThrottle={16} {...rest}>
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }} {...rest}>
      {inner}
    </View>
  );

  // Header is capped to the same content width so it aligns with the body on
  // wide screens, but is otherwise full-bleed (it manages its own gutters).
  const headerNode = header ? (typeof header === 'function' ? header(scrolled) : header) : null;

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={statusBarStyle} />
      {headerNode ? <View style={{ width: '100%', maxWidth: theme.layout.maxContentWidth, alignSelf: 'center' }}>{headerNode}</View> : null}
      {keyboardAware ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </SafeAreaView>
  );
}
