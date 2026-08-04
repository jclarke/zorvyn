import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, ErrorBanner, Input, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ConductorApiError } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';

const KEYS_URL = 'https://app.conductor.build/users/api-keys';
const SITE_URL = 'https://jclarke.xyz';
const X_URL = 'https://x.com/jclarke';

export default function LoginScreen() {
  const { signIn, error: bootstrapError } = useAuth();
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(bootstrapError);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(apiKey);
      router.replace('/');
    } catch (e) {
      if (e instanceof ConductorApiError) {
        setError(
          e.status === 401
            ? 'Invalid Conductor API key. Create one at app.conductor.build/users/api-keys'
            : e.status === 0
              ? e.message || 'Network error — check connection / CORS'
              : e.message,
        );
      } else {
        setError(e instanceof Error ? e.message : 'Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.wordmark}>
              <Text style={styles.logoMark}>Z/</Text>
              <Text style={styles.brandName}>ZORVYN</Text>
            </View>
            <Title>Your agents, within reach.</Title>
            <Body muted style={styles.tagline}>
              Independent client for{' '}
              <Text style={styles.em}>Conductor Cloud</Text>. Open workspaces,
              steer coding sessions, and ship from your phone or browser.
            </Body>
          </View>

          <View style={styles.form}>
            {error ? <ErrorBanner message={error} /> : null}

            <Input
              label="Conductor API key"
              placeholder="Paste your Conductor API key"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              secureTextEntry={Platform.OS !== 'web'}
              textContentType="password"
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />

            <Button
              title="Connect"
              onPress={onSubmit}
              loading={loading}
              disabled={!apiKey.trim()}
              icon="key-outline"
            />

            <Text style={styles.help}>
              Zorvyn only works with Conductor Cloud. Create a key at{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(KEYS_URL)}
              >
                app.conductor.build/users/api-keys
              </Text>
              .
            </Text>
            <Pressable onPress={() => Linking.openURL(KEYS_URL)}>
              <Text style={[styles.link, styles.helpCenter]}>
                Open key settings →
              </Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <Text style={styles.help}>
                On web, your key is stored in this browser’s local storage so
                you stay signed in.
              </Text>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Unofficial · api.conductor.build/v0
            </Text>
            <Link href="https://www.conductor.build/docs/api" asChild>
              <Text style={styles.link}>Conductor API docs</Text>
            </Link>
            <Text style={styles.footerText}>
              Not affiliated with Conductor
            </Text>

            <View style={styles.creditBlock}>
              <Text style={styles.footerText}>Created by</Text>
              <Text style={styles.creditLine}>
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL(SITE_URL)}
                >
                  Hosting Playground Inc
                </Text>
                {' · '}
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL(SITE_URL)}
                >
                  Joe Clarke
                </Text>
              </Text>
              <Pressable onPress={() => Linking.openURL(X_URL)}>
                <Text style={styles.link}>@jclarke on X</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xxl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    gap: spacing.md,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  logoMark: {
    color: colors.accent,
    fontFamily: 'SpaceMono',
    fontSize: 18,
    fontWeight: '600',
  },
  brandName: {
    color: colors.textSecondary,
    fontFamily: 'SpaceMono',
    fontSize: 12,
    letterSpacing: 1.4,
  },
  tagline: {
    lineHeight: 24,
  },
  em: {
    color: colors.text,
    fontWeight: '600',
  },
  form: {
    gap: spacing.lg,
  },
  help: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  helpCenter: {
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  creditBlock: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    width: '100%',
  },
  creditLine: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
