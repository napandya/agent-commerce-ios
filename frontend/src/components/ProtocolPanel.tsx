import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import type { ProtocolInfo } from "@/src/flow";

export function ProtocolPanel({ info }: { info: ProtocolInfo }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable testID="protocol-panel-toggle" onPress={() => setOpen(true)} style={{ paddingBottom: insets.bottom }}>
        <BlurView intensity={60} tint="light" style={styles.bar}>
          <View style={styles.barIcon}>
            <Ionicons name="git-network-outline" size={18} color={colors.onInfo} />
          </View>
          <View style={styles.barText}>
            <View style={styles.tagRow}>
              {info.tags.map((t) => (
                <Text key={t} style={styles.tag}>{t}</Text>
              ))}
            </View>
            <Text style={styles.barTitle} numberOfLines={1} testID="protocol-panel-title">{info.title}</Text>
          </View>
          <Ionicons name="chevron-up" size={20} color={colors.muted} />
        </BlurView>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.flex} onPress={() => setOpen(false)} testID="protocol-panel-backdrop" />
          <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="protocol-panel-sheet">
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={styles.kicker}>BEHIND THE SCENES</Text>
                <Text style={styles.sheetTitle}>{info.title}</Text>
              </View>
              <Pressable testID="protocol-panel-close" onPress={() => setOpen(false)} style={styles.close} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.tagRow}>
                {info.tags.map((t) => (
                  <Text key={t} style={styles.tagLg}>{t}</Text>
                ))}
              </View>
              <Text style={styles.summary}>{info.summary}</Text>

              <Text style={styles.section}>Message flow</Text>
              <View style={styles.flow}>
                {info.flow.map((f, i) => (
                  <View key={`${i}-${f}`} style={styles.flowItem}>
                    <Text style={styles.flowNode}>{f}</Text>
                    {i < info.flow.length - 1 && <Ionicons name="arrow-forward" size={14} color={colors.muted} />}
                  </View>
                ))}
              </View>

              <Text style={styles.section}>Key points</Text>
              {info.points.map((p) => (
                <View key={p} style={styles.point}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.stepDone} />
                  <Text style={styles.pointText}>{p}</Text>
                </View>
              ))}

              <Text style={styles.section}>Mock message</Text>
              <View style={styles.code} testID="protocol-payload">
                <Text style={styles.endpoint}>{info.endpoint}</Text>
                <Text style={styles.codeText}>{JSON.stringify(info.payload, null, 2)}</Text>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  bar: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: c.border, overflow: "hidden",
  },
  barIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.stepActive, alignItems: "center", justifyContent: "center" },
  barText: { flex: 1 },
  barTitle: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    fontSize: 10, fontWeight: "700", color: c.stepActive, backgroundColor: c.surfaceSecondary,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden",
  },
  tagLg: {
    fontSize: 12, fontWeight: "700", color: c.onInfo, backgroundColor: c.stepActive,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden",
  },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { maxHeight: "82%", backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginTop: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  kicker: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 1 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  summary: { fontSize: 14, lineHeight: 20, color: c.onSurfaceTertiary, marginTop: 4 },
  section: { fontSize: 12, fontWeight: "700", color: c.muted, marginTop: 12, letterSpacing: 0.5 },
  flow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  flowItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  flowNode: {
    fontSize: 12, fontWeight: "600", color: c.onSurface, backgroundColor: c.surfaceSecondary,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: "hidden",
  },
  point: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  pointText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },
  code: { backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 12 },
  endpoint: { fontSize: 12, fontWeight: "700", color: c.success, marginBottom: 6, fontFamily: "Courier" },
  codeText: { fontSize: 11, lineHeight: 16, color: c.onSurfaceInverse, fontFamily: "Courier" },
}));
