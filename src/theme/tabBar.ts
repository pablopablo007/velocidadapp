import { Platform, StyleSheet, ViewStyle } from 'react-native';

import { colors } from '@/theme/theme';

/**
 * Estilo de la barra de pestañas. Vive aparte porque la cabina la oculta en
 * horizontal (tablero a pantalla completa) y tiene que poder restaurarla igual.
 */
export const TAB_BAR_STYLE: ViewStyle = {
  position: 'absolute',
  borderTopColor: colors.border,
  borderTopWidth: StyleSheet.hairlineWidth,
  backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgElevated,
  elevation: 0,
};

export const TAB_BAR_HIDDEN: ViewStyle = { display: 'none' };
