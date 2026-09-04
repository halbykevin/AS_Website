import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme';
import { Screen, Text, Icon, Chip } from '@/src/ui';
import { Input } from '@/src/ui/Input';
import AppHeader from '@/src/components/AppHeader';
import HRail from '@/src/components/HRail';
import ProductTile from '@/src/components/ProductTile';
import { askAssistant, GREETING, SUGGESTIONS } from '@/src/lib/chat';

// The AS Store shopping assistant — the same one as the website's chat bubble,
// answering from the same endpoint with the same catalog tools (see
// src/lib/chat.js for why it is a client of that route rather than a port of it).
//
// A full screen rather than a floating bubble: a bubble would sit on the tab bar
// or on a product tile, and it is the one thing on a phone that can afford the
// whole viewport. It is reached from the sparkles button in the store header.
//
// Products the assistant found are rendered as real ProductTiles — live price,
// working Add to Bag, the same tile as everywhere else in the app. The model
// never gives us a price to print: only slugs its tools looked up.

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

let seq = 0;
const msg = (role, text, products = []) => ({ id: `m${++seq}`, role, text, products });

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([msg('model', GREETING)]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  // The thread only ever lived here, so forgetting it is the whole operation —
  // and it genuinely resets the model's context, since every request carries
  // the history this screen holds.
  const newChat = () => {
    setMessages([msg('model', GREETING)]);
    setInput('');
    setError('');
  };

  const toEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async text => {
      const question = String(text ?? input).trim();
      if (!question || busy) return;
      setInput('');
      setError('');
      const next = [...messages, msg('user', question)];
      setMessages(next);
      setBusy(true);
      toEnd();
      try {
        // The greeting is ours, not part of the conversation — don't send it.
        const history = next.slice(1).map(m => ({ role: m.role, text: m.text }));
        const { reply, products } = await askAssistant(history);
        setMessages(m => [...m, msg('model', reply, products)]);
      } catch (e) {
        setError(e.message || 'Something went wrong.');
      } finally {
        setBusy(false);
        toEnd();
      }
    },
    [busy, input, messages, toEnd]
  );

  const fresh = messages.length === 1;

  return (
    <Screen
      edges={['left', 'right']}
      scroll={false}
      padded={false}
      contentStyle={{ flex: 1 }}
      statusBarStyle="light"
      header={
        <AppHeader
          brand="store"
          title="Assistant"
          showBack
          bell={false}
          bag
          right={
            fresh ? null : (
              <Pressable onPress={newChat} hitSlop={theme.layout.hitSlop} accessibilityLabel="Start a new chat">
                <Icon name="refresh" size={20} color={theme.colors.textOnInverse} />
              </Pressable>
            )
          }
        />
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={toEnd}
          contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] }}
        >
          {messages.map(m => (
            <View key={m.id} style={{ gap: theme.spacing.md }}>
              <Bubble role={m.role} text={m.text} />
              {/* A rail rather than a grid: the answer above it is the point,
                  and a grid of eight tiles pushes it off the screen. */}
              {m.products.length > 0 ? (
                <HRail
                  data={m.products}
                  itemWidth={200}
                  edgePadding={theme.layout.screenPadding}
                  renderItem={p => <ProductTile product={p} width={200} />}
                />
              ) : null}
            </View>
          ))}

          {fresh ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {SUGGESTIONS.map(s => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          ) : null}

          {busy ? <Bubble role="model" text="Looking…" muted /> : null}

          {error ? (
            <Text variant="caption" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.sm,
            paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background
          }}
        >
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="Ask about a product, a budget, delivery…"
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => send()}
            style={{ flex: 1, maxHeight: 120 }}
          />
          <Pressable
            onPress={() => send()}
            disabled={busy || !input.trim()}
            accessibilityLabel="Send"
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: busy || !input.trim() ? theme.colors.surfaceAlt : theme.colors.primary
            }}
          >
            <Icon name="send" size={20} color={busy || !input.trim() ? theme.colors.textFaint : theme.colors.textOnPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ role, text, muted = false }) {
  const theme = useTheme();
  const mine = role === 'user';
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.xl,
        // The customer's own words in brand red, the assistant's on a neutral
        // card — the same two-tone thread the website's widget uses.
        backgroundColor: mine ? theme.colors.primary : theme.colors.surfaceAlt,
        borderBottomRightRadius: mine ? theme.radii.sm : theme.radii.xl,
        borderBottomLeftRadius: mine ? theme.radii.xl : theme.radii.sm
      }}
    >
      <Text variant="body" color={mine ? 'textOnPrimary' : 'text'} muted={muted && !mine}>
        {text}
      </Text>
    </View>
  );
}
