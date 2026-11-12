import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { makeStyles, useTheme } from "@/src/theme";
import { api, type Agent } from "@/src/api";

export default function Agents() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.agents()
      .then((a) => {
        setAgents(a);
        setLimits(Object.fromEntries(a.map((x) => [x.id, String(x.limit)])));
      })
      .catch((e) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const replace = (a: Agent) => setAgents((list) => list?.map((x) => (x.id === a.id ? a : x)) ?? null);

  const toggle = async (a: Agent, v: boolean) => {
    replace({ ...a, enabled: v });
    try {
      replace(await api.updateAgent(a.id, { enabled: v }));
    } catch {
      replace(a);
    }
  };

  const saveLimit = async (a: Agent) => {
    const n = parseFloat(limits[a.id]);
    if (isNaN(n) || n < 0) {
      setLimits((l) => ({ ...l, [a.id]: String(a.limit) }));
      return;
    }
    if (n === a.limit) return;
    try {
      replace(await api.updateAgent(a.id, { limit: n }));
      flash(`${a.name} limit set to $${n.toFixed(2)}`);
    } catch {
      setLimits((l) => ({ ...l, [a.id]: String(a.limit) }));
      flash("Limit must be between $0 and $10,000");
    }
  };

  const revoke = async (a: Agent) => {
    try {
      replace(await api.revokeAgent(a.id));
      flash(`${a.name} access revoked`);
    } catch (e: any) {
      flash(e.message);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="agents-screen">
      <View style={styles.nav}>
        <Pressable testID="agents-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <Text style={styles.large}>Agent Controls</Text>
        <Text style={styles.sub}>Choose which AI agents can shop with your Citi Custom Cash® card ···· 4680 and how much they can spend per purchase.</Text>

        {!agents && !error && <ActivityIndicator style={styles.loader} color={colors.muted} />}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Failed to load agent settings.</Text>
            <Pressable testID="agents-retry-button" onPress={load}><Text style={styles.retry}>Retry</Text></Pressable>
          </View>
        )}
        {agents?.map((a) => (
          <View key={a.id} style={styles.card} testID={`agent-card-${a.id}`}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{a.name[0]}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.meta}>{a.provider} · {a.protocol}</Text>
              </View>
              <Switch
                testID={`agent-toggle-${a.id}`}
                value={a.enabled}
                onValueChange={(v) => toggle(a, v)}
                trackColor={{ true: colors.success, false: colors.surfaceTertiary }}
              />
            </View>
            <Text style={[styles.status, { color: a.revoked ? colors.error : a.enabled ? colors.success : colors.muted }]} testID={`agent-status-${a.id}`}>
              {a.revoked ? "Access revoked" : a.enabled ? "Active — can request purchases" : "Paused"}
            </Text>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Spending limit per purchase</Text>
              <View style={styles.limitInput}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  testID={`agent-limit-input-${a.id}`}
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={limits[a.id] ?? ""}
                  onChangeText={(t) => setLimits((l) => ({ ...l, [a.id]: t }))}
                  onEndEditing={() => saveLimit(a)}
                  onBlur={() => saveLimit(a)}
                  returnKeyType="done"
                />
              </View>
            </View>
            {!a.revoked && (
              <Pressable testID={`agent-revoke-button-${a.id}`} style={styles.revoke} onPress={() => revoke(a)}>
                <Ionicons name="ban" size={16} color={colors.error} />
                <Text style={styles.revokeText}>Revoke Access</Text>
              </Pressable>
            )}
          </View>
        ))}
      </KeyboardAwareScrollView>
      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 16 }]} testID="agents-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  flex: { flex: 1 },
  nav: { paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, gap: 12 },
  large: { fontSize: 32, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, lineHeight: 20 },
  loader: { marginTop: 32 },
  errorBox: { backgroundColor: c.surface, borderRadius: 12, padding: 16, flexDirection: "row", justifyContent: "space-between" },
  errorText: { color: c.error },
  retry: { color: c.info, fontWeight: "600" },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onSurfaceInverse, fontWeight: "700", fontSize: 16 },
  name: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  meta: { fontSize: 12, color: c.muted },
  status: { fontSize: 12, fontWeight: "600" },
  limitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 12 },
  limitLabel: { fontSize: 13, color: c.onSurface, flex: 1 },
  limitInput: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: 8, paddingHorizontal: 10, height: 40, minWidth: 100 },
  dollar: { fontSize: 15, color: c.muted },
  input: { flex: 1, fontSize: 15, color: c.onSurface, paddingHorizontal: 4 },
  revoke: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", minHeight: 44 },
  revokeText: { color: c.error, fontSize: 14, fontWeight: "700" },
  toast: { position: "absolute", left: 16, right: 16, backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 14 },
  toastText: { color: c.onSurfaceInverse, fontSize: 14, textAlign: "center" },
}));
