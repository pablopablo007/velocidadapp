import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { Component, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/theme';

/*
 * Red de seguridad contra errores.
 *
 * En la versión final de la app, cualquier error de JavaScript que nadie
 * atrape cierra la app de golpe, sin decir nada. Con esto, en vez de
 * cerrarse, muestra qué falló (para poder mandarlo en una captura) y deja
 * reintentar. El último error también se guarda en el teléfono.
 */

const LAST_ERROR_KEY = 'velocidad.lastError.v1';

type Report = { message: string; stack: string; at: number };

let current: Report | null = null;
const listeners = new Set<(r: Report | null) => void>();

function publish(r: Report | null) {
  current = r;
  listeners.forEach((l) => l(r));
}

function toReport(error: unknown): Report {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    message: e.message || String(error),
    stack: (e.stack ?? '').split('\n').slice(0, 8).join('\n'),
    at: Date.now(),
  };
}

function save(r: Report) {
  AsyncStorage.setItem(LAST_ERROR_KEY, JSON.stringify(r)).catch(() => {});
}

type ErrorUtilsT = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
};

let installed = false;

/**
 * Reemplaza el manejador global de errores (solo en la versión final: en
 * desarrollo se deja la pantalla roja de siempre, que da más detalle).
 */
export function installCrashGuard() {
  if (installed || __DEV__) return;
  installed = true;
  const EU = (globalThis as unknown as { ErrorUtils?: ErrorUtilsT }).ErrorUtils;
  if (!EU) return;
  const previous = EU.getGlobalHandler();
  EU.setGlobalHandler((error, isFatal) => {
    const r = toReport(error);
    save(r);
    if (isFatal) {
      // No se llama al manejador anterior: en la versión final cerraría la app.
      publish(r);
    } else {
      previous(error, isFatal);
    }
  });
}

/** Errores al dibujar una pantalla: muestra el aviso en lugar de cerrarse. */
class Boundary extends Component<
  { children: React.ReactNode; onRetry: () => void },
  { error: Report | null }
> {
  state = { error: null as Report | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: toReport(error) };
  }

  componentDidCatch(error: unknown) {
    save(toReport(error));
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          report={this.state.error}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Envuelve la app. "Reintentar" vuelve a montar todo desde cero (los viajes y
 * ajustes guardados no se pierden).
 */
export function CrashGuard({ children }: { children: React.ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const [fatal, setFatal] = useState<Report | null>(current);

  useEffect(() => {
    listeners.add(setFatal);
    return () => {
      listeners.delete(setFatal);
    };
  }, []);

  const retry = () => {
    publish(null);
    setGeneration((g) => g + 1);
  };

  return (
    <View style={styles.fill}>
      <Boundary key={generation} onRetry={retry}>
        {children}
      </Boundary>
      {fatal && (
        <View style={StyleSheet.absoluteFill}>
          <ErrorScreen report={fatal} onRetry={retry} />
        </View>
      )}
    </View>
  );
}

function ErrorScreen({ report, onRetry }: { report: Report; onRetry: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Algo falló</Text>
      <Text style={styles.text}>
        La app atrapó un error en lugar de cerrarse. Toma una captura de esta pantalla y mándala para poder
        arreglarlo. Tus viajes y ajustes están a salvo.
      </Text>
      <ScrollView style={styles.box} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.message} selectable>
          {report.message}
        </Text>
        {!!report.stack && (
          <Text style={styles.stack} selectable>
            {report.stack}
          </Text>
        )}
      </ScrollView>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
        <Text style={styles.buttonText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: 90,
    paddingBottom: 50,
    gap: spacing.lg,
  },
  title: { fontSize: 26, color: colors.text, fontFamily: fonts.semibold },
  text: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  box: {
    flexGrow: 0,
    maxHeight: 320,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  message: { fontSize: 14, color: colors.danger, fontFamily: fonts.medium },
  stack: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, fontFamily: fonts.regular },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  buttonText: { fontSize: 14, color: colors.text, fontFamily: fonts.medium },
});
