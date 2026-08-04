import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Row,
  Screen,
  SectionHeader,
  StatusDot,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import type { Session, WorkspaceStatus, WorkspaceSummary } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

export default function WorkspaceDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const client = useClient();
  const router = useRouter();
  const navigation = useNavigation();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: name || workspace?.name || 'Workspace',
    });
  }, [navigation, name, workspace?.name]);

  const load = useCallback(
    async (refresh = false) => {
      if (!id || !client) return;
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const [w, s, sess] = await Promise.all([
          client.getWorkspace(id),
          client.getWorkspaceStatus(id),
          client.listWorkspaceSessions(id, { limit: 100 }),
        ]);
        setWorkspace(w);
        setStatus(s);
        setSessions(sess.data);
        setNewName(w.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, id],
  );

  useFocusEffect(
    useCallback(() => {
      if (!client || !id) return;
      load();
      const timer = setInterval(() => {
        client.getWorkspaceStatus(id).then(setStatus).catch(() => {});
      }, 10000);
      return () => clearInterval(timer);
    }, [load, client, id]),
  );

  async function onRename() {
    if (!newName.trim() || !client) return;
    setActionBusy(true);
    try {
      const w = await client.renameWorkspace(id, newName.trim());
      setWorkspace(w);
      setRenaming(false);
      navigation.setOptions({ title: w.name });
    } catch (e) {
      Alert.alert('Rename failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setActionBusy(false);
    }
  }

  function onArchive() {
    if (!client) return;
    Alert.alert(
      'Archive workspace',
      'Stop the sandbox and hide this workspace? It can be restored later from desktop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              await client.archiveWorkspace(id);
              await load(true);
            } catch (e) {
              Alert.alert(
                'Archive failed',
                e instanceof Error ? e.message : 'Error',
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }

  if (!client || (loading && !workspace)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? (
              <ErrorBanner message={error} onRetry={() => load()} />
            ) : null}

            <View style={styles.statusBar}>
              <StatusDot
                status={status?.status}
                label={
                  status?.lifecycleStep
                    ? `${status.status} · ${status.lifecycleStep}`
                    : status?.status
                }
              />
              {status?.errorMessage ? (
                <Badge label="error" color={colors.danger} soft />
              ) : null}
            </View>

            {renaming ? (
              <View style={styles.renameRow}>
                <TextInput
                  style={styles.renameInput}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  placeholderTextColor={colors.textMuted}
                />
                <Button
                  title="Save"
                  onPress={onRename}
                  loading={actionBusy}
                  style={{ minWidth: 90 }}
                />
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setRenaming(false)}
                />
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                title="New session"
                icon="chatbubble-ellipses-outline"
                onPress={() =>
                  router.push({
                    pathname: '/session/create',
                    params: { workspaceId: id },
                  })
                }
                style={{ flex: 1 }}
              />
              <Button
                title="Changes"
                variant="secondary"
                icon="git-branch-outline"
                onPress={() =>
                  router.push({
                    pathname: '/workspace/changes',
                    params: {
                      workspaceId: id,
                      name: workspace?.name || name || '',
                      branch: workspace?.name || name || '',
                    },
                  })
                }
                style={{ flex: 1 }}
              />
            </View>
            <View style={styles.actions}>
              <Button
                title="Rename"
                variant="secondary"
                icon="pencil-outline"
                onPress={() => setRenaming(true)}
                style={{ flex: 1 }}
              />
              <Button
                title="Archive"
                variant="danger"
                icon="archive-outline"
                onPress={onArchive}
                disabled={actionBusy}
                style={{ flex: 1 }}
              />
            </View>

            <SectionHeader title="Sessions" />
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No sessions"
              description="Add an agent chat to this workspace."
              action={
                <Button
                  title="New session"
                  style={{ marginTop: spacing.lg }}
                  onPress={() =>
                    router.push({
                      pathname: '/session/create',
                      params: { workspaceId: id },
                    })
                  }
                />
              }
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            icon="chatbubble-outline"
            title={item.name || `Session ${item.id.slice(0, 8)}`}
            subtitle={[item.model || item.resolvedModel, item.effort]
              .filter(Boolean)
              .join(' · ')}
            meta={item.archivedAt ? 'Archived' : undefined}
            right={
              item.archivedAt ? (
                <Badge label="archived" color={colors.archived} soft />
              ) : item.fastMode ? (
                <Badge label="fast" color={colors.warning} soft />
              ) : undefined
            }
            onPress={() =>
              router.push({
                pathname: '/session/[id]',
                params: {
                  id: item.id,
                  workspaceId: id,
                  name: item.name || '',
                },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.lg,
    flexGrow: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  renameInput: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
});
