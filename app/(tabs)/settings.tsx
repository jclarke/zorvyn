import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  Input,
  Label,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { API_BASE } from '@/lib/api';
import { shortId } from '@/lib/format';
import { loadGithubToken, saveGithubToken } from '@/lib/github';
import { colors, spacing } from '@/lib/theme';

const KEYS_URL = 'https://app.conductor.build/users/api-keys';
const DOCS_URL = 'https://www.conductor.build/docs/api';
// Classic PAT form with required scopes pre-checked (repo covers private PR/file reads).
// https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
const GITHUB_TOKEN_URL =
  'https://github.com/settings/tokens/new?description=Zorvyn%20%E2%80%94%20read%20PR%20files%20for%20Conductor%20workspaces&scopes=repo';

export default function SettingsScreen() {
  const { me, apiKey, signOut, refreshMe } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubSaved, setGithubSaved] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);

  const refreshGithub = useCallback(async () => {
    const t = await loadGithubToken();
    setHasGithubToken(!!t);
    setGithubToken('');
  }, []);

  useEffect(() => {
    void refreshGithub();
  }, [refreshGithub]);

  async function copyKey() {
    if (!apiKey) return;
    await Clipboard.setStringAsync(apiKey);
    if (Platform.OS === 'web') {
      // Alert.alert is unreliable on web
      window.alert('API key copied to clipboard');
    } else {
      Alert.alert('Copied', 'API key copied to clipboard');
    }
  }

  async function onRefresh() {
    setBusy(true);
    try {
      await refreshMe();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Refresh failed';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  async function performSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  }

  function onSignOut() {
    const message = 'Remove the stored Conductor API key from this device?';
    if (Platform.OS === 'web') {
      // RN Alert.alert does not work on web — confirm never runs
      if (typeof window !== 'undefined' && window.confirm(message)) {
        void performSignOut();
      }
      return;
    }

    Alert.alert('Sign out', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void performSignOut();
        },
      },
    ]);
  }

  async function onSaveGithub() {
    setGithubBusy(true);
    setGithubSaved(false);
    try {
      await saveGithubToken(githubToken.trim() || null);
      setHasGithubToken(!!githubToken.trim());
      setGithubToken('');
      setGithubSaved(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to store token';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Could not save', msg);
    } finally {
      setGithubBusy(false);
    }
  }

  function onClearGithub() {
    const message =
      'Remove GitHub token? PR file lists will only work for public repos.';
    const clear = async () => {
      await saveGithubToken(null);
      setHasGithubToken(false);
      setGithubToken('');
      setGithubSaved(false);
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        void clear();
      }
      return;
    }

    Alert.alert('Remove GitHub token?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void clear();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionHeader title="Account" />
        <Card style={styles.card}>
          <InfoRow label="User ID" value={me?.userId || '—'} />
          <InfoRow label="Email" value={me?.email || '—'} />
          <InfoRow label="Organization" value={me?.organizationId || '—'} />
          <InfoRow label="Auth method" value={me?.authMethod || '—'} />
          {me?.apiKey?.id ? (
            <InfoRow label="API key ID" value={me.apiKey.id} />
          ) : null}
          {me?.workspaceId ? (
            <InfoRow label="Workspace scope" value={me.workspaceId} />
          ) : null}
        </Card>

        <SectionHeader title="Conductor Cloud" />
        <Card style={styles.card}>
          <Body muted>
            Zorvyn is an independent client for{' '}
            <Text style={styles.em}>Conductor Cloud</Text> only. It talks to{' '}
            <Text style={styles.mono}>{API_BASE}</Text> and is not affiliated
            with Conductor.
          </Body>
          <InfoRow label="API base" value={API_BASE} />
          <InfoRow
            label="Stored key"
            value={apiKey ? `••••${apiKey.slice(-6)}` : '—'}
          />
          <Button
            title="Create API key on Conductor"
            variant="secondary"
            icon="open-outline"
            onPress={() => Linking.openURL(KEYS_URL)}
          />
          <Caption>
            Generate keys at app.conductor.build/users/api-keys
          </Caption>
          <View style={styles.actions}>
            <Button
              title="Copy API key"
              variant="secondary"
              icon="copy-outline"
              onPress={copyKey}
              style={{ flex: 1 }}
            />
            <Button
              title="Refresh /me"
              variant="secondary"
              icon="refresh-outline"
              onPress={onRefresh}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
          <Button
            title="API docs"
            variant="ghost"
            onPress={() => Linking.openURL(DOCS_URL)}
          />
        </Card>

        <SectionHeader title="GitHub (optional)" />
        <Card style={styles.card}>
          <Body muted>
            Used on the workspace Changes screen to list pull request files for
            private repositories across your orgs. A classic PAT with the{' '}
            <Text style={styles.mono}>repo</Text> scope works for every org you
            can access (authorize SAML SSO per org if prompted).
          </Body>
          <Button
            title="Create classic PAT"
            variant="secondary"
            icon="open-outline"
            onPress={() => Linking.openURL(GITHUB_TOKEN_URL)}
          />
          <Caption>
            Opens GitHub’s classic token form with{' '}
            <Text style={styles.mono}>repo</Text> pre-checked. Generate, copy
            the <Text style={styles.mono}>ghp_…</Text> token, paste below. If an
            org uses SAML SSO: token → Configure SSO → Authorize.
          </Caption>
          <InfoRow
            label="Status"
            value={
              hasGithubToken ? 'Token saved on this device' : 'Not connected'
            }
          />
          <Input
            label="Personal access token"
            placeholder={
              hasGithubToken ? 'Enter a new token to replace' : 'ghp_…'
            }
            value={githubToken}
            onChangeText={setGithubToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={Platform.OS !== 'web'}
            textContentType="password"
          />
          <View style={styles.actions}>
            <Button
              title="Save token"
              icon="logo-github"
              onPress={onSaveGithub}
              loading={githubBusy}
              disabled={!githubToken.trim()}
              style={{ flex: 1 }}
            />
            {hasGithubToken ? (
              <Button
                title="Remove"
                variant="danger"
                onPress={onClearGithub}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
          {githubSaved ? (
            <Caption style={{ color: colors.success }}>Saved.</Caption>
          ) : null}
        </Card>

        <SectionHeader title="Features" />
        <Card style={styles.card}>
          <Body muted style={styles.feature}>
            Built for Conductor Cloud workspaces + optional GitHub:
          </Body>
          {[
            'Projects & cloud workspaces',
            'Agent chat with live status',
            'Activity search over transcripts',
            'Changes — agent file activity + GitHub PR files',
            'Linear/GitHub links detected in transcripts',
          ].map((line) => (
            <Text key={line} style={styles.bullet}>
              · {line}
            </Text>
          ))}
        </Card>

        <Button
          title="Sign out"
          variant="danger"
          icon="log-out-outline"
          onPress={onSignOut}
          loading={signingOut}
        />

        <Caption style={styles.footer}>
          Zorvyn · independent client for Conductor Cloud
          {'\n'}
          Keys: app.conductor.build/users/api-keys ·{' '}
          {shortId(me?.userId, 12)}
        </Caption>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Label>{label}</Label>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  infoRow: {
    gap: 4,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  feature: {
    marginBottom: spacing.sm,
  },
  bullet: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  mono: {
    fontFamily: 'SpaceMono',
    color: colors.accent,
  },
  em: {
    color: colors.text,
    fontWeight: '600',
  },
});
