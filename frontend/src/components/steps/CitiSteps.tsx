import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme } from "@/src/theme";
import { money, type CheckoutSession } from "@/src/api";
import { CitiLogo } from "@/src/components/Brand";

function FdicBanner() {
  const styles = useStyles();
  return (
    <View style={styles.fdic}>
      <Text style={styles.fdicBadge}>FDIC</Text>
      <Text style={styles.fdicText}>FDIC-Insured – Backed by the full faith and credit of the U.S. Government · Citibank, N.A.</Text>
    </View>
  );
}

export function FaceIdStep({ onVerified }: { onVerified: () => void }) {
  const styles = useStyles();
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

  return (
    <View style={styles.root} testID="faceid-step">
      <ScrollView contentContainerStyle={styles.content}>
        <FdicBanner />
        <View style={styles.logo}><CitiLogo size={30} color={colors.onSurfaceInverse} /></View>
        <Text style={styles.fieldLabel}>User ID</Text>
        <View style={styles.inputLight}><Text style={styles.inputLightText}>Pjvaughan</Text></View>
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.inputDim}><Text style={styles.inputDimText}>••••••••••</Text></View>
        <View style={styles.faceRow}>
          <Ionicons name="scan-outline" size={16} color={colors.citiMuted} />
          <Text style={styles.faceText}>Face ID®</Text>
        </View>
        <Pressable testID="citi-sign-on-button" style={styles.signOn} onPress={() => setPrompt(true)}>
          <Text style={styles.signOnText}>Sign On</Text>
        </Pressable>
        <View style={styles.links}>
          <Text style={styles.link}>Forgot User ID</Text>
          <Text style={styles.link}>Forgot Password</Text>
        </View>
      </ScrollView>
      {prompt && (
        <Animated.View entering={FadeIn} style={styles.faceOverlay}>
          <Animated.View entering={ZoomIn.duration(260)}>
            <Pressable testID="faceid-popup" onPress={scan} style={styles.facePopup}>
              <View style={[styles.faceCircle, phase === "done" && styles.faceCircleDone]}>
                {phase === "scanning" ? (
                  <ActivityIndicator color={colors.stepActive} />
                ) : (
                  <Ionicons
                    name={phase === "done" ? "checkmark" : "scan-outline"}
                    size={34}
                    color={phase === "done" ? colors.onSuccess : colors.onSurface}
                  />
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

export function AuthorizeStep({
  agentName, protocol, session, onDecision, busy, error,
}: {
  agentName: string; protocol: string; session: CheckoutSession; onDecision: (d: "approve" | "decline") => void;
  busy: "approve" | "decline" | null; error?: string | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const rows: [string, string][] = [
    ["Merchant", session.merchant],
    ["Initiated by", agentName],
    ["Protocol", protocol],
    ["You requested", session.summary],
    ["Card", `Mastercard ···· ${session.card.last4}`],
  ];
  return (
    <View style={styles.root} testID="authorize-step">
      <ScrollView contentContainerStyle={styles.content}>
        <FdicBanner />
        <View style={styles.logo}><CitiLogo size={30} color={colors.onSurfaceInverse} /></View>
        <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark-outline" size={26} color={colors.citiBlue} />
          </View>
          <Text style={styles.authTitle}>Authorize Purchase</Text>
          <Text style={styles.authSub}>{agentName} is requesting permission to complete a purchase on your behalf</Text>
          <View style={styles.details}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.detailRow}>
                <Text style={styles.dKey}>{k}</Text>
                <Text style={styles.dVal}>{v}</Text>
              </View>
            ))}
            <View style={[styles.detailRow, styles.noBorder]}>
              <Text style={styles.dKey}>Amount</Text>
              <Text style={styles.amount} testID="authorize-amount">{money(session.totals.total)}</Text>
            </View>
          </View>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <View style={styles.btnRow}>
            <Pressable testID="authorize-decline-button" style={[styles.btn, styles.decline]} onPress={() => onDecision("decline")} disabled={!!busy}>
              {busy === "decline" ? <ActivityIndicator color={colors.error} /> : <Text style={styles.declineText}>Decline</Text>}
            </Pressable>
            <Pressable testID="authorize-approve-button" style={[styles.btn, styles.approve]} onPress={() => onDecision("approve")} disabled={!!busy}>
              {busy === "approve" ? <ActivityIndicator color={colors.onInfo} /> : <Text style={styles.approveText}>Approve</Text>}
            </Pressable>
          </View>
          <Text style={styles.fine}>Approving issues a single-use Mastercard Agent Pay token limited to this merchant and amount.</Text>
        </Animated.View>
        <View style={styles.footer}>
          {["Find ATM", "Register", "Support"].map((f) => <Text key={f} style={styles.footText}>{f}</Text>)}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  content: { padding: 16, gap: 8 },
  fdic: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.citiCard, borderRadius: 6, padding: 8 },
  fdicBadge: { fontSize: 9, fontWeight: "800", color: c.onSurfaceInverse, borderWidth: 1, borderColor: c.onSurfaceInverse, paddingHorizontal: 4, borderRadius: 3 },
  fdicText: { flex: 1, fontSize: 10, color: c.citiMuted },
  logo: { alignItems: "center", marginVertical: 12 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: c.onSurfaceInverse, marginTop: 4 },
  inputLight: { height: 44, borderRadius: 6, backgroundColor: c.surfaceTertiary, justifyContent: "center", paddingHorizontal: 12 },
  inputLightText: { fontSize: 15, color: c.onSurface },
  inputDim: { height: 44, borderRadius: 6, backgroundColor: c.citiBorder, justifyContent: "center", paddingHorizontal: 12 },
  inputDimText: { fontSize: 15, color: c.citiMuted, letterSpacing: 2 },
  faceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  faceText: { fontSize: 13, color: c.citiMuted },
  signOn: { height: 48, borderRadius: 6, borderWidth: 1.5, borderColor: c.onSurfaceInverse, alignItems: "center", justifyContent: "center", marginTop: 12 },
  signOnText: { fontSize: 16, fontWeight: "700", color: c.onSurfaceInverse },
  links: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 12 },
  link: { fontSize: 13, color: c.citiBlue, textDecorationLine: "underline" },
  faceOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end", paddingBottom: 48 },
  facePopup: { width: 150, height: 150, borderRadius: 24, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 6 },
  faceCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  faceCircleDone: { backgroundColor: c.success },
  faceLabel: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  faceHint: { fontSize: 11, color: c.muted },
  card: { backgroundColor: c.citiCard, borderWidth: 1, borderColor: c.citiBorder, borderRadius: 16, padding: 16, alignItems: "center" },
  shield: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: c.citiBlue, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  authTitle: { fontSize: 20, fontWeight: "700", color: c.onSurfaceInverse },
  authSub: { fontSize: 13, color: c.citiMuted, textAlign: "center", marginTop: 4, lineHeight: 18 },
  details: { alignSelf: "stretch", marginTop: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.citiBorder },
  noBorder: { borderBottomWidth: 0 },
  dKey: { fontSize: 13, color: c.citiMuted },
  dVal: { fontSize: 13, fontWeight: "600", color: c.onSurfaceInverse, flexShrink: 1, textAlign: "right", marginLeft: 12 },
  amount: { fontSize: 18, fontWeight: "800", color: c.success },
  err: { color: c.error, fontSize: 13, marginTop: 8 },
  btnRow: { flexDirection: "row", gap: 12, alignSelf: "stretch", marginTop: 16 },
  btn: { flex: 1, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  decline: { backgroundColor: c.declineFill },
  declineText: { color: c.error, fontSize: 16, fontWeight: "700" },
  approve: { backgroundColor: c.citiBlue },
  approveText: { color: c.onInfo, fontSize: 16, fontWeight: "700" },
  fine: { fontSize: 11, color: c.citiMuted, textAlign: "center", marginTop: 12 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 16 },
  footText: { fontSize: 12, color: c.citiMuted },
}));
