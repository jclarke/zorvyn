import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  Row,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import type { Project } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

export default function ProjectsScreen() {
  const client = useClient();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (opts?: { refresh?: boolean; append?: boolean }) => {
      if (!client) return;
      try {
        if (opts?.refresh) setRefreshing(true);
        else if (opts?.append) setLoadingMore(true);
        else setLoading(true);
        setError(null);

        const offset = opts?.append ? projects.length : 0;
        const res = await client.listProjects({ limit: 50, offset });
        setProjects((prev) =>
          opts?.append ? [...prev, ...res.data] : res.data,
        );
        setHasMore(res.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [client, projects.length],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]),
  );

  if (!client || (loading && !projects.length)) {
    return (
      <Screen>
        <LoadingState label="Loading projects…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ refresh: true })}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>ZORVYN / FIELD CONSOLE</Text>
            <Text style={styles.heading}>Where should we work?</Text>
            <Text style={styles.intro}>
              Pick a repository to open its cloud workspaces and active agent sessions.
            </Text>

            <View style={styles.summary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{projects.length}</Text>
                <Text style={styles.summaryLabel}>repositories</Text>
              </View>
              <View style={styles.summaryDivider} />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/search')}
                style={({ pressed }) => [styles.activityLink, pressed && styles.pressed]}
              >
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle}>Scan activity</Text>
                  <Text style={styles.activityMeta}>Search every agent transcript</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.accent} />
              </Pressable>
            </View>

            {error ? <ErrorBanner message={error} onRetry={() => load()} /> : null}
            <SectionHeader title="Repositories" />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No projects yet"
            description="Projects are the repositories you can create cloud workspaces in. Add one in the Conductor desktop app first."
          />
        }
        renderItem={({ item }) => (
          <Row
            icon="git-branch"
            title={item.name}
            subtitle={item.gitRemote}
            onPress={() =>
              router.push({
                pathname: '/project/[id]',
                params: { id: item.id, name: item.name },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        onEndReached={() => {
          if (hasMore && !loadingMore) load({ append: true });
        }}
        onEndReachedThreshold={0.3}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    letterSpacing: 1,
  },
  heading: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.8,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 560,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.lg,
  },
  summaryItem: {
    minWidth: 88,
    justifyContent: 'center',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'SpaceMono',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.lg,
  },
  activityLink: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activityCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  activityMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  pressed: {
    opacity: 0.65,
  },
});
