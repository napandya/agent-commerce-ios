import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, FadeInUp, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme } from "@/src/theme";
import { useSkipDelay } from "@/src/presenter";
import { api, money, type Activation, type Cart, type Lookup, type Order } from "@/src/api";
import { MastercardLogo, WalletMark, WayfairLogo } from "@/src/components/Brand";
import type { AgentConfig } from "@/src/agents";

function CitiPageBar({ cart }: { cart: Cart }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <View style={styles.urlBar}>
        <Ionicons name="lock-closed" size={12} color={colors.citiMuted} />
        <Text style={styles.urlText}>online.citi.com/offers</Text>
      </View>
      <View style={styles.cartRef} testID="citi-cart-reference">
        <WayfairLogo size={28} />
        <View style={styles.flex}>
          <Text style={styles.refTitle} numberOfLines={1}>Wayfair cart · {cart.summary}</Text>
          <Text style={styles.refSub}>Ref {cart.cart_ref} · {money(cart.totals.subtotal)}</Text>
        </View>
      </View>
    </View>
  );
}

function CardRow({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cardRow} testID="eligible-card-row">
      <View style={styles.cardArt}><MastercardLogo size={10} /></View>
      <View style={styles.flex}>
        <Text style={styles.cardName}>Citi Custom Cash® Card</Text>
        <Text style={styles.cardSub}>Mastercard ···· 4680 · {label}</Text>
      </View>
    </View>
  );
}

