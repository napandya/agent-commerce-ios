import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInUp, ZoomIn } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";
import { money, type CheckoutSession, type Order, type Txn } from "@/src/api";

const OPTION_LABEL = { card: "Citi Mastercard ···· 4680", flex_pay: "Citi Flex Pay", points: "Citi ThankYou® Points" };

export function ConfirmedStep({
  agentName, walletName, session, order, txn, declined, onActivity, onRestart,
}: {
  agentName: string; walletName: string; session: CheckoutSession; order: Order | null; txn: Txn | null; declined: boolean;
  onActivity: () => void; onRestart: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const rows: [string, string][] = declined
    ? [
        ["Merchant", session.merchant],
        ["Agent", agentName],
        ["Amount", money(session.totals.total)],
        ["Reason", txn?.reason ?? "Declined"],
      ]
    : [
        ["Order", order?.order_id ?? "—"],
        ...session.line_items.map((l) => [`${l.quantity}×`, `${l.product.name} (${l.product.variant})`] as [string, string]),
        ["Tip", money(session.totals.tip)],
        ["Paid with", order ? `${walletName} · ${OPTION_LABEL[order.payment_option]}` : "—"],
        ...(order?.flex_monthly ? [["Flex Pay", `6 × ${money(order.flex_monthly)}/mo`] as [string, string]] : []),
        ["Total", money(session.totals.total)],
        ["Delivery", order?.eta ?? "Delivery by 11:45am"],
      ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} testID={declined ? "declined-step" : "confirmed-step"}>
      <Animated.View entering={ZoomIn.springify()} style={[styles.badge, declined && styles.badgeFail]}>
        <Ionicons name={declined ? "close" : "checkmark"} size={44} color={declined ? colors.onError : colors.onSuccess} />
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(120)} style={styles.title} testID="outcome-title">
        {declined ? "Purchase declined" : "Order confirmed"}
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(180)} style={styles.sub}>
        {declined
          ? `No payment credential was issued. ${agentName} has been told the purchase was not authorized.`
          : `${session.merchant} is preparing your order. ${agentName} received the order confirmation.`}
      </Animated.Text>

      {!declined && order && order.points_earned > 0 && (
        <Animated.View entering={FadeInUp.delay(240)} style={styles.points} testID="points-earned">
          <Ionicons name="star" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.pointsText}>+{order.points_earned.toLocaleString()} ThankYou® Points earned (5x)</Text>
        </Animated.View>
      )}

      <Animated.View entering={FadeInUp.delay(300)} style={styles.card}>
        {rows.map(([k, v], i) => (
          <View key={`${k}-${i}`} style={[styles.row, i === rows.length - 1 && styles.noBorder]}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.val}>{v}</Text>
          </View>
        ))}
      </Animated.View>

      <Pressable testID="view-agent-activity-button" style={styles.primary} onPress={onActivity}>
        <Text style={styles.primaryText}>View Agent Activity</Text>
      </Pressable>
      <Pressable testID="restart-journey-button" style={styles.secondary} onPress={onRestart}>
        <Ionicons name="refresh" size={16} color={colors.onSurface} />
        <Text style={styles.secondaryText}>Run the journey again</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 24, alignItems: "center", gap: 12 },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.success, alignItems: "center", justifyContent: "center", marginTop: 16 },
  badgeFail: { backgroundColor: c.error },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, textAlign: "center", lineHeight: 20 },
  points: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.brandTertiary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pointsText: { fontSize: 13, fontWeight: "700", color: c.onBrandTertiary },
  card: { alignSelf: "stretch", backgroundColor: c.surfaceSecondary, borderRadius: 16, paddingHorizontal: 16, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider, gap: 12 },
  noBorder: { borderBottomWidth: 0 },
  key: { fontSize: 13, color: c.muted },
  val: { fontSize: 13, fontWeight: "600", color: c.onSurface, flexShrink: 1, textAlign: "right" },
  primary: { alignSelf: "stretch", height: 50, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  secondary: { flexDirection: "row", gap: 6, alignItems: "center", height: 44, paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontWeight: "600", color: c.onSurface },
}));
