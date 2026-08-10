// Error containment: keep one broken piece from taking the whole app with it.
//
// React unmounts the entire tree when a render throws and nothing catches it —
// one bad product image URL, one API field that came back null, and the customer
// gets a blank screen instead of the app. A boundary stops that at whatever
// depth you put it: everything outside keeps working normally.
//
// Two sizes, because the right blast radius differs:
//
//   <Boundary>          wraps a *section* — a rail, a banner, a card. Fails to a
//                       small inline notice; the rest of the screen is untouched
//                       and the customer may not even need to care. Pass
//                       `fallback={null}` for decorative sections that should
//                       just disappear instead.
//   ScreenBoundary      exported as a route's `ErrorBoundary`. Fails the screen
//                       but keeps navigation alive, so the tab bar still works
//                       and they can walk away from the broken screen.
//
// The root layout's CrashScreen stays the last resort under both of these, and
// `installGlobalErrorHandler` in src/lib/errors.js covers what neither can see:
// errors thrown outside of render.
//
// Retry works by remounting the subtree under a new `key`: React deliberately
// gives you no way to "un-throw", so a fresh mount is the only real reset. That
// makes it worth retrying — most of these errors come from data that was
// momentarily wrong, and the refetch behind the remount usually fixes it.

import { Component, Fragment } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/src/theme';
import { Text, Card, Icon, Button } from '@/src/ui';
import { reportError } from '@/src/lib/errors';

function SectionFallback({ label, onRetry }) {
  const theme = useTheme();
  return (
    <Card style={{ backgroundColor: theme.colors.surfaceAlt, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="alert" size={18} color={theme.colors.textFaint} />
        <Text variant="callout" muted style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      <Button label="Try again" variant="ghost" size="sm" onPress={onRetry} />
    </Card>
  );
}

function ScreenFallback({ onRetry }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing['3xl'], gap: theme.spacing.md, backgroundColor: theme.colors.background }}>
      <Icon name="alert" size={40} color={theme.colors.textFaint} />
      <Text variant="h3" center>
        This screen didn&apos;t load
      </Text>
      <Text variant="callout" muted center>
        Something went wrong here. The rest of the app is fine — try again, or head back and come at it fresh.
      </Text>
      <Button label="Try again" onPress={onRetry} style={{ marginTop: theme.spacing.sm }} />
    </View>
  );
}

export default class Boundary extends Component {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // `name` tells you *which* boundary caught it, which is most of the work of
    // finding it — the componentStack alone is unreadable in a release build.
    reportError(error, { boundary: this.props.name || 'unnamed', componentStack: info?.componentStack });
    this.props.onError?.(error, info);
  }

  retry = () => this.setState(s => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    const { children, fallback, label = "This section didn't load.", screen = false } = this.props;

    if (this.state.failed) {
      // `in` rather than a truthy check, so `fallback={null}` means "fail
      // silently" — the right answer for decorative sections like a promo
      // banner, where an error notice is more intrusive than the thing it
      // replaced. A truthy check would quietly turn that into the default card.
      if ('fallback' in this.props) return typeof fallback === 'function' ? fallback(this.retry) : fallback;
      return screen ? <ScreenFallback onRetry={this.retry} /> : <SectionFallback label={label} onRetry={this.retry} />;
    }
    // A keyed Fragment, not a View: remounting under a new key is what actually
    // clears the failed state (reusing the subtree would just throw again on the
    // same bad input), while a Fragment adds no layout node. A wrapper View
    // would silently change the parent's layout — inside a `gap` column it
    // occupies a slot even when the child renders nothing, leaving a visible
    // hole wherever a section legitimately hides itself.
    return <Fragment key={this.state.attempt}>{children}</Fragment>;
  }
}

// Route-level boundary. Expo Router calls this with `{ error, retry }`, but the
// class above owns its own retry, so this just adapts the shape.
export function ScreenBoundary({ retry }) {
  return <ScreenFallback onRetry={retry} />;
}
