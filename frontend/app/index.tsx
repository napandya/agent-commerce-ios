import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { makeStyles, useTheme } from "@/src/theme";
import { CitiLogo, MastercardLogo } from "@/src/components/Brand";
import { PROTOCOL_OVERVIEW } from "@/src/protocols";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const links = [
    { id: "agents", icon: "options-outline" as const, title: "Agent Controls", sub: "Connected AI agents, spending limits, revoke access", to: "/agents" as const },
    { id: "activity", icon: "receipt-outline" as const, title: "Agent Activity", sub: "Purchases made by agents on your card", to: "/activity" as const },
  ];

  return (
    <View style={styles.root} testID="home-screen">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroTop}>
            <CitiLogo size={28} color={colors.onSurfaceInverse} />
            <Text style={styles.heroKicker}>Agentic Commerce</Text>
          </View>
          <Text style={styles.greeting}>Good morning, Pat</Text>

          <Animated.View entering={FadeInDown.duration(400)} style={styles.card} testID="home-card">
            <View style={styles.cardTop}>
              <Text style={styles.cardName}>Citi Custom Cash® Card</Text>
              <MastercardLogo size={20} />
            </View>
            <Text style={styles.cardNum}>···· 4680</Text>
            <View style={styles.cardBottom}>
              <View>
                <Text style={styles.cardLabel}>ThankYou® Points</Text>
                <Text style={styles.cardValue} testID="home-points-balance">150,250</Text>
              </View>
              <View style={styles.agentPill}>
                <Ionicons name="sparkles" size={12} color={colors.onInfo} />
                <Text style={styles.agentPillText}>Agent Pay enabled</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.section}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.journeys}>
            <Pressable testID="start-journey-button" style={styles.start} onPress={() => router.push("/journey?agent=chatgpt")}>
              <View style={styles.startIcon}>
                <Ionicons name="chatbubbles" size={22} color={colors.onBrandPrimary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.startTitle}>ChatGPT journey · ACP</Text>
                <Text style={styles.startSub}>ChatGPT → Target → Apple Pay → Citi</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
            </Pressable>
            <Pressable testID="start-gemini-journey-button" style={[styles.start, styles.startGemini]} onPress={() => router.push("/journey?agent=gemini")}>
              <View style={[styles.startIcon, styles.startIconGemini]}>
                <Ionicons name="sparkles" size={22} color={colors.onGeminiBlue} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.startTitle}>Gemini journey · UCP + AP2</Text>
                <Text style={styles.startSub}>Gemini → Target (UCP) → Google Pay → Citi</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
            </Pressable>
            <Pressable testID="home-compare-link" style={styles.compare} onPress={() => router.push("/compare")}>
              <Ionicons name="git-compare-outline" size={18} color={colors.stepActive} />
              <Text style={styles.compareText}>Compare ACP vs UCP + AP2 side by side</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.stepActive} />
            </Pressable>
          </Animated.View>

          {links.map((l, i) => (
            <Animated.View key={l.id} entering={FadeInDown.delay(160 + i * 60).duration(400)}>
              <Pressable testID={`home-${l.id}-link`} style={styles.link} onPress={() => router.push(l.to)}>
                <View style={styles.linkIcon}><Ionicons name={l.icon} size={20} color={colors.onSurface} /></View>
                <View style={styles.flex}>
                  <Text style={styles.linkTitle}>{l.title}</Text>
                  <Text style={styles.linkSub}>{l.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </Animated.View>
          ))}

          <Text style={styles.h2}>Protocols in this demo</Text>
          {PROTOCOL_OVERVIEW.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(280 + i * 60).duration(400)} style={styles.proto} testID={`protocol-card-${p.id}`}>
              <View style={styles.protoHead}>
                <Text style={styles.protoTag}>{p.name}</Text>
                <Text style={styles.protoFull}>{p.full}</Text>
              </View>
              <Text style={styles.protoBy}>{p.by}</Text>
              <Text style={styles.protoBody}>{p.body}</Text>
            </Animated.View>
          ))}
          <Text style={styles.disclaimer}>Prototype for demonstration only. All payments, tokens and accounts are simulated.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  flex: { flex: 1 },
  hero: { backgroundColor: c.surfaceInverse, paddingHorizontal: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroKicker: { fontSize: 12, fontWeight: "700", color: c.citiMuted, letterSpacing: 1, textTransform: "uppercase" },
  greeting: { fontSize: 24, fontWeight: "700", color: c.onSurfaceInverse, marginTop: 24, marginBottom: 16 },
  card: { backgroundColor: c.citiCard, borderWidth: 1, borderColor: c.citiBorder, borderRadius: 20, padding: 16, gap: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 15, fontWeight: "600", color: c.onSurfaceInverse },
  cardNum: { fontSize: 22, fontWeight: "700", color: c.onSurfaceInverse, letterSpacing: 2 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 },
  cardLabel: { fontSize: 12, color: c.citiMuted },
  cardValue: { fontSize: 18, fontWeight: "700", color: c.onSurfaceInverse },
  agentPill: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: c.citiBlue, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  agentPillText: { fontSize: 11, fontWeight: "700", color: c.onInfo },
  section: { padding: 16, gap: 12 },
  journeys: { gap: 8 },
  startGemini: { backgroundColor: c.citiCard },
  startIconGemini: { backgroundColor: c.geminiBlue },
  compare: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 4 },
  compareText: { flex: 1, fontSize: 14, fontWeight: "600", color: c.stepActive },
  start: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brandPrimary, borderRadius: 20, padding: 16, minHeight: 72 },
  startIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.citiBlue, alignItems: "center", justifyContent: "center" },
  startTitle: { fontSize: 16, fontWeight: "700", color: c.onBrandPrimary },
  startSub: { fontSize: 12, color: c.citiMuted, marginTop: 2 },
  link: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 16, padding: 16 },
  linkIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  linkSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  h2: { fontSize: 13, fontWeight: "700", color: c.muted, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 12 },
  proto: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 4 },
  protoHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  protoTag: { fontSize: 12, fontWeight: "800", color: c.onInfo, backgroundColor: c.stepActive, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  protoFull: { fontSize: 15, fontWeight: "700", color: c.onSurface, flexShrink: 1 },
  protoBy: { fontSize: 12, color: c.muted },
  protoBody: { fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19 },
  disclaimer: { fontSize: 11, color: c.muted, textAlign: "center", marginTop: 8 },
}));
