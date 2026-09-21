// The store's search, on the front door of the app.
//
// Home had no way into search at all: you had to already be on the Shop tab and
// find the magnifier in its header. The catalogue is ~1,400 products — far too
// many to browse for something a customer can already name — so the box is the
// first thing under the logo, and it answers while they type rather than
// waiting for a submit.
//
// It calls /api/search/suggest, the same endpoint the website's search dialog
// calls, which returns the ranked products plus the matching categories and
// brands in ONE round trip. Three requests per keystroke is a phone's battery,
// and two clients ranking the same catalogue by two sets of rules is two
// answers to the same question.
//
// Layout: the bar AND its panel live in the screen's fixed header, above the
// scroll view rather than inside it. A dropdown positioned absolutely over the
// body gets clipped on Android, and one that scrolls away with the content is
// not a dropdown — so the panel is a real laid-out block that the home content
// makes room for, capped so it can never take the whole screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme, useThemedStyles } from '@/src/theme';
import { Text, Icon } from '@/src/ui';
import RemoteImage from '@/src/components/RemoteImage';
import { useCategories, useStoreSettings, useSuggestions } from '@/src/lib/queries';
import { EMPTY_RESULT, MIN_QUERY, clearRecent, normalizeQuery, pushRecent, queryTokens, readRecent } from '@/src/lib/search';
import { isCallForPrice, callForPriceCopy } from '@/src/lib/callForPrice';
import { money } from '@/src/lib/format';

// Long enough that a fast typist sends one request per word rather than one per
// letter; short enough that the list feels like it is keeping up. Matches the
// website's dialog.
const DEBOUNCE_MS = 180;
const LIMIT = 6;

// The panel can squeeze the home content but must never swallow the screen: on
// a phone with the keyboard up there is roughly 55% of the height left, and the
// bar and app header have already taken part of it.
const PANEL_RATIO = 0.42;
const PANEL_MAX = 360;

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Marks the words actually typed inside a result — the trick that makes a list
// of near-identical product names scannable. Longest tokens first so "wheel"
// wins over "whe" when both are present. The nested Text inherits the parent's
// size from the same variant; only weight and colour change, because a match
// that also changed the line height would reflow the row as you type.
function Highlight({ text, query, variant = 'body', numberOfLines, muted = false, style }) {
  const value = String(text ?? '');
  const tokens = queryTokens(query);
  const parts = useMemo(() => {
    if (!value || !tokens.length) return null;
    const re = new RegExp(
      `(${[...tokens]
        .sort((a, b) => b.length - a.length)
        .map(escapeRe)
        .join('|')})`,
      'gi'
    );
    // split() with a capture group interleaves plain text and matches, so every
    // odd index is a match.
    return value.split(re);
  }, [value, tokens.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!parts) {
    return (
      <Text variant={variant} muted={muted} numberOfLines={numberOfLines} style={style}>
        {value}
      </Text>
    );
  }
  return (
    <Text variant={variant} muted={muted} numberOfLines={numberOfLines} style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} variant={variant} color="primary" weight="semibold">
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

// A value that lags behind by `ms` of quiet. The box stays perfectly responsive
// — only the request waits.
function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/* ---- Rows --------------------------------------------------------------- */

function Row({ onPress, children, style }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} android_ripple={{ borderless: false }} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, style]}>
      {children}
    </Pressable>
  );
}

function Thumb({ uri, icon = 'box' }) {
  const styles = useThemedStyles(makeStyles);
  // Product photography is shot on white, so the tile behind it is white too —
  // see `productMedia` in the tokens.
  return <RemoteImage uri={uri} style={styles.thumb} contentFit="contain" fallbackIcon={icon} radius={12} />;
}

function ProductRow({ product, query, onPress }) {
  const styles = useThemedStyles(makeStyles);
  const { data: settings } = useStoreSettings();
  const price = Number(product.price) || 0;
  const oldPrice = product.oldPrice ? Number(product.oldPrice) : null;
  const onSale = Boolean(oldPrice) && oldPrice > price;
  const meta = [product.brand, product.category].filter(Boolean).join(' · ');
  return (
    <Row onPress={onPress}>
      <Thumb uri={product.image} />
      <View style={styles.rowBody}>
        <Highlight text={product.name} query={query} variant="callout" numberOfLines={1} />
        {meta ? <Highlight text={meta} query={query} variant="caption" muted numberOfLines={1} style={{ marginTop: 1 }} /> : null}
      </View>
      {/* A price-hidden product carries no price at all — money(null) would
          print "$0" and quietly undo the whole point of the flag. */}
      {isCallForPrice(product) ? (
        <Text variant="caption" color="primary" numberOfLines={1}>
          {callForPriceCopy(settings).label}
        </Text>
      ) : (
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="callout" color={onSale ? 'primary' : 'text'}>
            {money(price)}
          </Text>
          {onSale ? (
            <Text variant="caption" faint style={{ textDecorationLine: 'line-through' }}>
              {money(oldPrice)}
            </Text>
          ) : null}
        </View>
      )}
    </Row>
  );
}

