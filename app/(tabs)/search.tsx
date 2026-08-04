import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Badge,
  Caption,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Screen,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/format';
import {
  buildTranscriptSearchSql,
  displayTitle,
  QUICK_LOOKS,
  rowToHit,
  snippetAround,
  TIME_RANGE_OPTIONS,
  WORKSPACE_FILTER_OPTIONS,
  type SearchFilters,
  type SearchHit,
  type TimeRange,
  type WorkspaceFilter,
} from '@/lib/search';
import { colors, radius, spacing } from '@/lib/theme';

const DEFAULT_FILTERS: SearchFilters = {
  text: '',
  range: '7d',
  workspace: 'any',
};

export default function SearchScreen() {
  const client = useClient();
  const router = useRouter();

  const [text, setText] = useState('');
  const [range, setRange] = useState<TimeRange>(DEFAULT_FILTERS.range);
  const [workspace, setWorkspace] = useState<WorkspaceFilter>(
    DEFAULT_FILTERS.workspace,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const latestRequest = useRef(0);

  const filters: SearchFilters = useMemo(
    () => ({ text, range, workspace }),
    [text, range, workspace],
  );

  const runSearch = useCallback(
    async (next?: SearchFilters) => {
      if (!client) return;
      const requestId = ++latestRequest.current;
      const f = next ?? filters;
      Keyboard.dismiss();
      setLoading(true);
      setError(null);
      setHasSearched(true);
      try {
        const sql = buildTranscriptSearchSql(f);
        const res = await client.runSql({ query: sql });
        if (requestId !== latestRequest.current) return;
        setHits(res.rows.map(rowToHit));
        setTruncated(res.truncated);
      } catch (e) {
        if (requestId !== latestRequest.current) return;
        setHits(null);
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [client, filters],
  );

  // Load a useful default feed when the tab opens
  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      if (!hasSearched && hits === null && !loading) {
        void runSearch(DEFAULT_FILTERS);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]),
  );

  function applyQuickLook(id: string) {
    const look = QUICK_LOOKS.find((q) => q.id === id);
    if (!look) return;
    setText(look.filters.text);
    setRange(look.filters.range);
    setWorkspace(look.filters.workspace);
    void runSearch(look.filters);
  }

  function openHit(hit: SearchHit) {
    if (hit.sessionId) {
      router.push({
        pathname: '/session/[id]',
        params: {
          id: hit.sessionId,
          workspaceId: hit.workspaceId || '',
          name: hit.sessionTitle || '',
        },
      });
      return;
    }
    if (hit.workspaceId) {
      router.push({
        pathname: '/workspace/[id]',
        params: {
          id: hit.workspaceId,
          name: hit.workspaceName || '',
        },
      });
    }
  }

  const rangeLabel =
    TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label || range;

  return (
    <Screen>
      <FlatList
        data={hits || []}
        keyExtractor={(item, i) =>
          item.sessionId || item.workspaceId || `row-${i}`
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>ACTIVITY / TRANSCRIPTS</Text>
            <Text style={styles.heading}>Trace any session.</Text>
            <Caption style={styles.subhead}>
              Search decisions, prompts, and agent work across your organization.
            </Caption>

            <View style={styles.searchBar}>
              <Ionicons
                name="search"
                size={18}
                color={colors.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                accessibilityLabel="Search transcripts"
                value={text}
                onChangeText={setText}
                placeholder="Search transcripts, titles, workspaces…"
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                autoCorrect
                autoCapitalize="none"
                clearButtonMode="while-editing"
                onSubmitEditing={() => runSearch()}
              />
              {text.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setText('');
                    void runSearch({ text: '', range, workspace });
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => runSearch()}
                style={styles.searchBtn}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Search"
                accessibilityState={{ disabled: loading, busy: loading }}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.textInverse}
                  />
                )}
              </Pressable>
            </View>

            <Text style={styles.filterLabel}>When</Text>
            <View style={styles.chipRow}>
              {TIME_RANGE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.short}
                  selected={range === opt.value}
                  onPress={() => {
                    setRange(opt.value);
                    void runSearch({ text, range: opt.value, workspace });
                  }}
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Workspaces</Text>
            <View style={styles.chipRow}>
              {WORKSPACE_FILTER_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={workspace === opt.value}
                  onPress={() => {
                    setWorkspace(opt.value);
                    void runSearch({ text, range, workspace: opt.value });
                  }}
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Quick looks</Text>
            <View style={styles.quickGrid}>
              {QUICK_LOOKS.map((look) => (
                <Pressable
                  key={look.id}
                  style={styles.quickCard}
                  onPress={() => applyQuickLook(look.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${look.title}. ${look.subtitle}`}
                >
                  <Ionicons
                    name={look.icon}
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={styles.quickTitle}>{look.title}</Text>
                  <Text style={styles.quickSub} numberOfLines={2}>
                    {look.subtitle}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? (
              <ErrorBanner message={error} onRetry={() => runSearch()} />
            ) : null}

            {hits ? (
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  {hits.length === 0
                    ? 'No sessions found'
                    : `${hits.length} session${hits.length === 1 ? '' : 's'}`}
                </Text>
                <Caption>
                  {rangeLabel}
                  {workspace === 'ready' ? ' · live only' : ''}
                  {truncated ? ' · more available' : ''}
                </Caption>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading && !hits ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.accent} />
              <Caption style={{ marginTop: spacing.sm }}>
                Looking up sessions…
              </Caption>
            </View>
          ) : hasSearched && hits && hits.length === 0 && !loading ? (
            <EmptyState
              title="Nothing matched"
              description={
                text
                  ? `No sessions mention “${text}” in ${rangeLabel.toLowerCase()}. Try broader time or different words.`
                  : `No session activity in ${rangeLabel.toLowerCase()}. Try All time or create a workspace.`
              }
            />
          ) : null
        }
        renderItem={({ item }) => (
          <ResultCard
            hit={item}
            query={text}
            onPress={() => openHit(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </Screen>
  );
}

function ResultCard({
  hit,
  query,
  onPress,
}: {
  hit: SearchHit;
  query: string;
  onPress: () => void;
}) {
  const title = displayTitle(hit);
  const snippet = snippetAround(hit.transcript, query);
  const canOpen = !!(hit.sessionId || hit.workspaceId);

  return (
    <Card onPress={canOpen ? onPress : undefined} style={styles.resultCard}>
      <View style={styles.resultTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {title}
          </Text>
          {hit.workspaceName && hit.sessionTitle ? (
            <Caption numberOfLines={1}>{hit.workspaceName}</Caption>
          ) : null}
        </View>
        {canOpen ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textMuted}
          />
        ) : null}
      </View>

      {snippet ? (
        <Text style={styles.snippet} numberOfLines={3}>
          {snippet}
        </Text>
      ) : (
        <Caption style={styles.noSnippet}>No transcript preview</Caption>
      )}

      <View style={styles.meta}>
        {hit.updatedAt ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="time-outline"
              size={12}
              color={colors.textMuted}
            />
            <Caption>{formatRelativeTime(hit.updatedAt)}</Caption>
          </View>
        ) : null}
        {hit.agentType ? (
          <Badge label={hit.agentType} color={colors.accent} soft />
        ) : null}
        {hit.model ? (
          <Badge label={hit.model} color={colors.textMuted} soft />
        ) : null}
        {hit.workspaceState === 'ready' ? (
          <Badge label="live" color={colors.success} soft />
        ) : hit.workspaceState === 'archived' ? (
          <Badge label="archived" color={colors.archived} soft />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.8,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    letterSpacing: 1,
  },
  subhead: {
    marginTop: -4,
    lineHeight: 18,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minHeight: 52,
    gap: spacing.sm,
  },
  searchIcon: {
    marginRight: 0,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickCard: {
    width: '31%',
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  quickTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  quickSub: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
  },
  resultsHeader: {
    marginTop: spacing.sm,
    gap: 2,
  },
  resultsTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  resultCard: {
    gap: spacing.sm,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  snippet: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  noSnippet: {
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
