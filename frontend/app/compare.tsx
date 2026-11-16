import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { COMPARISON } from "@/src/flow";

export default function Compare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="compare-screen">
      <View style={styles.nav}>
        <Pressable testID="compare-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.large}>Citi offers flow</Text>
        <Text style={styles.sub}>How the furniture offers check works when the shopper starts in ChatGPT (ACP) or Gemini (UCP). Mastercard Offers sits behind Citi in both.</Text>
        <View style={styles.legend}>
          <Text style={[styles.pill, styles.pillAcp]}>ChatGPT · ACP</Text>
          <Text style={[styles.pill, styles.pillUcp]}>Gemini · UCP</Text>
          <Text style={[styles.pill, styles.pillMc]}>Mastercard Offers</Text>
        </View>
        {COMPARISON.map((row, i) => (
          <View key={row.stage} style={styles.card} testID={`compare-row-${i}`}>
            <Text style={styles.stage}>{i + 1}. {row.stage}</Text>
            <View style={styles.cell}>
              <Text style={[styles.cellTag, styles.tagAcp]}>ACP</Text>
              <Text style={styles.cellText}>{row.acp}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellTag, styles.tagUcp]}>UCP</Text>
              <Text style={styles.cellText}>{row.ucp}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellTag, styles.tagMc]}>Mastercard Offers</Text>
              <Text style={styles.cellText}>{row.offers}</Text>
            </View>
          </View>
        ))}
        <View style={styles.ctaRow}>
          <Pressable testID="compare-try-chatgpt" style={styles.cta} onPress={() => router.push("/shop?agent=chatgpt")}>
            <Text style={styles.ctaText}>Try ChatGPT</Text>
          </Pressable>
          <Pressable testID="compare-try-gemini" style={[styles.cta, styles.ctaGemini]} onPress={() => router.push("/shop?agent=gemini")}>
            <Text style={styles.ctaText}>Try Gemini</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  nav: { paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, gap: 12 },
  large: { fontSize: 30, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, lineHeight: 20 },
  legend: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  pillAcp: { backgroundColor: c.brandTertiary, color: c.onBrandTertiary },
  pillUcp: { backgroundColor: c.geminiSurface, color: c.geminiBlue },
  pillMc: { backgroundColor: c.surfaceTertiary, color: c.onSurfaceTertiary },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 12 },
  stage: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  cell: { gap: 4 },
  cellTag: { alignSelf: "flex-start", fontSize: 10, fontWeight: "800", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  tagAcp: { backgroundColor: c.brandSecondary, color: c.onBrandSecondary },
  tagUcp: { backgroundColor: c.geminiBlue, color: c.onGeminiBlue },
  tagMc: { backgroundColor: c.surfaceInverse, color: c.onSurfaceInverse },
  cellText: { fontSize: 13, lineHeight: 19, color: c.onSurfaceTertiary },
  ctaRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  cta: { flex: 1, height: 48, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  ctaGemini: { backgroundColor: c.geminiBlue },
  ctaText: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "700" },
}));
