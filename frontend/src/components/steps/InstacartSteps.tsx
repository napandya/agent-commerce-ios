import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { SlideInDown } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";
import { money, type CheckoutSession, type PaymentOption } from "@/src/api";
import { InstacartMark, MastercardLogo, TargetLogo } from "@/src/components/Brand";
import type { AgentConfig } from "@/src/agents";

const TIPS = [2, 3.5, 5, 6.5];

function StoreMark({ agent }: { agent: AgentConfig }) {
  const styles = useStyles();
  return agent.store === "instacart" ? (
    <InstacartMark />
  ) : (
    <View style={styles.storeRow}><TargetLogo size={18} /><Text style={styles.sheetTitle}>Target</Text></View>
  );
}

function ReviewOrder({
  session, dim, onTip, tipping,
}: { session: CheckoutSession; dim?: boolean; onTip?: (t: number) => void; tipping?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = session.totals;
  const rows: [string, number][] = [
    ["Items subtotal", t.subtotal], ["Delivery fee", t.delivery_fee], ["Service fee", t.service_fee],
    ["Bag fee", t.bag_fee], ["Estimated tax", t.tax],
  ];
  return (
    <ScrollView style={styles.review} contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}>
      <View style={dim && styles.dim}>
        <View style={styles.reviewHead}>
          <View style={styles.w24} />
          <Text style={styles.reviewTitle}>Review order</Text>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </View>
        <Text style={styles.label}>Deliver to</Text>
        <Text style={styles.addr}>10848 South Bell Avenue, Chicago</Text>
        <Text style={styles.small}>Leave at door · add instructions</Text>
        <View style={styles.row2}>
          <View style={[styles.opt, styles.optOn]}>
            <Text style={styles.optTitle}>Fast</Text>
            <Text style={styles.small}>{session.fulfillment.window}</Text>
          </View>
          <View style={styles.opt}>
            <Text style={styles.optTitle}>Schedule for later</Text>
            <Text style={styles.small}>Choose a time</Text>
          </View>
        </View>
        <Text style={[styles.label, styles.mt]}>Items</Text>
        {session.line_items.map((l) => (
          <View key={l.product.id} style={styles.sumRow} testID={`review-line-${l.product.id}`}>
            <Text style={[styles.small, styles.flex]} numberOfLines={1}>{l.quantity}× {l.product.short} · {l.product.variant}</Text>
            <Text style={styles.sumVal}>{money(l.line_total)}</Text>
          </View>
        ))}
        <Text style={[styles.label, styles.mt]}>Summary</Text>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.sumRow}>
            <Text style={styles.small}>{k}</Text>
            <Text style={styles.sumVal}>{money(v)}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.sumRow, styles.mt]}>
        <View>
          <Text style={styles.optTitle}>Delivery tip</Text>
          <Text style={styles.small}>{onTip ? "100% of your tip goes to the delivery person" : "Locked by Citi authorization"}</Text>
        </View>
        <Text style={styles.sumVal} testID="review-tip">{money(t.tip)}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tipRow}>
        {TIPS.map((x) => {
          const on = Math.abs(x - t.tip) < 0.001;
          return (
            <Pressable
              key={x}
              testID={`tip-chip-${x}`}
              disabled={!onTip || tipping}
              onPress={() => onTip?.(x)}
              style={[styles.tip, on && styles.tipOn, !onTip && !on && styles.tipOff]}
            >
              <Text style={[styles.tipText, on && styles.tipTextOn]}>${x % 1 ? x.toFixed(2) : x}</Text>
            </Pressable>
          );
        })}
        {tipping && <ActivityIndicator size="small" color={colors.muted} />}
      </ScrollView>
    </ScrollView>
  );
}

