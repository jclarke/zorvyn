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
  Alert,
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

import { MessageBubble } from '@/components/MessageBubble';
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
import { parseTranscript } from '@/lib/transcript';
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
  const [hasOlder, setHasOlder] = useState(false);

  const listRef = useRef<FlatList>(null);
  const lastIdRef = useRef<string | undefined>(undefined);
  const oldestOffsetRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingOlderRef = useRef(false);

  // Newest-first for inverted FlatList (index 0 sits at the visual bottom).
  const listData = React.useMemo(
    () => [...parseTranscript(messages)].reverse(),
    [messages],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: name || session?.name || 'Chat',
      headerRight: () => (
        <Pressable onPress={showMenu} hitSlop={10} style={styles.headerRight}>
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={colors.text}
          />
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, name, session?.name, status?.status]);

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

  async function onSend() {
    const text = draft.trim();
    if (!text || sending || waking || !client) return;

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

      // No dedicated wake API: POST message queues + wakes a sleeping sandbox.
      // If asleep/initializing, surface waking UI and wait until ready after send.
      if (life.wasAsleep) {
        setWaking(true);
      }

      await client.sendMessage(id, { message: text });
      setDraft('');

      if (life.wasAsleep || life.status.status !== 'ready') {
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

  async function onCancel() {
    if (!client) return;
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
      Alert.alert(
        'Cancel requested',
        res.canceledQueuedMessages
          ? `Dropped ${res.canceledQueuedMessages} queued message(s). Polling until idle.`
          : 'Stopping the current turn…',
      );
    } catch (e) {
      Alert.alert('Cancel failed', e instanceof Error ? e.message : 'Error');
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
      Alert.alert('Rename failed', e instanceof Error ? e.message : 'Error');
    }
  }

  function showMenu() {
    Alert.alert('Session', undefined, [
      {
        text: 'Rename',
        onPress: () => {
          setRenameValue(session?.name || '');
          setRenameOpen(true);
        },
      },
      {
        text: status?.status === 'working' ? 'Stop agent' : 'Cancel turn',
        style: 'destructive',
        onPress: onCancel,
      },
      {
        text: 'Archive session',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Archive session',
            'Close this chat tab, stop the agent, and drop queued messages?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Archive',
                style: 'destructive',
                onPress: async () => {
                  if (!client) return;
                  try {
                    await client.archiveSession(id);
                    await loadInitial();
                  } catch (e) {
                    Alert.alert(
                      'Archive failed',
                      e instanceof Error ? e.message : 'Error',
                    );
                  }
                },
              },
            ],
          );
        },
      },
      { text: 'Dismiss', style: 'cancel' },
    ]);
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
  const statusHint = waking
    ? workspaceStatus?.lifecycleStep
      ? `Waking workspace… ${workspaceStatus.lifecycleStep}`
      : 'Waking workspace…'
    : wsLifecycle === 'sleeping'
      ? 'Workspace sleeping — next message will wake it'
      : wsLifecycle === 'initializing' || wsLifecycle === 'updating'
        ? `Workspace ${wsLifecycle}${workspaceStatus?.lifecycleStep ? ` · ${workspaceStatus.lifecycleStep}` : ''}`
        : working
          ? 'Agent is working…'
          : status?.status === 'error'
            ? status.errorMessage || status.lastError || 'Agent error'
            : seenWorking
              ? 'Agent idle'
              : status?.status || 'idle';

  const statusDotKind = waking
    ? 'initializing'
    : wsLifecycle === 'sleeping'
      ? 'sleeping'
      : wsLifecycle === 'initializing' || wsLifecycle === 'updating'
        ? wsLifecycle
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
          {working && !waking ? (
            <Pressable onPress={onCancel} style={styles.stopBtn}>
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => <MessageBubble message={item} />}
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
                <ActivityIndicator size="small" color={colors.working} />
                <Text style={styles.typingText}>Working…</Text>
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
                  <Pressable onPress={() => void loadOlder()} hitSlop={8}>
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
            placeholder="Tell the agent what to build…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={100000}
            editable={!sending}
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sending || waking}
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

        <Modal
          visible={renameOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setRenameOpen(false)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Rename session</Text>
              <TextInput
                style={styles.modalInput}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                placeholder="Session name"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setRenameOpen(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </Pressable>
                <Pressable onPress={submitRename}>
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
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
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
});
