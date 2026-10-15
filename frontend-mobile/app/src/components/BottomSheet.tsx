import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { TextAction } from './Button';

/**
 * ERD-UI-KIT: hoja inferior modal. `accessibilityViewIsModal` aísla el contenido del fondo para el lector de pantalla,
 * el botón «atrás» de Android y tocar el fondo la cierran (salvo `dismissible={false}` con una acción en curso) y siempre
 * hay un botón «Cerrar» visible (no depende de un gesto). No verificado en dispositivo.
 */
export function BottomSheet({ visible, title, onClose, dismissible = true, children, testID = 'bottom-sheet' }: {
  visible: boolean; title: string; onClose: () => void; dismissible?: boolean; children: ReactNode; testID?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (dismissible) onClose(); }} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.backdrop} accessibilityLabel="Cerrar" accessibilityRole="button" onPress={() => { if (dismissible) onClose(); }} testID={`${testID}-backdrop`} />
        <View style={s.sheet} accessibilityViewIsModal testID={testID}>
          <View style={s.header}>
            <Text style={s.title} accessibilityRole="header">{title}</Text>
            <TextAction title="Cerrar" tone="muted" onPress={() => { if (dismissible) onClose(); }} testID={`${testID}-close`} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg ?? radius.md, borderTopRightRadius: radius.lg ?? radius.md, maxHeight: '85%', paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
