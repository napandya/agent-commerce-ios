import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme } from "@/src/theme";
import { money, type Cart } from "@/src/api";
import { MastercardLogo, WalletMark } from "@/src/components/Brand";
import { useSkipDelay } from "@/src/presenter";
import type { AgentConfig } from "@/src/agents";

type Phase = "sheet" | "scanning" | "citi" | "approved" | "declined";

// Simulated wallet pay sheet + biometric check, followed by Citi's biometric approval.
export function PayAuthSheet({
  agent, cart, onApproved, onCancel, onDeclined, decline, auto, skip = 0,
}: {
  agent: AgentConfig; cart: Cart; onApproved: () => void; onCancel: () => void;
  onDeclined?: () => void; decline?: { reason: string; detail: string } | null; auto?: boolean; skip?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const delay = useSkipDelay(skip);
  const apple = agent.wallet === "apple";
  const [phase, setPhase] = useState<Phase>("sheet");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const confirm = () => {
    if (phase !== "sheet") return;
    setPhase("scanning");
    later(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhase("citi");
      later(() => {
        if (decline) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setPhase("declined");
          onDeclined?.();
          return;
        }
        setPhase("approved");
        later(onApproved, 900);
      }, 2200);
    }, 1100);
  };

  useEffect(() => {
    const ms = delay(4000);
    if (!auto || phase !== "sheet") return;
    const t = setTimeout(confirm, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, phase, skip]);

  const bio = apple ? "Face ID" : "fingerprint";
  const citiStage = phase === "citi" || phase === "approved" || phase === "declined";
  const declined = phase === "declined";

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <View style={styles.flex}>
        <Pressable style={styles.flex} onPress={phase === "sheet" ? onCancel : undefined} testID="pay-auth-backdrop" />
        {citiStage ? (
          <Animated.View entering={SlideInDown.duration(260)} style={[styles.citi, { paddingBottom: insets.bottom + 24 }]} testID="citi-biometric-approval">
            <View style={styles.citiHead}>
              <Ionicons name="shield-checkmark" size={18} color={colors.onSurfaceInverse} />
              <Text style={styles.citiBrand}>Citi</Text>
              <Text style={styles.citiKicker}>Payment approval</Text>
            </View>
            <View style={[styles.citiCircle, phase === "approved" && styles.citiCircleDone, declined && styles.citiCircleDeclined]}>
              {declined ? (
                <Ionicons name="close" size={40} color={colors.onError} />
              ) : phase === "approved" ? (
                <Ionicons name="checkmark" size={40} color={colors.onSuccess} />
              ) : (
                <ActivityIndicator size="large" color={colors.citiBlue} />
              )}
            </View>
            <Text style={styles.citiTitle} testID="citi-approval-title">
              {declined ? "Citi declined this payment" : phase === "approved" ? "Approved by Citi" : "Citi is approving your payment"}
            </Text>
            <Text style={styles.citiSub}>Wayfair · {money(cart.totals.total)} · Citi Mastercard ···· 4680</Text>
            <View style={styles.citiChecks}>
              {(
                [
                  [`${apple ? "Face ID" : "Fingerprint"} verified on this device`, "ok"],
                  [declined ? "This phone isn't registered with your Citi profile" : "Biometric result matched to your Citi profile", declined ? "fail" : phase === "approved" ? "ok" : "wait"],
                  [declined ? "Payment not authorized" : "Payment authorized", declined ? "fail" : phase === "approved" ? "ok" : "wait"],
                ] as const
              ).map(([label, state]) => (
                <View key={label} style={styles.checkRow}>
                  <Ionicons
                    name={state === "ok" ? "checkmark-circle" : state === "fail" ? "close-circle" : "ellipse-outline"}
                    size={18}
                    color={state === "ok" ? colors.success : state === "fail" ? colors.error : colors.citiBorder}
                  />
                  <Text style={[styles.checkText, state !== "wait" && styles.checkTextOn]}>{label}</Text>
                </View>
              ))}
            </View>
            {declined && decline && (
              <>
                <View style={styles.why} testID="citi-decline-reason">
                  <Text style={styles.whyTitle}>Why was it declined?</Text>
                  <Text style={styles.whyText}>{decline.detail}</Text>
                </View>
                <Pressable testID="citi-decline-back" style={styles.backBtn} onPress={onCancel}>
                  <Text style={styles.backText}>Back to Wayfair cart</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        ) : (
          <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="wallet-pay-sheet">
            <View style={styles.sheetHead}>
              <WalletMark wallet={agent.wallet} size={16} />
              <View style={styles.flex} />
              <Pressable testID="pay-auth-cancel" onPress={onCancel} disabled={phase !== "sheet"} hitSlop={8} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <View style={styles.cardArt}><MastercardLogo size={10} /></View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Citi Custom Cash® Card</Text>
                <Text style={styles.rowSub}>Mastercard ···· 4680</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowKey}>Ship to</Text>
              <Text style={[styles.rowSub, styles.flex]} numberOfLines={1}>10848 S Bell Ave, Chicago</Text>
            </View>
            <View style={[styles.row, styles.noBorder]}>
              <Text style={styles.rowKey}>Pay Wayfair</Text>
              <Text style={styles.total} testID="pay-sheet-total">{money(cart.totals.total)}</Text>
            </View>
            <Pressable testID="pay-auth-confirm" onPress={confirm} style={styles.bio}>
              <Animated.View entering={FadeIn} style={[styles.bioCircle, phase === "scanning" && styles.bioCircleOn]}>
                {phase === "scanning" ? (
                  <ActivityIndicator color={colors.stepActive} />
                ) : (
                  <Ionicons name={apple ? "scan-outline" : "finger-print"} size={32} color={colors.onSurface} />
                )}
              </Animated.View>
              <Text style={styles.bioText}>{phase === "scanning" ? `Checking ${bio}…` : `Confirm with ${bio}`}</Text>
              {phase === "sheet" && <Text style={styles.bioHint}>Tap to authorize</Text>}
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16 },
  sheetHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  cancel: { minHeight: 44, justifyContent: "center" },
  cancelText: { fontSize: 15, fontWeight: "600", color: c.stepActive },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  noBorder: { borderBottomWidth: 0 },
  cardArt: { width: 44, height: 28, borderRadius: 4, backgroundColor: c.citiCard, alignItems: "flex-end", justifyContent: "flex-end", padding: 3 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  rowKey: { width: 96, fontSize: 13, color: c.muted },
  rowSub: { fontSize: 13, color: c.onSurfaceTertiary },
  total: { flex: 1, textAlign: "right", fontSize: 20, fontWeight: "800", color: c.onSurface },
  bio: { alignItems: "center", gap: 6, paddingVertical: 16 },
  bioCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  bioCircleOn: { borderColor: c.stepActive },
  bioText: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  bioHint: { fontSize: 12, color: c.muted },
  citi: { backgroundColor: c.surfaceInverse, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, alignItems: "center", gap: 10 },
  citiHead: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "stretch" },
  citiBrand: { fontSize: 18, fontWeight: "800", color: c.onSurfaceInverse },
  citiKicker: { fontSize: 12, color: c.citiMuted, marginLeft: "auto" },
  citiCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.citiCard, alignItems: "center", justifyContent: "center", marginTop: 8 },
  citiCircleDone: { backgroundColor: c.success },
  citiCircleDeclined: { backgroundColor: c.error },
  why: { alignSelf: "stretch", borderWidth: 1, borderColor: c.citiBorder, borderRadius: 14, padding: 14, gap: 4 },
  whyTitle: { fontSize: 13, fontWeight: "700", color: c.onSurfaceInverse },
  whyText: { fontSize: 13, lineHeight: 19, color: c.citiMuted },
  backBtn: { alignSelf: "stretch", minHeight: 48, borderRadius: 999, borderWidth: 1.5, borderColor: c.onSurfaceInverse, alignItems: "center", justifyContent: "center", marginTop: 4 },
  backText: { fontSize: 15, fontWeight: "700", color: c.onSurfaceInverse },
  citiTitle: { fontSize: 20, fontWeight: "800", color: c.onSurfaceInverse, textAlign: "center" },
  citiSub: { fontSize: 13, color: c.citiMuted, textAlign: "center" },
  citiChecks: { alignSelf: "stretch", backgroundColor: c.citiCard, borderRadius: 14, padding: 14, gap: 10, marginTop: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: c.citiMuted },
  checkTextOn: { color: c.onSurfaceInverse },
}));
