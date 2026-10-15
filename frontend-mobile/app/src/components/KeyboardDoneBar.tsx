import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, TOUCH } from '../theme';

/** Altura del teclado en iOS (el teclado decimal no trae tecla Return). 0 en Android. */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const shown = Keyboard.addListener('keyboardWillShow', (e) => setHeight(e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

/** Barra "Listo" sobre el teclado para cerrarlo (mismo patrón y testID que el formulario de factura). */
export function KeyboardDoneBar({ keyboardHeight }: { keyboardHeight: number }) {
  if (keyboardHeight <= 0) return null;
  return (
    <View style={[s.bar, { bottom: keyboardHeight }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar teclado"
        testID="keyboard-done"
        onPress={() => Keyboard.dismiss()}
        style={s.done}
      >
        <Text style={s.doneText}>Listo</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  done: { minHeight: TOUCH, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  doneText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