export function CitiSignInStep({ cart, onVerified, auto, skip = 0 }: { cart: Cart; onVerified: () => void; auto?: boolean; skip?: number }) {
  const styles = useStyles();
  const delay = useSkipDelay(skip);
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    list.push(setTimeout(() => setPrompt(true), 700));
    return () => list.forEach(clearTimeout);
  }, []);

  const scan = () => {
    if (phase !== "idle") return;
    setPhase("scanning");
    timers.current.push(
      setTimeout(() => {
        setPhase("done");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        timers.current.push(setTimeout(onVerified, 650));
      }, 1000),
    );
  };

  useEffect(() => {
    const ms = delay(5000);
    if (!auto || phase !== "idle") return;
    if (!prompt) {
      if (ms === 0) setPrompt(true);
      return;
    }
    const t = setTimeout(scan, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, prompt, phase, skip]);

  return (
    <View style={styles.root} testID="citi-signin-step">
      <ScrollView contentContainerStyle={styles.content}>
        <CitiPageBar cart={cart} />
        <Text style={styles.pageTitle}>Citi Offers</Text>
        <Text style={styles.pageSub}>Sign on to see if a Citi card offer applies to this Wayfair cart.</Text>
        <Text style={styles.fieldLabel}>User ID</Text>
        <View style={styles.inputLight}><Text style={styles.inputLightText}>Pjvaughan</Text></View>
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.inputDim}><Text style={styles.inputDimText}>••••••••••</Text></View>
        <Pressable testID="citi-sign-on-button" style={styles.outlineBtn} onPress={() => setPrompt(true)}>
          <Text style={styles.outlineText}>Sign On</Text>
        </Pressable>
      </ScrollView>
      {prompt && (
        <Animated.View entering={FadeIn} style={styles.faceOverlay}>
          <Animated.View entering={ZoomIn.duration(260)}>
            <Pressable testID="faceid-popup" onPress={scan} style={styles.facePopup}>
              <View style={[styles.faceCircle, phase === "done" && styles.faceCircleDone]}>
                {phase === "scanning" ? (
                  <ActivityIndicator color={colors.stepActive} />
                ) : (
                  <Ionicons name={phase === "done" ? "checkmark" : "scan-outline"} size={34} color={phase === "done" ? colors.onSuccess : colors.onSurface} />
                )}
              </View>
              <Text style={styles.faceLabel}>Face ID</Text>
              <Text style={styles.faceHint}>{phase === "idle" ? "Tap to verify" : phase === "scanning" ? "Scanning…" : "Verified"}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const LOOKUP_STEPS = ["Cart reference received from Wayfair", "Looking up eligible offers with Mastercard Offers", "Matches returned"];

export function OffersStep({
  cart, lookup, setLookup, activation, setActivation, onReturn, auto, skip = 0,
}: {
  cart: Cart; lookup: Lookup | null; setLookup: (l: Lookup) => void;
  activation: Activation | null; setActivation: (a: Activation) => void; onReturn: () => void; auto?: boolean; skip?: number;
}) {
  const styles = useStyles();
  const delay = useSkipDelay(skip);
  const { colors } = useTheme();
  const [progress, setProgress] = useState(lookup ? 3 : 0);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (lookup) return;
    let alive = true;
    const t1 = setTimeout(() => alive && setProgress(1), 400);
    const run = async () => {
      try {
        const [res] = await Promise.all([api.lookupOffers(cart.cart_ref), new Promise((r) => setTimeout(r, 1400))]);
        if (!alive) return;
        setProgress(3);
        setLookup(res);
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    run();
    return () => {
      alive = false;
      clearTimeout(t1);
    };
  }, [cart.cart_ref, lookup, setLookup]);

  const activate = async () => {
    if (!lookup?.offer) return;
    setActivating(true);
    setError(null);
    try {
      setActivation(await api.activateOffer(cart.cart_ref, lookup.offer.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActivating(false);
    }
  };

  const done = !!lookup;
  const offer = lookup?.offer;

  useEffect(() => {
    const ms = delay(6500);
    if (!auto || !lookup || activating) return;
    const t = setTimeout(lookup.offer && !activation ? activate : onReturn, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, lookup, activation, activating, skip]);

  return (
    <View style={styles.root} testID="offers-step">
      <ScrollView contentContainerStyle={styles.content}>
        <CitiPageBar cart={cart} />
        <Text style={styles.pageTitle}>Citi Offers</Text>

        {!done && (
          <View style={styles.panel} testID="offers-lookup-progress">
            {LOOKUP_STEPS.map((s, i) => (
              <View key={s} style={styles.progressRow}>
                {progress > i ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                ) : progress === i ? (
                  <ActivityIndicator size="small" color={colors.citiBlue} />
                ) : (
                  <Ionicons name="ellipse-outline" size={18} color={colors.citiBorder} />
                )}
                <Text style={[styles.progressText, progress >= i && styles.progressOn]}>{s}</Text>
              </View>
            ))}
            {error && <Text style={styles.err}>{error}</Text>}
          </View>
        )}

        {done && offer && (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.offerCard} testID="offer-available">
            <Text style={styles.pill}>{offer.program}</Text>
            <View style={styles.offerHead}>
              <WayfairLogo size={36} />
              <View style={styles.flex}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerSub}>{offer.headline}</Text>
              </View>
            </View>
            <View style={styles.creditBox}>
              <Text style={styles.creditLabel}>Estimated credit on this cart</Text>
              <Text style={styles.credit} testID="offer-credit">{money(offer.credit)}</Text>
              <Text style={styles.creditSub}>10% of {money(offer.eligible_spend)} eligible spend</Text>
            </View>
            <Text style={styles.section}>Offer terms</Text>
            {offer.terms.map((t) => (
              <View key={t} style={styles.term}>
                <Ionicons name="checkmark" size={14} color={colors.citiMuted} />
                <Text style={styles.termText}>{t}</Text>
              </View>
            ))}
            <Text style={styles.section}>Eligible Citi card</Text>
            <CardRow label="eligible" />
            {activation ? (
              <Animated.View entering={ZoomIn} style={styles.activated} testID="offer-activated">
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <View style={styles.flex}>
                  <Text style={styles.activatedTitle}>Offer activated</Text>
                  <Text style={styles.activatedSub}>Recorded with Mastercard · {activation.activation_id}</Text>
                </View>
              </Animated.View>
            ) : (
              <Pressable testID="activate-offer-button" style={styles.primaryBtn} onPress={activate} disabled={activating}>
                {activating ? <ActivityIndicator color={colors.onInfo} /> : <Text style={styles.primaryText}>Activate offer</Text>}
              </Pressable>
            )}
            {error && <Text style={styles.err}>{error}</Text>}
          </Animated.View>
        )}

        {done && !offer && (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.offerCard} testID="no-matching-offer">
            <View style={styles.noIcon}><Ionicons name="pricetag-outline" size={28} color={colors.citiMuted} /></View>
            <Text style={styles.offerTitleCenter}>No matching offer</Text>
            <Text style={styles.offerSubCenter} testID="no-offer-reason">{lookup?.reason}</Text>
            <CardRow label="checked" />
          </Animated.View>
        )}

        {done && (
          <Pressable
            testID="return-to-cart-button"
            style={activation || !offer ? styles.primaryBtn : styles.outlineBtn}
            onPress={onReturn}
          >
            <Text style={activation || !offer ? styles.primaryText : styles.outlineText}>
              {offer && !activation ? "Return to cart without activating" : "Return to Wayfair cart"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

export function WayfairCartStep({
  agent, cart, activation, skippedOffer, onPlace, onEdit, placing, error,
}: {
  agent: AgentConfig; cart: Cart; activation: Activation | null; skippedOffer: boolean;
  onPlace: () => void; onEdit: () => void; placing: boolean; error?: string | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = cart.totals;
  const apple = agent.wallet === "apple";
  return (
    <ScrollView style={styles.light} contentContainerStyle={styles.content} testID="wayfair-cart-step">
      <View style={styles.wfHead}>
        <WayfairLogo size={28} />
        <Text style={styles.wfTitle}>Wayfair</Text>
        <Pressable testID="edit-cart-button" onPress={onEdit} style={styles.editBtn} hitSlop={8}>
          <Text style={styles.editText}>Edit cart in {agent.name}</Text>
        </Pressable>
      </View>
      {activation ? (
        <View style={[styles.banner, styles.bannerOn]} testID="cart-offer-activated">
          <Ionicons name="pricetag" size={16} color={colors.onBrandTertiary} />
          <Text style={styles.bannerTextOn}>Citi offer activated · {money(activation.credit)} statement credit after purchase</Text>
        </View>
      ) : (
        <View style={styles.banner} testID="cart-no-offer">
          <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
          <Text style={styles.bannerText}>
            {skippedOffer ? "You skipped an eligible Citi offer — go back to activate it" : "No Citi offer applied to this cart"}
          </Text>
        </View>
      )}
      {cart.line_items.map((l) => (
        <View key={l.product.id} style={styles.item} testID={`wayfair-cart-item-${l.product.id}`}>
          <Image source={{ uri: l.product.image }} style={styles.itemImg} contentFit="cover" />
          <View style={styles.flex}>
            <Text style={styles.itemName} numberOfLines={2}>{l.product.name}</Text>
            <Text style={styles.itemSub}>{l.product.variant} · Qty {l.quantity}</Text>
          </View>
          <Text style={styles.itemPrice}>{money(l.line_total)}</Text>
        </View>
      ))}
      <View style={styles.summary}>
        {([["Subtotal", money(t.subtotal)], ["Shipping", "Free"], ["Estimated tax", money(t.tax)]] as const).map(([k, v]) => (
          <View key={k} style={styles.sumRow}><Text style={styles.sumKey}>{k}</Text><Text style={styles.sumVal}>{v}</Text></View>
        ))}
        <View style={[styles.sumRow, styles.totalRow]}>
          <Text style={styles.totalKey}>Total</Text>
          <Text style={styles.totalVal} testID="wayfair-cart-total">{money(t.total)}</Text>
        </View>
      </View>
      <View style={styles.payRow}>
        <WalletMark wallet={agent.wallet} size={14} />
        <Text style={styles.sumKey}>Citi Mastercard ···· 4680</Text>
      </View>
      {error ? <Text style={styles.errLight} testID="place-order-error">{error}</Text> : null}
      <Pressable testID="place-order-button" style={[styles.payBtn, apple ? styles.payApple : styles.payGoogle]} onPress={onPlace} disabled={placing}>
        {placing ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <View style={styles.payInner}>
            <Ionicons name={apple ? "logo-apple" : "logo-google"} size={18} color={colors.onBrandPrimary} />
            <Text style={styles.payText}>Place order with {agent.walletName}</Text>
          </View>
        )}
      </Pressable>
    </ScrollView>
  );
}

export function DoneStep({
  agentName, cart, order, onRestart,
}: { agentName: string; cart: Cart; order: Order; onRestart: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const rows: [string, string][] = [
    ["Order", order.order_id],
    ...cart.line_items.map((l) => [`${l.quantity}×`, l.product.name] as [string, string]),
    ["Paid with", `${order.wallet} · Citi ···· ${order.card_last4}`],
    ["Authorized", `${order.wallet === "Apple Pay" ? "Face ID" : "Fingerprint"} · approved by Citi`],
    ["Total", money(order.amount)],
    ["Citi offer", order.offer_activated ? `${money(order.statement_credit)} statement credit pending` : "None"],
    ["Delivery", order.eta],
  ];
  return (
    <ScrollView style={styles.light} contentContainerStyle={styles.doneContent} testID="done-step">
      <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
        <Ionicons name="checkmark" size={44} color={colors.onSuccess} />
      </Animated.View>
      <Text style={styles.doneTitle} testID="order-placed-title">Order placed</Text>
      <Text style={styles.doneSub}>Wayfair confirmed your order. {agentName} received the confirmation.</Text>
      {order.offer_activated && (
        <View style={[styles.banner, styles.bannerOn]} testID="done-credit">
          <Ionicons name="pricetag" size={16} color={colors.onBrandTertiary} />
          <Text style={styles.bannerTextOn}>{money(order.statement_credit)} back will post to your Citi statement</Text>
        </View>
      )}
      <View style={styles.summaryCard}>
        {rows.map(([k, v], i) => (
          <View key={`${k}-${i}`} style={[styles.sumRow, styles.doneRow, i === rows.length - 1 && styles.noBorder]}>
            <Text style={styles.sumKey}>{k}</Text>
            <Text style={[styles.sumVal, styles.shrink]}>{v}</Text>
          </View>
        ))}
      </View>
      <Pressable testID="restart-journey-button" style={styles.darkBtn} onPress={onRestart}>
        <Text style={styles.payText}>Shop again</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  light: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  shrink: { flexShrink: 1, textAlign: "right" },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  urlBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.citiCard, borderRadius: 8, height: 32 },
  urlText: { fontSize: 12, color: c.citiMuted },
  cartRef: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.citiBorder },
  refTitle: { fontSize: 13, fontWeight: "600", color: c.onSurfaceInverse },
  refSub: { fontSize: 11, color: c.citiMuted, marginTop: 2 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: c.onSurfaceInverse, marginTop: 12 },
  pageSub: { fontSize: 13, color: c.citiMuted, marginBottom: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: c.onSurfaceInverse, marginTop: 4 },
  inputLight: { height: 44, borderRadius: 6, backgroundColor: c.surfaceTertiary, justifyContent: "center", paddingHorizontal: 12 },
  inputLightText: { fontSize: 15, color: c.onSurface },
  inputDim: { height: 44, borderRadius: 6, backgroundColor: c.citiBorder, justifyContent: "center", paddingHorizontal: 12 },
  inputDimText: { fontSize: 15, color: c.citiMuted, letterSpacing: 2 },
  outlineBtn: { minHeight: 48, borderRadius: 999, borderWidth: 1.5, borderColor: c.onSurfaceInverse, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 16 },
  outlineText: { fontSize: 15, fontWeight: "700", color: c.onSurfaceInverse },
  primaryBtn: { minHeight: 48, borderRadius: 999, backgroundColor: c.citiBlue, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 16 },
  primaryText: { fontSize: 16, fontWeight: "700", color: c.onInfo },
  faceOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end", paddingBottom: 48 },
  facePopup: { width: 150, height: 150, borderRadius: 24, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 6 },
  faceCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  faceCircleDone: { backgroundColor: c.success },
  faceLabel: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  faceHint: { fontSize: 11, color: c.muted },
  panel: { backgroundColor: c.citiCard, borderRadius: 16, padding: 16, gap: 14, marginTop: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { flex: 1, fontSize: 14, color: c.citiMuted },
  progressOn: { color: c.onSurfaceInverse },
  err: { color: c.error, fontSize: 13, marginTop: 8 },
  offerCard: { backgroundColor: c.citiCard, borderWidth: 1, borderColor: c.citiBorder, borderRadius: 16, padding: 16, gap: 8, marginTop: 8 },
  pill: { alignSelf: "flex-start", fontSize: 11, fontWeight: "700", color: c.onInfo, backgroundColor: c.citiBlue, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  offerHead: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  offerTitle: { fontSize: 18, fontWeight: "800", color: c.onSurfaceInverse },
  offerSub: { fontSize: 13, color: c.citiMuted, marginTop: 2 },
  creditBox: { backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 12, marginTop: 4 },
  creditLabel: { fontSize: 12, color: c.citiMuted },
  credit: { fontSize: 28, fontWeight: "800", color: c.success },
  creditSub: { fontSize: 12, color: c.citiMuted },
  section: { fontSize: 11, fontWeight: "700", color: c.citiMuted, letterSpacing: 1, marginTop: 8, textTransform: "uppercase" },
  term: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  termText: { flex: 1, fontSize: 13, color: c.onSurfaceInverse, lineHeight: 18 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 12 },
  cardArt: { width: 44, height: 28, borderRadius: 4, backgroundColor: c.citiBorder, alignItems: "flex-end", justifyContent: "flex-end", padding: 3 },
  cardName: { fontSize: 14, fontWeight: "600", color: c.onSurfaceInverse },
  cardSub: { fontSize: 12, color: c.citiMuted },
  activated: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 12, marginTop: 8 },
  activatedTitle: { fontSize: 15, fontWeight: "700", color: c.success },
  activatedSub: { fontSize: 11, color: c.citiMuted },
  noIcon: { alignSelf: "center", width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: c.citiBorder, alignItems: "center", justifyContent: "center" },
  offerTitleCenter: { fontSize: 20, fontWeight: "800", color: c.onSurfaceInverse, textAlign: "center" },
  offerSubCenter: { fontSize: 13, color: c.citiMuted, textAlign: "center", marginBottom: 8 },
  wfHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  wfTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  wfCart: { fontSize: 15, color: c.muted, marginLeft: "auto" },
  editBtn: { marginLeft: "auto", minHeight: 44, justifyContent: "center" },
  editText: { fontSize: 14, fontWeight: "600", color: c.stepActive },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, marginTop: 8 },
  bannerOn: { backgroundColor: c.brandTertiary },
  bannerText: { flex: 1, fontSize: 13, color: c.muted },
  bannerTextOn: { flex: 1, fontSize: 13, fontWeight: "600", color: c.onBrandTertiary },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  itemImg: { width: 64, height: 64, borderRadius: 8, backgroundColor: c.surfaceSecondary },
  itemName: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  itemSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  summary: { gap: 6, marginTop: 8 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sumKey: { fontSize: 13, color: c.muted },
  sumVal: { fontSize: 13, fontWeight: "600", color: c.onSurface },
  totalRow: { borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 8, marginTop: 4 },
  totalKey: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  totalVal: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  errLight: { color: c.error, fontSize: 13 },
  payBtn: { height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 8 },
  payApple: { backgroundColor: "#000000" },
  payGoogle: { backgroundColor: c.geminiBlue },
  payInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  payText: { fontSize: 16, fontWeight: "700", color: c.onBrandPrimary },
  doneContent: { padding: 24, alignItems: "center", gap: 12 },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.success, alignItems: "center", justifyContent: "center", marginTop: 8 },
  doneTitle: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  doneSub: { fontSize: 14, color: c.muted, textAlign: "center" },
  summaryCard: { alignSelf: "stretch", backgroundColor: c.surfaceSecondary, borderRadius: 16, paddingHorizontal: 16 },
  doneRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  noBorder: { borderBottomWidth: 0 },
  darkBtn: { alignSelf: "stretch", height: 50, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 8 },
}));
