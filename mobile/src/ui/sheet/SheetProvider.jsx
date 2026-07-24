import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme';
import SheetScaffold from './SheetScaffold';
import Button from '../Button';
import Text from '../Text';
import Icon from '../Icon';

// Two contexts on purpose:
//  • SheetContext     — the public imperative api (open/close/…). Provided HIGH,
//    above BottomSheetModalProvider, so even sheet content that gorhom renders
//    through its PORTAL (which re-mounts under the modal provider) can still call
//    useSheet(). This is the whole reason for the split.
//  • SheetHostContext — the live stack, consumed by <SheetHost/> which must live
//    INSIDE BottomSheetModalProvider (BottomSheetModal requires that context).
const SheetContext = createContext(null);
const SheetHostContext = createContext(null);

let SEQ = 0;
const nextId = () => `sheet-${++SEQ}`;

export function SheetProvider({ children }) {
  const [stack, setStack] = useState([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const remove = useCallback(id => {
    setStack(s => s.filter(x => x.id !== id));
  }, []);

  const open = useCallback(descriptor => {
    const id = descriptor?.id || nextId();
    setStack(s => [...s, { ...descriptor, id }]);
    return id;
  }, []);

  const close = useCallback(id => {
    setStack(s => {
      if (!s.length) return s;
      const target = id || s[s.length - 1].id;
      return s.map(x => (x.id === target ? { ...x, _dismiss: (x._dismiss || 0) + 1 } : x));
    });
  }, []);

  const closeAll = useCallback(() => {
    setStack(s => s.map(x => ({ ...x, _dismiss: (x._dismiss || 0) + 1 })));
  }, []);

  // ---- Convenience overlays built on open() ----------------------------------

  const alert = useCallback(
    ({ title, message, confirmLabel = 'OK', icon, tone = 'primary' } = {}) =>
      new Promise(resolve => {
        open({
          variant: 'modal',
          onDismiss: () => resolve(),
          render: ({ close: c }) => <Dialog title={title} message={message} icon={icon} tone={tone} actions={[{ label: confirmLabel, variant: 'primary', onPress: () => c() }]} />
        });
      }),
    [open]
  );

  const confirm = useCallback(
    ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, icon } = {}) =>
      new Promise(resolve => {
        let result = false;
        open({
          variant: 'modal',
          onDismiss: () => resolve(result),
          render: ({ close: c }) => (
            <Dialog
              title={title}
              message={message}
              icon={icon}
              tone={destructive ? 'danger' : 'primary'}
              actions={[
                { label: cancelLabel, variant: 'ghost', onPress: () => c() },
                {
                  label: confirmLabel,
                  variant: destructive ? 'danger' : 'primary',
                  onPress: () => {
                    result = true;
                    c();
                  }
                }
              ]}
            />
          )
        });
      }),
    [open]
  );

  // An iOS-style action sheet: a titled list of tappable actions.
  const actions = useCallback(
    ({ title, message, actions: items = [] } = {}) =>
      new Promise(resolve => {
        let picked = null;
        open({
          onDismiss: () => resolve(picked),
          render: ({ close: c }) => (
            <SheetScaffold title={title} subtitle={message} onClose={c}>
              <View style={{ paddingTop: 4 }}>
                {items.map((it, i) => (
                  <ActionRow
                    key={it.id || i}
                    item={it}
                    onPress={() => {
                      picked = it.id ?? i;
                      it.onPress?.();
                      c();
                    }}
                  />
                ))}
              </View>
            </SheetScaffold>
          )
        });
      }),
    [open]
  );

  const api = useMemo(() => ({ open, close, closeAll, alert, confirm, actions }), [open, close, closeAll, alert, confirm, actions]);
  const host = useMemo(() => ({ stack, remove }), [stack, remove]);

  return (
    <SheetContext.Provider value={api}>
      <SheetHostContext.Provider value={host}>{children}</SheetHostContext.Provider>
    </SheetContext.Provider>
  );
}

// Renders the live sheet stack. MUST be mounted inside <BottomSheetModalProvider>
// (and inside <SheetProvider>) — place it right under the modal provider.
export function SheetHost() {
  const ctx = useContext(SheetHostContext);
  if (!ctx) return null;
  return ctx.stack.map(descriptor => <DynamicSheet key={descriptor.id} descriptor={descriptor} onClosed={() => ctx.remove(descriptor.id)} />);
}

export function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet must be used within <SheetProvider>');
  return ctx;
}

function DynamicSheet({ descriptor, onClosed }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef(null);
  const dismissSeen = useRef(descriptor._dismiss || 0);

  const { variant = 'sheet', snapPoints, render, content, dismissible = true, enablePanDownToClose = true, showHandle = true, backdropOpacity = 0.45, maxHeight = 0.92, onDismiss } = descriptor;

  const detached = variant === 'modal';

  useEffect(() => {
    ref.current?.present();
  }, []);

  useEffect(() => {
    if ((descriptor._dismiss || 0) > dismissSeen.current) {
      dismissSeen.current = descriptor._dismiss;
      ref.current?.dismiss();
    }
  }, [descriptor._dismiss]);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
    onClosed();
  }, [onDismiss, onClosed]);

  const close = useCallback(() => ref.current?.dismiss(), []);

  const renderBackdrop = useCallback(props => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={backdropOpacity} pressBehavior={dismissible ? 'close' : 'none'} />, [backdropOpacity, dismissible]);

  const resolvedSnapPoints = variant === 'fullscreen' ? ['92%'] : snapPoints;
  const dynamic = !resolvedSnapPoints;

  const body = render ? render({ close }) : content;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={resolvedSnapPoints}
      enableDynamicSizing={dynamic}
      maxDynamicContentSize={Math.round((windowHeight - insets.top) * maxHeight)}
      index={0}
      onDismiss={handleDismiss}
      enablePanDownToClose={enablePanDownToClose}
      handleComponent={showHandle ? undefined : null}
      backdropComponent={renderBackdrop}
      detached={detached}
      bottomInset={detached ? insets.bottom + theme.spacing.lg : 0}
      style={detached ? { marginHorizontal: theme.spacing.lg } : undefined}
      backgroundStyle={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii['3xl'] }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.borderStrong, width: 40 }}
      topInset={insets.top}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {dynamic ? <BottomSheetView>{body}</BottomSheetView> : body}
    </BottomSheetModal>
  );
}

function Dialog({ title, message, icon, tone = 'primary', actions = [] }) {
  const theme = useTheme();
  const toneColor = tone === 'danger' ? theme.colors.danger : theme.colors.primary;
  return (
    <View style={{ padding: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.md }}>
      {icon ? (
        <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.alpha(toneColor, 0.12), alignSelf: 'center' }}>
          <Icon name={icon} size={26} color={toneColor} />
        </View>
      ) : null}
      {title ? (
        <Text variant="h3" center>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text variant="body" muted center>
          {message}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        {actions.map((a, i) => (
          <Button key={i} label={a.label} variant={a.variant} onPress={a.onPress} style={{ flex: 1 }} />
        ))}
      </View>
    </View>
  );
}

function ActionRow({ item, onPress }) {
  const theme = useTheme();
  const danger = item.tone === 'danger';
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }, pressed && { opacity: 0.6 }]}>
      {item.icon ? <Icon name={item.icon} size={22} color={color} /> : null}
      <Text variant="title" color={danger ? 'danger' : 'text'} style={{ flex: 1 }}>
        {item.label}
      </Text>
      {item.selected ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}
    </Pressable>
  );
}
