import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TranscriptRowItem } from '@/components/MessageBubble';
import {
  ErrorBanner,
  LoadingState,
  Screen,
  StatusDot,
} from '@/components/ui';
import { useClient } from '@/lib/auth';
import {
  loadLatestMessagePage,
  loadOlderMessagePage,
  MESSAGE_PAGE_SIZE,
} from '@/lib/messages-paging';
import {
  buildTranscriptRows,
  getPendingUserQuestion,
  parseTranscript,
} from '@/lib/transcript';
import type {
  Message,
  Session,
  SessionStatus,
  WorkspaceLifecycleStatus,
  WorkspaceStatus,
} from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import {
  getWorkspaceLifecycle,
  restoreWorkspace,
  waitForWorkspaceReady,
} from '@/lib/workspace-lifecycle';

const POLL_MS = 3000;

export default function SessionChatScreen() {
  const { id, name } = useLocalSearchParams<{
    id: string;
    name?: string;
    workspaceId?: string;
  }>();
  const client = useClient();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [workspaceStatus, setWorkspaceStatus] =
    useState<WorkspaceStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenWorking, setSeenWorking] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);

  const listRef = useRef<FlatList>(null);
  const lastIdRef = useRef<string | undefined>(undefined);
  const oldestOffsetRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingOlderRef = useRef(false);

  // Newest-first for inverted FlatList (index 0 sits at the visual bottom).
  // Tool/tool_result runs are merged into collapsible groups before reverse.
  const parsedMessages = React.useMemo(
    () => parseTranscript(messages),
    [messages],
  );
  const listData = React.useMemo(
    () => buildTranscriptRows(parsedMessages).reverse(),
    [parsedMessages],
  );
  const pendingQuestion = React.useMemo(
    () => getPendingUserQuestion(parsedMessages),
    [parsedMessages],
  );
  const awaitingUserInput = !!pendingQuestion;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: name || session?.name || 'Chat',
      headerRight: () => (
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Session menu"
          style={styles.headerRight}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={colors.text}
          />
        </Pressable>
      ),
    });
  }, [navigation, name, session?.name]);

  const setMessageWindow = useCallback((incoming: Message[], replace: boolean) => {
    setMessages((prev) => {
      let next: Message[];
      if (replace) {
        next = [...incoming].sort((a, b) => a.sessionIndex - b.sessionIndex);
      } else if (!incoming.length) {
        return prev;
      } else {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of incoming) map.set(m.id, m);
        next = Array.from(map.values()).sort(
          (a, b) => a.sessionIndex - b.sessionIndex,
        );
      }
      if (next.length) {
        lastIdRef.current = next[next.length - 1].id;
      }
      return next;
    });
  }, []);

  const prependOlder = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      // Keep lastId pointing at newest — do not change on prepend
      return Array.from(map.values()).sort(
        (a, b) => a.sessionIndex - b.sessionIndex,
      );
    });
  }, []);

  const loadInitial = useCallback(async () => {
    if (!id || !client) return;
    try {
      setLoading(true);
      setError(null);

      const [s, st, latest] = await Promise.all([
        client.getSession(id),
        client.getSessionStatus(id),
        loadLatestMessagePage(client, id, MESSAGE_PAGE_SIZE),
      ]);
      setSession(s);
      setStatus(st);
      if (st.status === 'working') setSeenWorking(true);

      if (st.workspaceId) {
        try {
          const ws = await client.getWorkspaceStatus(st.workspaceId);
          setWorkspaceStatus(ws);
        } catch {
          // non-fatal
        }
      }

      oldestOffsetRef.current = latest.oldestOffset;
      setHasOlder(latest.hasOlder);
      setMessageWindow(latest.messages, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [client, id, setMessageWindow]);

  const loadOlder = useCallback(async () => {
    if (!id || !client) return;
    if (!hasOlder || loadingOlderRef.current) return;
    if (oldestOffsetRef.current <= 0) {
      setHasOlder(false);
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const older = await loadOlderMessagePage(
        client,
        id,
        oldestOffsetRef.current,
        MESSAGE_PAGE_SIZE,
      );
      oldestOffsetRef.current = older.oldestOffset;
      setHasOlder(older.hasOlder);
      prependOlder(older.messages);
    } catch {
      // Non-fatal — user can scroll up again
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [client, id, hasOlder, prependOlder]);

  const poll = useCallback(async () => {
    if (!id || !client) return;
    try {
      const st = await client.getSessionStatus(id);
      setStatus(st);
      if (st.status === 'working') setSeenWorking(true);

      if (st.workspaceId && !waking) {
        client
          .getWorkspaceStatus(st.workspaceId)
          .then(setWorkspaceStatus)
          .catch(() => {});
      }

      const after = lastIdRef.current;
      const msgs = await client.listMessages(
        id,
        after ? { after, limit: 100 } : { limit: MESSAGE_PAGE_SIZE },
      );
      if (msgs.data.length) {
        // New messages at the end — stick to bottom if user was already there
        setMessageWindow(msgs.data, !after);
      }
    } catch {
      // keep polling
    }
  }, [client, id, setMessageWindow, waking]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  async function sendUserMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || waking || !client) return;

    setSending(true);
    setError(null);
    setSeenWorking(false);
    try {
      // Session status includes workspaceId — needed for lifecycle checks
      let sessionStatus = status;
      if (!sessionStatus?.workspaceId) {
        sessionStatus = await client.getSessionStatus(id);
        setStatus(sessionStatus);
      }
      const workspaceId = sessionStatus.workspaceId;
      if (!workspaceId) {
        throw new Error('Could not resolve workspace for this session');
      }

      const life = await getWorkspaceLifecycle(client, workspaceId);
      setWorkspaceStatus(life.status);

      if (life.needsRestore) {
        setWaking(true);
        const restored = await restoreWorkspace(client, workspaceId, {
          onStatus: setWorkspaceStatus,
        });
        setWorkspaceStatus(restored);
      }

      // No dedicated wake API: POST message queues + wakes a sleeping sandbox.
      // If asleep/initializing, surface waking UI and wait until ready after send.
      if (life.wasAsleep) {
        setWaking(true);
      }

      await client.sendMessage(id, { message: trimmed });
      setDraft('');

      if (life.wasAsleep || life.needsRestore || life.status.status !== 'ready') {
        await waitForWorkspaceReady(client, workspaceId, {
          onStatus: setWorkspaceStatus,
        });
      }

      setWaking(false);
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setWaking(false);
      setSending(false);
    }
  }

  async function onSend() {
    await sendUserMessage(draft);
  }

  async function onAnswerQuestion(message: string) {
    await sendUserMessage(message);
  }

  async function onCancel() {
    if (!client) return;
    setMenuOpen(false);
    try {
      const res = await client.cancelSession(id);
      setStatus((prev) =>
        prev
          ? { ...prev, status: res.status }
          : {
              workspaceId: res.workspaceId,
              sessionId: res.sessionId,
              status: res.status,
              updatedAt: new Date().toISOString(),
            },
      );
      setError(
        res.canceledQueuedMessages
          ? `Cancel requested — dropped ${res.canceledQueuedMessages} queued message(s).`
          : 'Cancel requested — stopping the current turn…',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  async function submitRename() {
    const value = renameValue.trim();
    if (!value || !client) return;
    try {
      const s = await client.renameSession(id, value);
      setSession(s);
      setRenameOpen(false);
      navigation.setOptions({ title: s.name || 'Chat' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  }

  function openRenameFromMenu() {
    setMenuOpen(false);
    setRenameValue(session?.name || '');
    setRenameOpen(true);
  }

  function openArchiveConfirm() {
    setMenuOpen(false);
    setArchiveConfirmOpen(true);
  }

  async function onRestoreWorkspace() {
    const workspaceId =
      status?.workspaceId || workspaceStatus?.workspaceId;
    if (!client || !workspaceId) return;
    setWaking(true);
    setError(null);
    try {
      const next = await restoreWorkspace(client, workspaceId, {
        onStatus: setWorkspaceStatus,
      });
      setWorkspaceStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setWaking(false);
    }
  }

  async function confirmArchive() {
    if (!client) return;
    setArchiving(true);
    try {
      await client.archiveSession(id);
      setArchiveConfirmOpen(false);
      await loadInitial();
    } catch (e) {
      setArchiveConfirmOpen(false);
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setArchiving(false);
    }
  }

  if (!client || (loading && !listData.length && !messages.length)) {
    return (
      <Screen>
        <LoadingState label="Loading latest messages…" />
      </Screen>
    );
  }

  const working = status?.status === 'working';
  const wsLifecycle: WorkspaceLifecycleStatus | undefined =
    workspaceStatus?.status;
  const archived = wsLifecycle === 'archived';
  const wakingLabel = archived ? 'Restoring workspace' : 'Waking workspace';
  // Agent stays "working" while blocked on AskUserQuestion — surface that.
  const statusHint = waking
    ? workspaceStatus?.lifecycleStep
      ? `${wakingLabel}… ${workspaceStatus.lifecycleStep}`
      : `${wakingLabel}…`
    : archived
      ? 'Workspace archived — restore to continue'
      : wsLifecycle === 'sleeping'
      ? 'Workspace sleeping — next message will wake it'
      : wsLifecycle === 'initializing' || wsLifecycle === 'updating'
        ? `Workspace ${wsLifecycle}${workspaceStatus?.lifecycleStep ? ` · ${workspaceStatus.lifecycleStep}` : ''}`
        : working && awaitingUserInput
          ? 'Waiting for your answer…'
          : working
            ? 'Agent is working…'
            : status?.status === 'error'
              ? status.errorMessage || status.lastError || 'Agent error'
              : seenWorking
                ? 'Agent idle'
                : status?.status || 'idle';

  const statusDotKind = waking
    ? 'initializing'
    : archived
      ? 'archived'
      : wsLifecycle === 'sleeping'
      ? 'sleeping'
      : wsLifecycle === 'initializing' || wsLifecycle === 'updating'
        ? wsLifecycle
        : working && awaitingUserInput
          ? 'working'
          : status?.status;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.statusBar}>
          <StatusDot status={statusDotKind} label={statusHint} />
          {waking ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : null}
          {archived && !waking ? (
            <Pressable
              onPress={() => void onRestoreWorkspace()}
              style={styles.restoreBtn}
              accessibilityRole="button"
              accessibilityLabel="Restore workspace"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.accent} />
              <Text style={styles.restoreText}>Restore</Text>
            </Pressable>
          ) : null}
          {working && !waking ? (
            <Pressable
              onPress={onCancel}
              style={styles.stopBtn}
              accessibilityRole="button"
              accessibilityLabel="Stop agent"
            >
              <Ionicons name="stop-circle" size={18} color={colors.danger} />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          ) : null}
          {session?.model || session?.resolvedModel ? (
            <Text style={styles.modelLabel} numberOfLines={1}>
              {session.resolvedModel || session.model}
              {session.effort ? ` · ${session.effort}` : ''}
            </Text>
          ) : null}
        </View>

        {error ? (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.sm,
            }}
          >
            <ErrorBanner message={error} onRetry={loadInitial} />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          // Inverted: newest messages start at the bottom without scrollToEnd hacks
          inverted
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => (
            <TranscriptRowItem
              row={item}
              onAnswerQuestion={
                item.kind === 'part' &&
                item.part.kind === 'user_question' &&
                item.part.awaitingResponse
                  ? onAnswerQuestion
                  : undefined
              }
              answering={sending}
            />
          )}
          // With inverted data (newest first), older pages append to the end
          // of the array (visual top). Keep the bottom stable while loading.
          maintainVisibleContentPosition={
            Platform.OS === 'web'
              ? undefined
              : { minIndexForVisible: 0 }
          }
          // End of inverted data ≈ visual top (older messages)
          onEndReached={() => {
            if (hasOlder) void loadOlder();
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyTitle}>Start vibe coding</Text>
                <Text style={styles.emptyBody}>
                  Send a prompt — the agent can edit code, run commands, and
                  open PRs in this workspace.
                </Text>
              </View>
            ) : null
          }
          // inverted: header is visual bottom, footer is visual top
          ListHeaderComponent={
            working ? (
              <View style={styles.typing}>
                <ActivityIndicator
                  size="small"
                  color={
                    awaitingUserInput ? colors.warning : colors.working
                  }
                />
                <Text style={styles.typingText}>
                  {awaitingUserInput
                    ? 'Waiting for your answer…'
                    : 'Working…'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            hasOlder || loadingOlder ? (
              <View style={styles.olderHeader}>
                {loadingOlder ? (
                  <>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.olderText}>Loading earlier…</Text>
                  </>
                ) : (
                  <Pressable
                    onPress={() => void loadOlder()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier messages"
                  >
                    <Text style={styles.olderLink}>Load earlier messages</Text>
                  </Pressable>
                )}
              </View>
            ) : messages.length > 0 ? (
              <Text style={styles.beginningText}>Beginning of session</Text>
            ) : null
          }
        />

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              archived
                ? 'Restore the workspace, or send to restore and continue…'
                : awaitingUserInput
                ? 'Answer the question, or type a custom reply…'
                : 'Tell the agent what to build…'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={100000}
            editable={!sending}
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending || waking}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{
              disabled: !draft.trim() || sending || waking,
              busy: sending || waking,
            }}
            style={[
              styles.sendBtn,
              (!draft.trim() || sending || waking) && styles.sendDisabled,
            ]}
          >
            {sending || waking ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Ionicons name="arrow-up" size={22} color={colors.textInverse} />
            )}
          </Pressable>
        </View>

        {/* Action sheet — Alert.alert multi-button menus do not work on web/PWA */}
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close session menu"
          >
            <Pressable
              style={styles.menuSheet}
              onPress={() => {}}
              accessible={false}
            >
              <Text style={styles.menuTitle}>Session</Text>
              <Pressable
                style={styles.menuItem}
                onPress={openRenameFromMenu}
                accessibilityRole="button"
              >
                <Ionicons
                  name="pencil-outline"
                  size={20}
                  color={colors.text}
                />
                <Text style={styles.menuItemText}>Rename</Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => void onCancel()}
                accessibilityRole="button"
              >
                <Ionicons
                  name="stop-circle-outline"
                  size={20}
                  color={colors.danger}
                />
                <Text style={[styles.menuItemText, styles.menuItemDanger]}>
                  {status?.status === 'working' ? 'Stop agent' : 'Cancel turn'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={openArchiveConfirm}
                accessibilityRole="button"
              >
                <Ionicons
                  name="archive-outline"
                  size={20}
                  color={colors.danger}
                />
                <Text style={[styles.menuItemText, styles.menuItemDanger]}>
                  Archive session
                </Text>
              </Pressable>
              <Pressable
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => setMenuOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.menuItemMuted}>Dismiss</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={archiveConfirmOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setArchiveConfirmOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setArchiveConfirmOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close archive confirmation"
          >
            <Pressable
              style={styles.modalCard}
              onPress={() => {}}
              accessible={false}
            >
              <Text style={styles.modalTitle}>Archive session?</Text>
              <Text style={styles.modalBody}>
                Close this chat tab, stop the agent, and drop queued messages.
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setArchiveConfirmOpen(false)}
                  disabled={archiving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel archive"
                  accessibilityState={{ disabled: archiving }}
                >
                  <Text style={styles.modalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void confirmArchive()}
                  disabled={archiving}
                  accessibilityRole="button"
                  accessibilityLabel="Archive session"
                  accessibilityState={{ disabled: archiving, busy: archiving }}
                >
                  <Text style={styles.modalDanger}>
                    {archiving ? 'Archiving…' : 'Archive'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={renameOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setRenameOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close rename dialog"
          >
            <Pressable
              style={styles.modalCard}
              onPress={() => {}}
              accessible={false}
            >
              <Text style={styles.modalTitle}>Rename session</Text>
              <TextInput
                style={styles.modalInput}
                accessibilityLabel="Session name"
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                placeholder="Session name"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setRenameOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={styles.modalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitRename}
                  accessibilityRole="button"
                  accessibilityLabel="Save session name"
                >
                  <Text style={styles.modalSave}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 13,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restoreText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  modelLabel: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: 12,
    maxWidth: '40%',
  },
  messages: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  olderHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  olderText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  olderLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  beginningText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  emptyChat: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyBody: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  typingText: {
    color: colors.working,
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  modalInput: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  modalCancel: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
  modalSave: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  modalDanger: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  menuTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  menuItemLast: {
    justifyContent: 'center',
  },
  menuItemText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  menuItemDanger: {
    color: colors.danger,
  },
  menuItemMuted: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
});
