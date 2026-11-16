import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, money, type Txn } from "@/src/api";
import { InsightsCard } from "@/src/components/InsightsCard";

const STATUS = {
  completed: { label: "Completed", key: "success" },
  approved: { label: "Approved", key: "info" },
  declined: { label: "Declined", key: "error" },
} as const;

export default function Activity() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Txn[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setError(false);
    setRefreshKey((k) => k + 1);
    return api.transactions().then(setItems).catch(() => setError(true));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="activity-screen">
      <View style={styles.nav}>
        <Pressable testID="activity-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.large}>Agent Activity</Text>
            <Text style={styles.sub}>Purchases requested by AI agents on card ···· 4680</Text>
            <View style={styles.insights}>
              <InsightsCard refreshKey={refreshKey} />
            </View>
            <Text style={styles.section}>ALL TRANSACTIONS</Text>
          </View>
        }
        ListEmptyComponent={
          items === null && !error ? (
            <ActivityIndicator color={colors.muted} style={styles.loader} />
          ) : error ? (
            <Text style={styles.errorText} testID="activity-error">Failed to load transactions. Pull to retry.</Text>
          ) : (
            <View style={styles.empty} testID="activity-empty">
              <Ionicons name="sparkles-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>No agent transactions yet</Text>
              <Text style={[styles.sub, styles.center]}>Run the shopping journey to see ChatGPT purchases here.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const st = STATUS[item.status];
          const tone = colors[st.key];
          return (
            <View style={styles.row} testID={`txn-row-${item.id}`}>
              <View style={styles.avatar}><Ionicons name="bag-handle" size={18} color={colors.onSurfaceInverse} /></View>
              <View style={styles.flex}>
                <Text style={styles.merchant}>{item.merchant}</Text>
                <Text style={styles.meta} numberOfLines={1}>via {item.agent_name} · {item.item}</Text>
                <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
                {item.reason ? <Text style={[styles.meta, { color: colors.error }]}>{item.reason}</Text> : null}
                {item.statement_credit ? (
                  <Text style={[styles.meta, styles.credit]} testID={`txn-credit-${item.id}`}>Citi offer · ${item.statement_credit.toFixed(2)} credit pending</Text>
                ) : null}
              </View>
              <View style={styles.right}>
                <Text style={[styles.amount, item.status === "declined" && styles.strike]}>{money(item.amount)}</Text>
                <Text style={[styles.badge, { color: tone, borderColor: tone }]}>{st.label}</Text>
                {item.points_earned > 0 && <Text style={styles.pts}>+{item.points_earned} pts</Text>}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  flex: { flex: 1 },
  nav: { paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, gap: 8 },
  head: { gap: 4, marginBottom: 8 },
  insights: { marginTop: 12 },
  section: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 0.5 },
  large: { fontSize: 32, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, textAlign: "left" },
  loader: { marginTop: 32 },
  center: { textAlign: "center" },
  errorText: { color: c.error, marginTop: 24 },
  empty: { alignItems: "center", gap: 8, marginTop: 48 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  row: { flexDirection: "row", gap: 12, backgroundColor: c.surface, borderRadius: 16, padding: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  merchant: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  meta: { fontSize: 12, color: c.muted, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 4 },
  amount: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  strike: { textDecorationLine: "line-through", color: c.muted },
  badge: { fontSize: 11, fontWeight: "700", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  pts: { fontSize: 11, fontWeight: "600", color: c.onBrandTertiary },
  credit: { color: c.success, fontWeight: "600" },
}));
