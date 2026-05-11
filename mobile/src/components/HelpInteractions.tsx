import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHelpTheme, SUPPORT_COPY, type SupportCopyKey } from '../lib/helpTheme';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

export function useIdlePulse(onIdle?: () => void) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
      onIdle?.();
    }, IDLE_TIMEOUT_MS);
  }, [onIdle]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { isIdle, resetTimer };
}

export function FadeInView({
  children,
  delay = 0,
  duration = 300,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: any;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        style,
        { opacity: fadeAnim, transform: [{ translateY: translateAnim }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function IdlePulseContactButton({ isIdle }: { isIdle: boolean }) {
  const { colors } = useHelpTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isIdle) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.04,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
      pulseAnim.setValue(1);
      glowAnim.setValue(0);
    }

    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
      }
    };
  }, [isIdle]);

  const handlePress = () => {
    Linking.openURL('mailto:support@myvoicepost.com?subject=App Support Request').catch(() => {
      Alert.alert('Email Not Available', 'Please contact us at support@myvoicepost.com');
    });
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  return (
    <View style={styles.contactContainer}>
      {isIdle && (
        <Animated.View
          style={[
            styles.glowRing,
            {
              backgroundColor: colors.brandAccent,
              opacity: glowOpacity,
            },
          ]}
        />
      )}
      <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
        <TouchableOpacity
          style={[styles.contactButton, { backgroundColor: colors.brandAccent }]}
          onPress={handlePress}
          activeOpacity={0.8}
          data-testid="button-idle-contact-support"
        >
          <View style={styles.contactButtonContent}>
            <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
            <View style={styles.contactButtonTextWrap}>
              <Text style={styles.contactButtonTitle}>Need a hand?</Text>
              <Text style={styles.contactButtonSub}>Our team is ready to help</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export function EmpathyMessage({
  copyKey,
  onAction,
}: {
  copyKey: SupportCopyKey;
  onAction?: () => void;
}) {
  const { colors } = useHelpTheme();
  const copy = SUPPORT_COPY[copyKey];

  return (
    <FadeInView>
      <View style={[styles.empathyCard, { backgroundColor: colors.cardSurface, borderColor: colors.border }]}>
        <View style={[styles.empathyIcon, { backgroundColor: `${colors.warning}18` }]}>
          <Ionicons name="heart-outline" size={20} color={colors.warning} />
        </View>
        <View style={styles.empathyContent}>
          <Text style={[styles.empathyTitle, { color: colors.textPrimary }]}>{copy.title}</Text>
          <Text style={[styles.empathyBody, { color: colors.textSecondary }]}>{copy.body}</Text>
          {onAction && (
            <TouchableOpacity
              style={[styles.empathyAction, { backgroundColor: `${colors.brandAccent}18` }]}
              onPress={onAction}
              activeOpacity={0.7}
            >
              <Text style={[styles.empathyActionText, { color: colors.brandAccent }]}>{copy.action}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  contactContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    top: -4,
    left: 12,
    right: 12,
    bottom: -4,
    borderRadius: 24,
  },
  contactButton: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  contactButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactButtonTextWrap: {
    flex: 1,
  },
  contactButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  contactButtonSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  empathyCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    alignItems: 'flex-start',
  },
  empathyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  empathyContent: {
    flex: 1,
    gap: 6,
  },
  empathyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  empathyBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  empathyAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    marginTop: 4,
  },
  empathyActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