export function PaymentStep({
  agent, session, onContinue, onTip, tipping,
}: { agent: AgentConfig; session: CheckoutSession; onContinue: () => void; onTip: (t: number) => void; tipping: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.root} testID="payment-step">
      <ReviewOrder session={session} onTip={onTip} tipping={tipping} />
      <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <StoreMark agent={agent} />
          <Text style={styles.sheetTitle}>Select payment method</Text>
          <Text style={styles.headTotal} testID="payment-total">{money(session.totals.total)}</Text>
        </View>
        <Text style={styles.small}>New payment method</Text>
        <View style={styles.list}>
          <Pressable testID="payment-citi-card-row" style={styles.listRow} onPress={onContinue}>
            <MastercardLogo />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Add your card</Text>
              <Text style={styles.small}>Citi MasterCard ending in {session.card.last4}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={[styles.rowTitle, styles.flex]}>Manual Card Enrollment</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </View>
        <Pressable testID="payment-continue-button" style={styles.cta} onPress={onContinue}>
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function PayStep({
  agent, session, onPay, paying, error,
}: { agent: AgentConfig; session: CheckoutSession; onPay: (o: PaymentOption) => void; paying: boolean; error?: string | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [option, setOption] = useState<PaymentOption>("card");
  const total = session.totals.total;
  const opts: { id: PaymentOption; title: string; sub: string }[] = [
    { id: "flex_pay", title: "Pay Later with Flex Pay", sub: `6 equal monthly payments of ${money(total / 6)}, 0% APR` },
    { id: "points", title: "Use Citi ThankYou® Points", sub: `Balance: 150,250 points · uses ${Math.round(total * 100).toLocaleString()} pts` },
  ];
  return (
    <View style={styles.root} testID="pay-step">
      <ReviewOrder session={session} dim />
      <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <View style={styles.w24} />
          <StoreMark agent={agent} />
          <Ionicons name="close" size={20} color={colors.muted} />
        </View>
        <View style={styles.list}>
          <Pressable testID="pay-option-card" style={styles.listRow} onPress={() => setOption("card")}>
            <MastercardLogo />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Mastercard ···· {session.card.last4}</Text>
              <Text style={styles.small}>5x Citi ThankYou® Points with {agent.storeLabel}</Text>
            </View>
            <Ionicons name={option === "card" ? "radio-button-on" : "radio-button-off"} size={20} color={option === "card" ? colors.stepActive : colors.borderStrong} />
          </Pressable>
          {opts.map((o) => (
            <View key={o.id}>
              <View style={styles.divider} />
              <Pressable testID={`pay-option-${o.id}`} style={styles.listRow} onPress={() => setOption(o.id)}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{o.title}</Text>
                  <Text style={styles.small}>{o.sub}</Text>
                </View>
                <Ionicons name={option === o.id ? "radio-button-on" : "radio-button-off"} size={20} color={option === o.id ? colors.stepActive : colors.borderStrong} />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.rowTitle}>Pay {agent.storeLabel}</Text>
          <Text style={styles.total} testID="pay-total">{money(total)}</Text>
        </View>
        {error ? <Text style={styles.error} testID="pay-error">{error}</Text> : null}
        <Pressable testID="pay-instacart-button" style={styles.cta} onPress={() => onPay(option)} disabled={paying}>
          {paying ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Pay {agent.storeLabel}</Text>}
        </Pressable>
        <Text style={styles.legal}>
          By continuing, you agree to {agent.storeLabel}'s terms and privacy policy. {agent.id === "gemini" ? "Google" : "OpenAI"} does not process your order, collect payment, or handle fulfillment.
        </Text>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  flex: { flex: 1 },
  w24: { width: 24 },
  review: { flex: 1 },
  dim: { opacity: 0.45 },
  reviewContent: { padding: 16, gap: 4, paddingBottom: 340 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headTotal: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  tipOff: { opacity: 0.4 },
  tipText: { fontSize: 13, color: c.onSurface, fontWeight: "600" },
  tipTextOn: { color: c.surface },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  reviewTitle: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  label: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  mt: { marginTop: 12 },
  addr: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  small: { fontSize: 12, color: c.muted },
  row2: { flexDirection: "row", gap: 8, marginTop: 8 },
  opt: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 8, backgroundColor: c.surface },
  optOn: { backgroundColor: c.surfaceTertiary },
  optTitle: { fontSize: 13, fontWeight: "600", color: c.onSurface },
  sumRow: { flexDirection: "row", justifyContent: "space-between" },
  sumVal: { fontSize: 12, color: c.onSurface },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tip: { flexShrink: 0, height: 36, minWidth: 56, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, backgroundColor: c.surface },
  tipOn: { backgroundColor: c.onSurfaceTertiary, borderColor: c.onSurfaceTertiary },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 16, gap: 8,
    shadowColor: c.onSurface, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginTop: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  closeCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  list: { borderWidth: 1, borderColor: c.border, borderRadius: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, minHeight: 56 },
  divider: { height: 1, backgroundColor: c.divider },
  rowTitle: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 4 },
  total: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  error: { fontSize: 13, color: c.error },
  cta: { height: 50, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 4 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  legal: { fontSize: 10, color: c.muted, textAlign: "center", lineHeight: 14 },
}));
