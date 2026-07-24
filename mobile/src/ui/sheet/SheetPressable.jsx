// A tappable row/button for use INSIDE a sheet. Plain RN Pressable/Touchable
// don't reliably receive taps inside @gorhom/bottom-sheet's scrollables on
// Android + the new architecture (the sheet's gesture handler swallows them),
// which silently breaks controls like the filter rows. gorhom ships touchables
// wired into its gesture system for exactly this — use this everywhere a sheet
// needs a press target so taps always land.

import { TouchableOpacity } from '@gorhom/bottom-sheet';

export default function SheetPressable({ onPress, disabled = false, style, activeOpacity = 0.6, children, ...rest }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={activeOpacity} style={style} {...rest}>
      {children}
    </TouchableOpacity>
  );
}
