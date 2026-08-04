import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import {
  basename,
  dirname,
  extractFileChanges,
  extractGitHintsFromMessages,
  extractGitHintsFromText,
  extractLinkedResources,
  fileActionColor,
  fileActionLabel,
  type FileChange,
  type LinkedPull,
} from '@/lib/changes';
import {
  findPullsForWorkspace,
  githubCompareUrl,
  githubPullsUrl,
  githubRepoUrl,
  githubTreeUrl,
  listPullFiles,
  loadGithubToken,
  parseGithubRemote,
  type GithubPull,
  type GithubPullFile,
  type GithubRepo,
} from '@/lib/github';
import type { Message } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';

export default function WorkspaceChangesScreen() {
  const {
    workspaceId,
    name,
    branch: branchParam,
  } = useLocalSearchParams<{
    workspaceId: string;
    name?: string;
    branch?: string;
  }>();
  const client = useClient();
  const router = useRouter();

  // Route "branch" is usually the workspace display name (not a git ref).
  const routeHint = (branchParam || name || '').trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agentFiles, setAgentFiles] = useState<FileChange[]>([]);
  const [linkedPulls, setLinkedPulls] = useState<LinkedPull[]>([]);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [resolvedBranch, setResolvedBranch] = useState<string | null>(null);

  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<GithubRepo | null>(null);
  const [githubPulls, setGithubPulls] = useState<GithubPull[]>([]);
  const [githubFiles, setGithubFiles] = useState<GithubPullFile[]>([]);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [selectedPull, setSelectedPull] = useState<GithubPull | null>(null);

  const loadAgentActivity = useCallback(async (): Promise<{
    repoUrl: string | null;
    linkedPulls: LinkedPull[];
    branchCandidates: string[];
  }> => {
    if (!client || !workspaceId) {
      return { repoUrl: null, linkedPulls: [], branchCandidates: [] };
    }

    const sessions = await client.listWorkspaceSessions(workspaceId, {
      limit: 50,
    });
    const active = sessions.data.filter((s) => !s.archivedAt);

    const messageLists = await Promise.all(
      active.slice(0, 12).map((s) =>
        client.listMessages(s.id, { limit: 100 }).catch(() => ({
          data: [] as Message[],
          offset: 0,
          hasMore: false,
        })),
      ),
    );

    const allMessages = messageLists.flatMap((m) => m.data);
    setAgentFiles(extractFileChanges(allMessages));
    const links = extractLinkedResources(allMessages);
    setLinkedPulls(links.pulls);

    const messageHints = extractGitHintsFromMessages(allMessages);

    let foundRepo: string | null = null;
    let sqlTranscripts: string[] = [];
    // Workspace GET has no branch/remote — SQL view has repo_url + transcript text.
    try {
      const sql = await client.runSql({
        query: `SELECT repo_url, transcript FROM session_transcripts_view WHERE workspace_id = '${workspaceId.replace(/'/g, "''")}' ORDER BY transcript_updated_at DESC NULLS LAST LIMIT 20`,
      });
      for (const row of sql.rows) {
        if (!foundRepo && typeof row.repo_url === 'string' && row.repo_url) {
          foundRepo = row.repo_url;
        }
        if (typeof row.transcript === 'string' && row.transcript) {
          sqlTranscripts.push(row.transcript);
        }
      }
      if (foundRepo) setRepoUrl(foundRepo);
    } catch {
      // SQL may be unavailable; continue without
    }

    const sqlHints = extractGitHintsFromText(...sqlTranscripts);
    if (!foundRepo && sqlHints.repoUrls[0]) {
      foundRepo = sqlHints.repoUrls[0];
      setRepoUrl(foundRepo);
    }
    if (!foundRepo && messageHints.repoUrls[0]) {
      foundRepo = messageHints.repoUrls[0];
      setRepoUrl(foundRepo);
    }

    const pullByUrl = new Map(
      [...messageHints.pulls, ...sqlHints.pulls].map((pull) => [pull.url, pull]),
    );
    const branchCandidates = Array.from(
      new Set([...sqlHints.branches, ...messageHints.branches]),
    );
    if (branchCandidates[0]) setResolvedBranch(branchCandidates[0]);
    else setResolvedBranch(null);

    return {
      repoUrl: foundRepo,
      linkedPulls: Array.from(pullByUrl.values()),
      branchCandidates,
    };
  }, [client, workspaceId]);

  const loadGithub = useCallback(
    async (
      remote: string | null,
      token: string | null,
      linkedPulls: LinkedPull[],
      branchCandidates: string[],
    ) => {
      const repo = parseGithubRemote(remote);
      setGithubRepo(repo);
      setGithubPulls([]);
      setGithubFiles([]);
      setSelectedPull(null);
      setGithubError(null);

      if (!repo) {
        if (remote) {
          setGithubError('Could not parse GitHub repository URL from workspace.');
        }
        return;
      }
      if (!token) {
        setGithubError(
          `Add a GitHub PAT in Settings with access to ${repo.owner}/${repo.repo}. Fine-grained tokens must include that repository.`,
        );
        return;
      }

      setGithubLoading(true);
      try {
        // Prefer PR URLs + real git branch from transcripts. Workspace display
        // name (e.g. "Audit SMS notifications") is usually NOT the git branch.
        const routeBranch =
          routeHint && !routeHint.includes(' ') ? routeHint : undefined;
        const pulls = await findPullsForWorkspace(repo, {
          branch: routeBranch,
          branchCandidates,
          workspaceName: name || routeHint || undefined,
          linkedPulls,
          token,
        });
        setGithubPulls(pulls);
        if (pulls[0]) {
          setSelectedPull(pulls[0]);
          if (pulls[0].headRef) setResolvedBranch(pulls[0].headRef);
          const files = await listPullFiles(repo, pulls[0].number, token);
          setGithubFiles(files);
        } else {
          setGithubError(
            `No pull request matched this workspace in ${repo.owner}/${repo.repo}. ` +
              (branchCandidates.length
                ? `Tried branch${branchCandidates.length > 1 ? 'es' : ''}: ${branchCandidates.slice(0, 3).join(', ')}. `
                : '') +
              'Open a PR, mention its URL in chat, or ensure the agent has checked out the branch.',
          );
        }
      } catch (e) {
        setGithubError(
          e instanceof Error ? e.message : 'Could not load GitHub data',
        );
      } finally {
        setGithubLoading(false);
      }
    },
    [routeHint, name],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (!client || !workspaceId) return;
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const token = await loadGithubToken();
        setGithubToken(token);

        const activity = await loadAgentActivity();
        await loadGithub(
          activity.repoUrl,
          token,
          activity.linkedPulls,
          activity.branchCandidates,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load changes');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, workspaceId, loadAgentActivity, loadGithub],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function selectPull(pull: GithubPull) {
    if (!githubRepo) return;
    setSelectedPull(pull);
    setGithubLoading(true);
    setGithubError(null);
    try {
      const files = await listPullFiles(
        githubRepo,
        pull.number,
        githubToken,
      );
      setGithubFiles(files);
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : 'Failed to load files');
    } finally {
      setGithubLoading(false);
    }
  }

  if (!client || (loading && !agentFiles.length && !githubFiles.length)) {
    return (
      <Screen>
        <LoadingState label="Gathering changes…" />
      </Screen>
    );
  }

  const hasGithubFiles = githubFiles.length > 0;
  const hasAgentFiles = agentFiles.length > 0;
  // Prefer PR files for the main list when available
  type Row =
    | { kind: 'github'; file: GithubPullFile }
    | { kind: 'agent'; file: FileChange };

  const rows: Row[] = hasGithubFiles
    ? githubFiles.map((file) => ({ kind: 'github' as const, file }))
    : hasAgentFiles
      ? agentFiles.map((file) => ({ kind: 'agent' as const, file }))
      : [];

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item, i) =>
          item.kind === 'github'
            ? `gh-${item.file.filename}-${i}`
            : `ag-${item.file.path}-${i}`
        }
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

            <Body muted>
              Changes for{' '}
              <Text style={{ color: colors.accent, fontWeight: '600' }}>
                {name || routeHint || 'workspace'}
              </Text>
              {resolvedBranch ? ` · ${resolvedBranch}` : ''}
              {githubRepo
                ? ` · ${githubRepo.owner}/${githubRepo.repo}`
                : repoUrl
                  ? ` · ${repoUrl}`
                  : ''}
              .
            </Body>

            {/* Links & integrations */}
            <SectionHeader title="Links" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.linkRow}>
                {githubRepo ? (
                  <>
                    <LinkChip
                      icon="logo-github"
                      label="Repository"
                      onPress={() =>
                        Linking.openURL(githubRepoUrl(githubRepo))
                      }
                    />
                    {selectedPull?.headRef && !selectedPull.headRef.includes(' ') ? (
                      <>
                        <LinkChip
                          icon="git-branch-outline"
                          label="Branch"
                          onPress={() =>
                            Linking.openURL(
                              githubTreeUrl(githubRepo, selectedPull.headRef),
                            )
                          }
                        />
                        <LinkChip
                          icon="git-compare-outline"
                          label="Compare"
                          onPress={() =>
                            Linking.openURL(
                              githubCompareUrl(
                                githubRepo,
                                selectedPull.headRef,
                                selectedPull.baseRef,
                              ),
                            )
                          }
                        />
                      </>
                    ) : null}
                    <LinkChip
                      icon="git-pull-request-outline"
                      label="PRs"
                      onPress={() =>
                        Linking.openURL(githubPullsUrl(githubRepo))
                      }
                    />
                  </>
                ) : null}
                {linkedPulls.map((p) => (
                  <LinkChip
                    key={p.url}
                    icon="git-pull-request"
                    label={p.label}
                    onPress={() => Linking.openURL(p.url)}
                  />
                ))}
                {!githubToken ? (
                  <LinkChip
                    icon="key-outline"
                    label="Add GitHub token"
                    onPress={() => router.push('/(tabs)/settings')}
                  />
                ) : null}
              </View>
            </ScrollView>

            {/* GitHub PRs */}
            {githubRepo ? (
              <View style={styles.block}>
                <SectionHeader
                  title={
                    githubPulls.length
                      ? `Pull requests · ${githubPulls.length}`
                      : 'Pull requests'
                  }
                />
                {githubLoading && !githubPulls.length ? (
                  <ActivityIndicator color={colors.accent} />
                ) : githubError && !githubPulls.length ? (
                  <Card style={styles.infoCard}>
                    <Caption style={{ color: colors.warning }}>
                      {githubError}
                    </Caption>
                    <Caption style={{ marginTop: 8 }}>
                      Tips: use a classic PAT with the{' '}
                      <Text style={{ fontFamily: 'SpaceMono' }}>repo</Text>{' '}
                      scope, or a fine-grained PAT that includes{' '}
                      <Text style={{ color: colors.text }}>
                        {githubRepo.owner}/{githubRepo.repo}
                      </Text>
                      . If the org uses SAML SSO, authorize the token for that
                      org on GitHub.
                    </Caption>
                    <Button
                      title="Open GitHub settings"
                      variant="secondary"
                      style={{ marginTop: spacing.md }}
                      onPress={() => router.push('/(tabs)/settings')}
                    />
                  </Card>
                ) : githubPulls.length === 0 ? (
                  <Card style={styles.infoCard}>
                    <Caption>
                      No open pull requests found for this workspace. Ask the
                      agent to open a PR, or paste a GitHub PR link in chat.
                    </Caption>
                  </Card>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {githubPulls.map((p) => (
                      <Pressable
                        key={p.number}
                        onPress={() => selectPull(p)}
                        style={[
                          styles.prCard,
                          selectedPull?.number === p.number &&
                            styles.prCardSelected,
                        ]}
                      >
                        <View style={styles.prTop}>
                          <Badge
                            label={p.draft ? 'draft' : p.state}
                            color={
                              p.state === 'open' ? colors.success : colors.textMuted
                            }
                            soft
                          />
                          <Text style={styles.prNumber}>#{p.number}</Text>
                          <Pressable
                            onPress={() => Linking.openURL(p.htmlUrl)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name="open-outline"
                              size={16}
                              color={colors.accent}
                            />
                          </Pressable>
                        </View>
                        <Text style={styles.prTitle} numberOfLines={2}>
                          {p.title}
                        </Text>
                        <Caption>
                          {p.baseRef} ← {p.headRef}
                          {typeof p.additions === 'number'
                            ? ` · +${p.additions}/−${p.deletions || 0}`
                            : ''}
                        </Caption>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <Card style={styles.infoCard}>
                <Caption>
                  Connect GitHub by working in a GitHub-backed project. Add a
                  personal access token in Settings for private repos and PR
                  file lists.
                </Caption>
                <Button
                  title="Open Settings"
                  variant="secondary"
                  style={{ marginTop: spacing.md }}
                  onPress={() => router.push('/(tabs)/settings')}
                />
              </Card>
            )}

            <SectionHeader
              title={
                hasGithubFiles
                  ? `Files in PR · ${githubFiles.length}`
                  : hasAgentFiles
                    ? `Files agents touched · ${agentFiles.length}`
                    : 'Files'
              }
            />
            {hasGithubFiles ? (
              <Caption style={{ marginBottom: spacing.sm }}>
                From GitHub pull request
                {selectedPull ? ` #${selectedPull.number}` : ''}.
              </Caption>
            ) : hasAgentFiles ? (
              <Caption style={{ marginBottom: spacing.sm }}>
                Inferred from agent tool use (Edit / Write / …) in this
                workspace. Open a PR for a full GitHub diff.
              </Caption>
            ) : null}

            {githubLoading && hasGithubFiles === false && githubPulls.length > 0 ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginVertical: spacing.md }}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !githubLoading ? (
            <EmptyState
              title="No file changes yet"
              description="When the agent edits files—or a pull request exists for this branch—they’ll show up here."
            />
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'github' ? (
            <GithubFileRow file={item.file} />
          ) : (
            <AgentFileRow file={item.file} />
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </Screen>
  );
}

function LinkChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.linkChip}>
      <Ionicons name={icon} size={14} color={colors.accent} />
      <Text style={styles.linkChipText}>{label}</Text>
    </Pressable>
  );
}

function GithubFileRow({ file }: { file: GithubPullFile }) {
  const color =
    file.status === 'added'
      ? colors.success
      : file.status === 'removed'
        ? colors.danger
        : colors.accent;

  return (
    <Card style={styles.fileCard}>
      <View style={styles.fileTop}>
        <View
          style={[styles.statusDot, { backgroundColor: color }]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName} numberOfLines={1}>
            {basename(file.filename)}
          </Text>
          {dirname(file.filename) ? (
            <Caption numberOfLines={1}>{dirname(file.filename)}</Caption>
          ) : null}
        </View>
        <Badge label={file.status} color={color} soft />
      </View>
      <View style={styles.statRow}>
        <Text style={[styles.stat, { color: colors.success }]}>
          +{file.additions}
        </Text>
        <Text style={[styles.stat, { color: colors.danger }]}>
          −{file.deletions}
        </Text>
        {file.blobUrl ? (
          <Pressable onPress={() => Linking.openURL(file.blobUrl!)}>
            <Text style={styles.viewLink}>View</Text>
          </Pressable>
        ) : null}
      </View>
      {file.patch ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          style={styles.patchScroll}
          showsHorizontalScrollIndicator={false}
        >
          <Text style={styles.patch} selectable>
            {file.patch.split('\n').slice(0, 24).join('\n')}
            {file.patch.split('\n').length > 24 ? '\n…' : ''}
          </Text>
        </ScrollView>
      ) : null}
    </Card>
  );
}

function AgentFileRow({ file }: { file: FileChange }) {
  const color = fileActionColor(file.primaryAction);
  return (
    <Card style={styles.fileCard}>
      <View style={styles.fileTop}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName} numberOfLines={1}>
            {basename(file.path)}
          </Text>
          {dirname(file.path) ? (
            <Caption numberOfLines={1}>{dirname(file.path)}</Caption>
          ) : null}
        </View>
        <Badge
          label={fileActionLabel(file.primaryAction)}
          color={color}
          soft
        />
      </View>
      <Caption>
        {file.count} tool call{file.count === 1 ? '' : 's'}
        {file.lastTool ? ` · ${file.lastTool}` : ''}
        {file.actions.length > 1
          ? ` · also ${file.actions
              .filter((a) => a !== file.primaryAction)
              .map(fileActionLabel)
              .join(', ')}`
          : ''}
      </Caption>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  block: {
    gap: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkChipText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    gap: 4,
  },
  prCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  prCardSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  prTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prNumber: {
    flex: 1,
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  prTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fileCard: {
    gap: spacing.sm,
  },
  fileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fileName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stat: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '600',
  },
  viewLink: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 'auto',
  },
  patchScroll: {
    maxHeight: 160,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  patch: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    padding: spacing.sm,
  },
});
