// Guards the Android back gesture against closing the app by accident.
//
// On Android, "back" at the root of the navigation tree exits the app outright.
// With gesture navigation that is an edge swipe — the same motion used to scroll
// a carousel or dismiss a sheet — so it gets triggered by mistake constantly,
// and the app dies mid-basket. This intercepts that one case and asks first.
//
// Android only, deliberately: iOS has no hardware back and its edge swipe never
// closes an app, so `hardwareBackPress` simply never fires there. The hook
// no-ops rather than pretending to be cross-platform.
//
// It only ever intercepts when there is genuinely nothing to go back to. If the
// navigator can still pop — a pushed screen, or tab history to unwind — the
// handler returns false and lets React Navigation do its normal thing, so this
// never gets in the way of ordinary back navigation.

import { useCallback, useRef } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';

export default function useConfirmExit({
  enabled = true,
  title = 'Close AS Company?',
  message = 'You are about to leave the app.',
  confirmLabel = 'Close',
  cancelLabel = 'Stay'
} = {}) {
  const navigation = useNavigation();
  // A second back press while the dialog is up must not stack another one.
  const asking = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || Platform.OS !== 'android') return undefined;

      const settle = () => {
        asking.current = false;
      };

      const onBack = () => {
        if (navigation.canGoBack?.()) return false; // not the exit case
        if (asking.current) return true;
        asking.current = true;

        Alert.alert(
          title,
          message,
          [
            { text: cancelLabel, style: 'cancel', onPress: settle },
            { text: confirmLabel, style: 'destructive', onPress: () => { settle(); BackHandler.exitApp(); } }
          ],
          // Tapping outside or pressing back again dismisses without exiting.
          { cancelable: true, onDismiss: settle }
        );

        return true; // handled — do not let Android close the app
      };

      // RN 0.81 has no BackHandler.removeEventListener; the subscription owns it.
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => {
        settle();
        sub.remove();
      };
    }, [enabled, navigation, title, message, confirmLabel, cancelLabel])
  );
}
