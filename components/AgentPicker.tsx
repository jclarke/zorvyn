import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  AGENTS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  EFFORTS_BY_AGENT,
  MODELS_BY_AGENT,
  supportsFastMode,
} from '@/lib/models';
import type { Agent, Effort, Model } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';
import { Chip, Input, Label } from './ui';

export type AgentConfig = {
  agent: Agent;
  model?: Model;
  effort?: Effort;
  fastMode?: boolean;
  name?: string;
  sessionName?: string;
  branch?: string;
};

type Props = {
  value: AgentConfig;
  onChange: (next: AgentConfig) => void;
  showName?: boolean;
  showSessionName?: boolean;
  showBranch?: boolean;
  nameLabel?: string;
};

export function AgentPicker({
  value,
  onChange,
  showName,
  showSessionName,
  showBranch,
  nameLabel = 'Workspace name',
}: Props) {
  const models = MODELS_BY_AGENT[value.agent] || [];
  const efforts = EFFORTS_BY_AGENT[value.agent] || [];
  const canFast = supportsFastMode(value.model);

  function setAgent(agent: Agent) {
    const model = DEFAULT_MODEL[agent];
    const effort = DEFAULT_EFFORT[agent];
    onChange({
      ...value,
      agent,
      model,
      effort,
      fastMode: false,
    });
  }

  return (
    <View style={styles.wrap}>
      {showName ? (
        <Input
          label={nameLabel}
          placeholder="my-feature-branch"
          value={value.name || ''}
          onChangeText={(name) => onChange({ ...value, name })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}

      {showSessionName ? (
        <Input
          label="Session name"
          placeholder="optional"
          value={value.sessionName || ''}
          onChangeText={(sessionName) => onChange({ ...value, sessionName })}
        />
      ) : null}

      {showBranch ? (
        <Input
          label="Branch (optional)"
          placeholder="main"
          value={value.branch || ''}
          onChangeText={(branch) => onChange({ ...value, branch })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}

      <View style={styles.block}>
        <Label>Agent</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {AGENTS.map((a) => (
              <Chip
                key={a.value}
                label={a.label}
                selected={value.agent === a.value}
                onPress={() => setAgent(a.value)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {models.length > 0 ? (
        <View style={styles.block}>
          <Label>Model</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {models.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={value.model === m}
                  onPress={() =>
                    onChange({
                      ...value,
                      model: m,
                      fastMode: supportsFastMode(m) ? value.fastMode : false,
                    })
                  }
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <Text style={styles.hint}>
          ACP uses the model configured in your Conductor environment.
        </Text>
      )}

      {efforts.length > 0 ? (
        <View style={styles.block}>
          <Label>Effort</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {efforts.map((e) => (
                <Chip
                  key={e}
                  label={e}
                  selected={value.effort === e}
                  onPress={() => onChange({ ...value, effort: e })}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {canFast ? (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Label>Fast mode</Label>
            <Text style={styles.hint}>Speed over depth when supported</Text>
          </View>
          <Switch
            value={!!value.fastMode}
            onValueChange={(fastMode) => onChange({ ...value, fastMode })}
            trackColor={{ false: colors.border, true: colors.accentBorder }}
            thumbColor={value.fastMode ? colors.accent : colors.textMuted}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
