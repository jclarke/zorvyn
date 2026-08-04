import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { AgentPicker, type AgentConfig } from '@/components/AgentPicker';
import {
  Body,
  Button,
  ErrorBanner,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import { DEFAULT_EFFORT, DEFAULT_MODEL } from '@/lib/models';
import { colors, spacing } from '@/lib/theme';

export default function CreateSessionScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const client = useClient();
  const router = useRouter();
  const navigation = useNavigation();

  const [config, setConfig] = useState<AgentConfig>({
    agent: 'claude',
    model: DEFAULT_MODEL.claude,
    effort: DEFAULT_EFFORT.claude,
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityState={{ disabled: loading }}
          style={{ opacity: loading ? 0.4 : 1, paddingHorizontal: 4 }}
        >
          <Text style={styles.headerCancel}>Cancel</Text>
        </Pressable>
      ),
      gestureEnabled: !loading,
    });
  }, [navigation, router, loading]);

  async function onCreate() {
    if (!workspaceId) {
      setError('Missing workspaceId');
      return;
    }
    if (!client) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const session = await client.createSession({
        workspaceId,
        agent: config.agent,
        model: config.model,
        effort: config.effort,
        fastMode: config.fastMode,
        name: config.name?.trim() || undefined,
      });

      router.replace({
        pathname: '/session/[id]',
        params: {
          id: session.id,
          workspaceId,
          name: session.name || config.name || '',
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Body muted>
            Add another agent chat to this workspace. If the workspace is still
            initializing, the session is accepted and starts on first message.
          </Body>

          {error ? <ErrorBanner message={error} /> : null}

          <SectionHeader title="Agent config" />
          <AgentPicker
            value={config}
            onChange={setConfig}
            showName
            nameLabel="Session name"
          />

          <Button
            title="Create session"
            icon="chatbubble-ellipses-outline"
            onPress={onCreate}
            loading={loading}
          />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => router.back()}
            disabled={loading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  headerCancel: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '400',
  },
});
