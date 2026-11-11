import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { colors, font, mono, radius, spacing, fonts } from '@/theme/theme';

export function GlassCard({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, padded && { padding: spacing.lg }, style]}>{children}</View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  icon,
  tint = colors.text,
  compact = false,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tint?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <View style={styles.tileLabelRow}>
        {icon && <Ionicons name={icon} size={12} color={colors.textFaint} />}
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text
          style={[styles.tileValue, { color: tint, fontSize: compact ? 20 : 24 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
        {!!unit && <Text style={styles.tileUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  tint = colors.accent,
  variant = 'solid',
  disabled = false,
  style,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  tint?: string;
  variant?: 'solid' | 'outline' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        solid && { backgroundColor: tint },
        variant === 'outline' && { borderWidth: 1.5, borderColor: tint },
        variant === 'ghost' && { backgroundColor: colors.surface },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon && (
        <Ionicons name={icon} size={18} color={solid ? colors.bg : tint} />
      )}
      <Text style={[styles.buttonLabel, { color: solid ? colors.bg : tint }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({
  label,
  hint,
  right,
  onPress,
  icon,
  danger = false,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  danger?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.accent} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {right}
      {onPress && !right && (
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      )}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Row
      label={label}
      hint={hint}
      icon={icon}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.lime, false: 'rgba(255,255,255,0.14)' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="rgba(255,255,255,0.14)"
        />
      }
    />
  );
}

export function NumberRow({
  label,
  hint,
  value,
  onChange,
  suffix,
  step,
  min = 0,
  max = 999999,
  decimals = 0,
  icon,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  // El campo mantiene su propio borrador para no reformatear lo que el usuario
  // está escribiendo. Cuando el valor cambia desde fuera (los botones +/−, o
  // restaurar los valores por defecto) se resincroniza durante el render, que
  // es el patrón recomendado para ajustar estado ante un cambio de props.
  const [draft, setDraft] = React.useState(() => formatDraft(value, decimals));
  const [syncedValue, setSyncedValue] = React.useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(formatDraft(value, decimals));
  }

  const commit = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max));
    else setDraft(formatDraft(value, decimals));
  };

  const bump = (dir: 1 | -1) => {
    if (step == null) return;
    onChange(clamp(Number((value + dir * step).toFixed(decimals)), min, max));
  };

  return (
    <Row
      label={label}
      hint={hint}
      icon={icon}
      right={
        <View style={styles.stepper}>
          {step != null && (
            <Pressable onPress={() => bump(-1)} hitSlop={8} style={styles.stepperBtn}>
              <Ionicons name="remove" size={16} color={colors.textMuted} />
            </Pressable>
          )}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            style={styles.input}
            placeholderTextColor={colors.textFaint}
          />
          {!!suffix && <Text style={styles.suffix}>{suffix}</Text>}
          {step != null && (
            <Pressable onPress={() => bump(1)} hitSlop={8} style={styles.stepperBtn}>
              <Ionicons name="add" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      }
    />
  );
}

export function TextRow({
  label,
  value,
  onChange,
  icon,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  placeholder?: string;
}) {
  return (
    <Row
      label={label}
      icon={icon}
      right={
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { minWidth: 130, textAlign: 'right' }]}
          returnKeyType="done"
        />
      }
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && { color: colors.bg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export function Badge({ label, tint = colors.accent }: { label: string; tint?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
      <Text style={[styles.badgeLabel, { color: tint }]}>{label}</Text>
    </View>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function formatDraft(v: number, decimals: number) {
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tileCompact: { paddingVertical: spacing.sm },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  tileLabel: { fontSize: 11, fontWeight: '500', color: colors.textMuted, flexShrink: 1 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tileValue: { fontFamily: fonts.medium, letterSpacing: -0.5 },
  tileUnit: { fontSize: 11, color: colors.textFaint, fontWeight: '600' },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  buttonLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    minHeight: 54,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { ...font.body, color: colors.text },
  rowHint: { fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 15,
    minWidth: 54,
    textAlign: 'center',
    paddingVertical: 4,
  },
  suffix: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.text },
  segmentLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...font.title, color: colors.text, textAlign: 'center' },
  emptyMessage: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