function FacetRow({ item, query, icon, onPress }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const count = Number(item.productCount);
  return (
    <Row onPress={onPress}>
      <Thumb uri={item.image} icon={icon} />
      <View style={styles.rowBody}>
        <Highlight text={item.name} query={query} variant="callout" numberOfLines={1} />
        {Number.isFinite(count) && count > 0 ? (
          <Text variant="caption" faint>
            {count} product{count === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={16} color={theme.colors.textFaint} />
    </Row>
  );
}

function SectionLabel({ children, action }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionLabel}>
      <Text variant="overline" faint>
        {String(children).toUpperCase()}
      </Text>
      {action}
    </View>
  );
}

function SkeletonRow() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={[styles.thumb, styles.skeleton]} />
      <View style={styles.rowBody}>
        <View style={[styles.skeleton, { height: 10, width: '65%', borderRadius: 4 }]} />
        <View style={[styles.skeleton, { height: 8, width: '35%', borderRadius: 4, marginTop: 6 }]} />
      </View>
    </View>
  );
}

/* ---- The box ------------------------------------------------------------ */

export default function HomeSearch() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { height } = useWindowDimensions();
  const inputRef = useRef(null);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState([]);

  const term = normalizeQuery(q);
  const debounced = useDebounced(term, DEBOUNCE_MS);
  const searching = term.length >= MIN_QUERY;

  const { data, isError, isFetching, refetch } = useSuggestions(debounced, LIMIT);
  const { data: categories = [] } = useCategories();

  useEffect(() => {
    readRecent().then(setRecent);
  }, []);

  const result = searching && data ? data : EMPTY_RESULT;
  // Still catching up: either the request is in flight, or the debounce hasn't
  // released the latest keystroke yet. Both are "typing", and the previous
  // results stay on screen underneath rather than blanking.
  const settling = searching && (isFetching || debounced !== term);

  const popular = useMemo(() => categories.filter(c => c.visible !== false && !c.parentId).slice(0, 6), [categories]);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  // Remembering is fire-and-forget: a write to AsyncStorage must not sit
  // between a tap and the screen it opens.
  const remember = useCallback(text => {
    if (normalizeQuery(text)) pushRecent(text).then(setRecent);
  }, []);

  const go = useCallback(
    (href, text) => {
      remember(text);
      close();
      router.push(href);
    },
    [close, remember]
  );

  const submit = () => {
    if (!term) return;
    go(`/search?q=${encodeURIComponent(term)}`, term);
  };

  const hasResults = result.products.length > 0 || result.categories.length > 0 || result.brands.length > 0;
  const showPanel = open || searching;
  const panelMax = Math.min(height * PANEL_RATIO, PANEL_MAX);

  // Android's back closes the search before anything else. Home is the one
  // screen where back means "leave the app" (see useConfirmExit), so without
  // this the first press with the panel open asks whether to close AS Company
  // — while the thing the customer wanted to dismiss is still on screen. The
  // listener is registered only while the panel is up, which also makes it the
  // most recent one and therefore the first to be asked.
  useEffect(() => {
    if (!showPanel || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [showPanel, close]);

  return (
    <View style={[styles.wrap, showPanel && styles.wrapOpen]}>
      <View style={styles.barRow}>
        <View style={styles.bar}>
          {settling ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ width: 18 }} /> : <Icon name="search" size={18} color={theme.colors.textFaint} />}
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            onFocus={() => setOpen(true)}
            onSubmitEditing={submit}
            // Short enough to survive a 320pt screen without being clipped —
            // the panel says what else it searches the moment it opens.
            placeholder="Search products, brands…"
            placeholderTextColor={theme.colors.textFaint}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search the AS Store"
            style={styles.input}
          />
          {q ? (
            <Pressable
              onPress={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              hitSlop={theme.layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={18} color={theme.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {showPanel ? (
          <Pressable onPress={close} hitSlop={theme.layout.hitSlop} accessibilityRole="button" accessibilityLabel="Close search">
            <Text variant="callout" color="primary">
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* The panel deliberately stays up when the field loses focus: closing on
          blur would unmount the row that the tap causing the blur was headed
          for. It closes on Cancel, or when a row has been opened. */}
      {showPanel ? (
        <ScrollView style={{ maxHeight: panelMax }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {searching ? (
            isError && !hasResults ? (
              <View style={styles.message}>
                <Text variant="callout" muted center>
                  Search is unavailable right now.
                </Text>
                <Pressable onPress={() => refetch()} hitSlop={theme.layout.hitSlop} style={{ marginTop: theme.spacing.sm }}>
                  <Text variant="callout" color="primary" center>
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : !hasResults && settling ? (
              [0, 1, 2].map(i => <SkeletonRow key={i} />)
            ) : !hasResults ? (
              <View style={styles.message}>
                <Icon name="search" size={26} color={theme.colors.textFaint} />
                <Text variant="callout" center style={{ marginTop: theme.spacing.sm }}>
                  No results for “{term}”
                </Text>
                <Text variant="caption" faint center style={{ marginTop: 2 }}>
                  Check the spelling, or try a broader word like the brand or category.
                </Text>
                {popular.length > 0 ? (
                  <View style={styles.chips}>
                    {popular.map(c => (
                      <Pressable key={c.id} onPress={() => go(`/category/${c.slug}`, term)} style={styles.chip}>
                        <Text variant="caption" muted>
                          {c.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                {result.products.map(p => (
                  <ProductRow key={`p:${p.id}`} product={p} query={result.query} onPress={() => go(p.slug ? `/product/${p.slug}` : `/search?q=${encodeURIComponent(term)}`, term)} />
                ))}

                {result.categories.length > 0 ? (
                  <>
                    <SectionLabel>Categories</SectionLabel>
                    {result.categories.map(c => (
                      <FacetRow key={`c:${c.id}`} item={c} query={result.query} icon="grid" onPress={() => go(`/category/${c.slug}`, term)} />
                    ))}
                  </>
                ) : null}

                {/* A brand has no page of its own in the app — the shop's brand
                    filter isn't addressable — so tapping one runs it as a
                    search, which the API already ranks by brand match. */}
                {result.brands.length > 0 ? (
                  <>
                    <SectionLabel>Brands</SectionLabel>
                    {result.brands.map(b => (
                      <FacetRow key={`b:${b.id}`} item={b} query={result.query} icon="tag" onPress={() => go(`/search?q=${encodeURIComponent(b.name)}`, b.name)} />
                    ))}
                  </>
                ) : null}

                <Row onPress={submit}>
                  <View style={styles.rowBody}>
                    <Text variant="callout" color="primary">
                      See all {result.total} result{result.total === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Icon name="arrowRight" size={16} color={theme.colors.primary} />
                </Row>
              </>
            )
          ) : (
            <>
              {recent.length > 0 ? (
                <>
                  <SectionLabel
                    action={
                      <Pressable onPress={() => clearRecent().then(setRecent)} hitSlop={theme.layout.hitSlop} accessibilityRole="button" accessibilityLabel="Clear recent searches">
                        <Text variant="caption" faint>
                          Clear
                        </Text>
                      </Pressable>
                    }
                  >
                    Recent searches
                  </SectionLabel>
                  {recent.map(text => (
                    <Row key={`r:${text}`} onPress={() => go(`/search?q=${encodeURIComponent(text)}`, text)}>
                      <Icon name="history" size={18} color={theme.colors.textFaint} style={{ width: 44, textAlign: 'center' }} />
                      <View style={styles.rowBody}>
                        <Text variant="callout" numberOfLines={1}>
                          {text}
                        </Text>
                      </View>
                      <Icon name="arrowRight" size={16} color={theme.colors.textFaint} />
                    </Row>
                  ))}
                </>
              ) : null}

              {popular.length > 0 ? (
                <>
                  <SectionLabel>Browse categories</SectionLabel>
                  {popular.map(c => (
                    <FacetRow key={`c:${c.id}`} item={c} icon="grid" onPress={() => go(`/category/${c.slug}`)} />
                  ))}
                </>
              ) : (
                <View style={styles.message}>
                  <Text variant="caption" faint center>
                    Start typing to search the store.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const makeStyles = t => ({
  wrap: {
    backgroundColor: t.colors.background,
    paddingHorizontal: t.layout.screenPadding,
    paddingBottom: t.spacing.sm
  },
  // Only once something is under it: a hairline under a bare search bar would
  // read as a second header border.
  wrapOpen: { borderBottomWidth: 1, borderBottomColor: t.colors.border },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    height: 44,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radii.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceAlt
  },
  input: {
    flex: 1,
    padding: 0,
    fontSize: 15,
    color: t.colors.text
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.sm
  },
  rowPressed: { opacity: 0.6 },
  rowBody: { flex: 1, minWidth: 0 },
  thumb: { width: 44, height: 44, backgroundColor: t.colors.productMedia, borderWidth: 1, borderColor: t.colors.border },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: t.spacing.md,
    paddingBottom: 2
  },
  skeleton: { backgroundColor: t.colors.skeleton },
  message: { paddingVertical: t.spacing['2xl'], alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.spacing.sm, marginTop: t.spacing.lg },
  chip: {
    borderRadius: t.radii.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6
  }
});
