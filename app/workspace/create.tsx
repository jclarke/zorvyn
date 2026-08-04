import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AgentPicker, type AgentConfig } from '@/components/AgentPicker';
import {
  Body,
  Button,
  ErrorBanner,
  Input,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import { DEFAULT_EFFORT, DEFAULT_MODEL } from '@/lib/models';
import { colors, spacing } from '@/lib/theme';

export default function CreateWorkspaceScreen() {
  const { projectId, projectName } = useLocalSearchParams<{
    projectId?: string;
    projectName?: string;
  }>();
  const client = useClient();
  const router = useRouter();
  const navigation = useNavigation();

  const [mode, setMode] = useState<'project' | 'url'>(
    projectId ? 'project' : 'project',
  );
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [config, setConfig] = useState<AgentConfig>({
    agent: 'claude',
    model: DEFAULT_MODEL.claude,
    effort: DEFAULT_EFFORT.claude,
    name: '',
    sessionName: '',
    branch: '',
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
          style={{ opacity: loading ? 0.4 : 1, paddingHorizontal: 4 }}
        >
          <Text style={styles.headerCancel}>Cancel</Text>
        </Pressable>
      ),
      gestureEnabled: !loading,
    });
  }, [navigation, router, loading]);

  function onCancel() {
    if (loading) return;
    router.back();
  }

  async function onCreate() {
    setError(null);

    if (!client) {
      setError('Not authenticated');
      return;
    }

    if (!projectId && !repositoryUrl.trim()) {
      setError('Choose a project or provide a repository URL');
      return;
    }

    setLoading(true);
    try {
      const body: Parameters<NonNullable<typeof client>['createWorkspace']>[0] = {
        agent: config.agent,
        model: config.model,
        effort: config.effort,
        name: config.name?.trim() || undefined,
        sessionName: config.sessionName?.trim() || undefined,
        branch: config.branch?.trim() || undefined,
      };

      if (projectId && mode === 'project') {
        body.projectId = projectId;
      } else {
        body.repositoryUrl = repositoryUrl.trim();
      }

      const res = await client.createWorkspace(body);

      router.replace({
        pathname: '/session/[id]',
        params: {
          id: res.sessionId,
          workspaceId: res.workspaceId,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace');
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
            Creates a cloud workspace and first agent session
            {projectName ? ` for ${projectName}` : ''}. Name it after the task —
            that becomes the git branch.
          </Body>

          {error ? <ErrorBanner message={error} /> : null}

          {!projectId || mode === 'url' ? (
            <Input
              label="Repository URL"
              placeholder="https://github.com/org/repo"
              value={repositoryUrl}
              onChangeText={setRepositoryUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          ) : (
            <Body>
              Project:{' '}
              <Text style={{ color: colors.accent, fontWeight: '600' }}>
                {projectName || projectId}
              </Text>
            </Body>
          )}

          {projectId ? (
            <View style={styles.toggleRow}>
              <Button
                title="Use project"
                variant={mode === 'project' ? 'primary' : 'secondary'}
                onPress={() => setMode('project')}
                style={{ flex: 1 }}
              />
              <Button
                title="Use URL"
                variant={mode === 'url' ? 'primary' : 'secondary'}
                onPress={() => setMode('url')}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          <SectionHeader title="Agent config" />
          <AgentPicker
            value={config}
            onChange={setConfig}
            showName
            showSessionName
            showBranch
            showFastMode={false}
          />

          <Button
            title="Create workspace"
            icon="rocket-outline"
            onPress={onCreate}
            loading={loading}
          />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onCancel}
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
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerCancel: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '400',
  },
});
