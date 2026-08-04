import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
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
import { formatRelativeTime } from '@/lib/format';
import type { Project, WorkspaceLifecycleStatus, WorkspaceSummary } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

type WorkspaceRow = WorkspaceSummary & {
  status?: WorkspaceLifecycleStatus;
};

const HIDDEN_BY_DEFAULT: WorkspaceLifecycleStatus[] = ['archived', 'deleted'];

export default function ProjectDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const client = useClient();
  const router = useRouter();
  const navigation = useNavigation();

  const [project, setProject] = useState<Project | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: name || project?.name || 'Project',
    });
  }, [navigation, name, project?.name]);

  const load = useCallback(
    async (refresh = false) => {
      if (!id || !client) return;
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const [p, w] = await Promise.all([
          client.getProject(id),
          client.listProjectWorkspaces(id, { limit: 100 }),
        ]);
        setProject(p);

        // List endpoint has no status field — fetch lifecycle for each workspace.
        const statuses = await Promise.all(
          w.data.map(async (ws) => {
            try {
              const st = await client.getWorkspaceStatus(ws.id);
              return [ws.id, st.status] as const;
            } catch {
              return [ws.id, undefined] as const;
            }
          }),
        );
        const statusById = new Map(statuses);
        setWorkspaces(
          w.data.map((ws) => ({
            ...ws,
            status: statusById.get(ws.id),
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load project');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const archivedCount = useMemo(
    () =>
      workspaces.filter(
        (w) => w.status && HIDDEN_BY_DEFAULT.includes(w.status),
      ).length,
    [workspaces],
  );

  const visibleWorkspaces = useMemo(() => {
    if (showArchived) return workspaces;
    return workspaces.filter(
      (w) => !w.status || !HIDDEN_BY_DEFAULT.includes(w.status),
    );
  }, [workspaces, showArchived]);

  if (!client || (loading && !project)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={visibleWorkspaces}
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
            {project ? (
              <Row
                icon="logo-github"
                title={project.name}
                subtitle={project.gitRemote}
              />
            ) : null}
            <Button
              title="New workspace"
              icon="add-outline"
              onPress={() =>
                router.push({
                  pathname: '/workspace/create',
                  params: {
                    projectId: id,
                    projectName: project?.name || name || '',
                  },
                })
              }
            />
            <SectionHeader
              title={
                showArchived
                  ? `Workspaces · ${visibleWorkspaces.length}`
                  : `Workspaces · ${visibleWorkspaces.length}${archivedCount ? ` · ${archivedCount} archived hidden` : ''}`
              }
              actionLabel={
                archivedCount > 0
                  ? showArchived
                    ? 'Hide archived'
                    : 'Show archived'
                  : undefined
              }
              onAction={
                archivedCount > 0
                  ? () => setShowArchived((v) => !v)
                  : undefined
              }
            />
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title={
                archivedCount > 0 && !showArchived
                  ? 'No active workspaces'
                  : 'No workspaces'
              }
              description={
                archivedCount > 0 && !showArchived
                  ? `${archivedCount} archived workspace${archivedCount === 1 ? '' : 's'} hidden. Create a new one or show archived.`
                  : 'Spin up a cloud workspace to start vibe coding in this repo.'
              }
              action={
                <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                  <Button
                    title="Create workspace"
                    onPress={() =>
                      router.push({
                        pathname: '/workspace/create',
                        params: { projectId: id },
                      })
                    }
                  />
                  {archivedCount > 0 && !showArchived ? (
                    <Button
                      title="Show archived"
                      variant="secondary"
                      onPress={() => setShowArchived(true)}
                    />
                  ) : null}
                </View>
              }
            />
          ) : null
        }
        renderItem={({ item }) => {
          const isArchived =
            item.status === 'archived' || item.status === 'deleted';
          return (
            <Row
              icon="cube-outline"
              title={item.name}
              subtitle={`Created ${formatRelativeTime(item.createdAt)}`}
              meta={
                item.lastActivityAt
                  ? `Active ${formatRelativeTime(item.lastActivityAt)}`
                  : undefined
              }
              right={
                item.status ? (
                  isArchived ? (
                    <Badge
                      label={item.status}
                      color={colors.archived}
                      soft
                    />
                  ) : (
                    <StatusDot status={item.status} label={item.status} />
                  )
                ) : undefined
              }
              onPress={() =>
                router.push({
                  pathname: '/workspace/[id]',
                  params: { id: item.id, name: item.name },
                })
              }
            />
          );
        }}
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
    gap: spacing.sm,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
});
