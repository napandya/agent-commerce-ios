import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { api, money, type Breakdown, type Insights } from "@/src/api";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const labelOf = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function InsightsCard({ refreshKey }: { refreshKey: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);

  const load = useCallback(() => {
    setError(false);
    setData(null);
    api.insights(keyOf(new Date(new Date().getFullYear(), new Date().getMonth() - offset, 1))).then(setData).catch(() => setError(true));
  }, [offset]);
  useEffect(load, [load, refreshKey]);

  return (
    <View style={styles.card} testID="insights-card">
      <View style={styles.head}>
        <Pressable testID="insights-prev-month" style={styles.arrow} onPress={() => setOffset((o) => Math.min(o + 1, 11))}>
          <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.month} testID="insights-month">{labelOf(month)}</Text>
        <Pressable testID="insights-next-month" style={styles.arrow} onPress={() => setOffset((o) => Math.max(o - 1, 0))} disabled={offset === 0}>
          <Ionicons name="chevron-forward" size={18} color={offset === 0 ? colors.borderStrong : colors.onSurface} />
        </Pressable>
      </View>
      {error ? (
        <Pressable onPress={load} testID="insights-error"><Text style={styles.err}>Failed to load insights. Tap to retry.</Text></Pressable>
      ) : !data ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <>
          <Text style={styles.kicker}>AGENT SPEND</Text>
          <Text style={styles.total} testID="insights-total">{money(data.total_spent)}</Text>
          <View style={styles.stats}>
            <Stat label="Purchases" value={String(data.purchases)} testID="insights-purchases" />
            <Stat label="Declined" value={String(data.declined)} testID="insights-declined" />
            <Stat label="Points" value={`+${data.points_earned.toLocaleString()}`} testID="insights-points" />
          </View>
          {data.purchases === 0 ? (
            <Text style={styles.empty}>No agent purchases this month.</Text>
          ) : (
            <>
              <Bars title="By agent" rows={data.by_agent} total={data.total_spent} color={colors.stepActive} prefix="agent" />
              <Bars title="By merchant" rows={data.by_merchant} total={data.total_spent} color={colors.brandSecondary} prefix="merchant" />
            </>
          )}
        </>
      )}
    </View>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal} testID={testID}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bars({ title, rows, total, color, prefix }: { title: string; rows: Breakdown[]; total: number; color: string; prefix: string }) {
  const styles = useStyles();
  return (
    <View style={styles.bars}>
      <Text style={styles.barsTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={r.name} style={styles.barRow} testID={`insights-${prefix}-${r.name.replace(/\s+/g, "-").toLowerCase()}`}>
          <View style={styles.barLabels}>
            <Text style={styles.barName} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.barAmt}>{money(r.amount)} · {r.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, (r.amount / (total || 1)) * 100)}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 8, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: c.surfaceSecondary },
  month: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  loader: { marginVertical: 24 },
  err: { color: c.error, fontSize: 13, paddingVertical: 12 },
  kicker: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 1, marginTop: 4 },
  total: { fontSize: 32, fontWeight: "800", color: c.onSurface },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12 },
  statVal: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  statLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
  empty: { fontSize: 13, color: c.muted, paddingVertical: 8 },
  bars: { gap: 8, marginTop: 8 },
  barsTitle: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  barRow: { gap: 4 },
  barLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  barName: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary },
  barAmt: { fontSize: 13, fontWeight: "600", color: c.onSurface },
  track: { height: 8, borderRadius: 4, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
}));
