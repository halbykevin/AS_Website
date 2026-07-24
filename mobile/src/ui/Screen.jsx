// The layout primitive every screen builds on. Handles safe-area insets, the
// standard horizontal gutter, an optional scroll view, a max content width (so
// text lines never over-stretch on tablets/web), and a themed status bar.
//
//   <Screen scroll>…</Screen>                     // padded, scrollable
//   <Screen scroll={false} padded={false}>…</Screen>  // full-bleed (hero pages)

import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useTheme } from '@/src/theme'

export default function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top', 'left', 'right'],
  background = 'background',
  statusBarStyle = 'dark',
  contentStyle,
  keyboardAware = false,
  refreshControl,
  footer,
  ...rest
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const bg = theme.colors[background] || background

  const inner = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: padded ? theme.layout.screenPadding : 0,
        },
        // Non-scroll screens fill the height so their content can center.
        !scroll && { flex: 1 },
        contentStyle,
      ]}
    >
      {children}
    </View>
  )

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: theme.spacing['4xl'], flexGrow: 1 }}
      refreshControl={refreshControl}
      {...rest}
    >
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }} {...rest}>
      {inner}
    </View>
  )

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={statusBarStyle} />
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </SafeAreaView>
  )
}
