import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export function BackButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Volver" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.circle, disabled && { opacity: 0.5 }]}>
    <Feather name="chevron-left" size={24} color="#FFFFFF" />
  </Pressable>;
}
const s = StyleSheet.create({ circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#ffffff55', backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' } });
