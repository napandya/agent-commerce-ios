import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { SlideInDown, SlideInLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { WayfairLogo } from "@/src/components/Brand";
import type { AgentConfig } from "@/src/agents";

const HISTORY = ["Living room sofa ideas", "Weekend trip to Chicago", "Meal plan for the week", "Gift ideas for mom", "Fix my resume summary"];
const OTHER_APPS = [
  { name: "Zillow", icon: "home-outline" as const },
  { name: "Expedia", icon: "airplane-outline" as const },
  { name: "Spotify", icon: "musical-notes-outline" as const },
  { name: "Canva", icon: "color-palette-outline" as const },
];

export function ChatSidebar({
  agent, open, onClose, onNewChat, onOpenApps, appOn,
}: { agent: AgentConfig; open: boolean; onClose: () => void; onNewChat: () => void; onOpenApps: () => void; appOn: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerRoot}>
        <Animated.View entering={SlideInLeft.duration(240)} style={[styles.drawer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]} testID="chat-sidebar">
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <Text style={styles.searchText}>Search</Text>
          </View>
          <Pressable testID="sidebar-new-chat" style={styles.navRow} onPress={() => { onNewChat(); onClose(); }}>
            <Ionicons name="create-outline" size={20} color={colors.onSurface} />
            <Text style={styles.navText}>New chat</Text>
          </Pressable>
          <View style={styles.navRow}>
            <Ionicons name="images-outline" size={20} color={colors.onSurface} />
            <Text style={styles.navText}>Library</Text>
          </View>
          <Pressable testID="sidebar-apps" style={styles.navRow} onPress={() => { onClose(); onOpenApps(); }}>
            <Ionicons name="apps-outline" size={20} color={colors.onSurface} />
            <Text style={styles.navText}>Apps</Text>
          </Pressable>
          <Text style={styles.section}>Connected</Text>
          <View style={styles.navRow}>
            <WayfairLogo size={22} />
            <Text style={[styles.navText, styles.flex]}>Wayfair</Text>
            <Text style={[styles.connected, !appOn && styles.off]}>{appOn ? "On" : "Off"}</Text>
          </View>
          <Text style={styles.section}>Chats</Text>
          <ScrollView style={styles.flex}>
            <View style={[styles.navRow, styles.active]}>
              <Text style={styles.navText} numberOfLines={1}>New sofa for the living room</Text>
            </View>
            {HISTORY.map((h) => (
              <View key={h} style={styles.navRow}>
                <Text style={styles.histText} numberOfLines={1}>{h}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.profile}>
            <View style={styles.avatar}><Text style={styles.avatarText}>PV</Text></View>
            <View style={styles.flex}>
              <Text style={styles.navText}>Pat Vaughan</Text>
              <Text style={styles.histText}>{agent.id === "gemini" ? "Google AI Pro" : "Plus"}</Text>
            </View>
          </View>
        </Animated.View>
        <Pressable style={styles.flex} onPress={onClose} testID="chat-sidebar-backdrop" />
      </View>
    </Modal>
  );
}

export function AppPicker({
  open, onClose, appOn, setAppOn,
}: { open: boolean; onClose: () => void; appOn: boolean; setAppOn: (v: boolean) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.flex} onPress={onClose} testID="app-picker-backdrop" />
        <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="app-picker">
          <View style={styles.handle} />
          <View style={styles.tiles}>
            {([["camera-outline", "Camera"], ["image-outline", "Photos"], ["document-outline", "Files"]] as const).map(([icon, label]) => (
              <View key={label} style={styles.tile}>
                <Ionicons name={icon} size={22} color={colors.onSurface} />
                <Text style={styles.tileText}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.section}>Apps</Text>
          <Pressable testID="app-picker-wayfair" style={styles.appRow} onPress={() => { setAppOn(!appOn); onClose(); }}>
            <WayfairLogo size={32} />
            <View style={styles.flex}>
              <Text style={styles.navText}>Wayfair</Text>
              <Text style={styles.histText}>Shop furniture · Citi offers supported</Text>
            </View>
            <Ionicons name={appOn ? "checkmark-circle" : "add-circle-outline"} size={24} color={appOn ? colors.stepActive : colors.muted} />
          </Pressable>
          {OTHER_APPS.map((a) => (
            <View key={a.name} style={[styles.appRow, styles.dim]}>
              <View style={styles.appIcon}><Ionicons name={a.icon} size={18} color={colors.onSurface} /></View>
              <View style={styles.flex}>
                <Text style={styles.navText}>{a.name}</Text>
                <Text style={styles.histText}>Not part of this demo</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  drawerRoot: { flex: 1, flexDirection: "row", backgroundColor: c.overlay },
  drawer: { width: "80%", backgroundColor: c.surface, paddingHorizontal: 12, gap: 2 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, borderRadius: 12, backgroundColor: c.surfaceSecondary, paddingHorizontal: 12, marginBottom: 8 },
  searchText: { fontSize: 15, color: c.muted },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 8, borderRadius: 10 },
  active: { backgroundColor: c.surfaceSecondary },
  navText: { fontSize: 15, fontWeight: "500", color: c.onSurface },
  histText: { fontSize: 14, color: c.onSurfaceTertiary },
  connected: { fontSize: 12, fontWeight: "700", color: c.success },
  off: { color: c.muted },
  section: { fontSize: 12, fontWeight: "600", color: c.muted, marginTop: 12, marginBottom: 4, paddingHorizontal: 8 },
  profile: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.stepDone, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onSuccess, fontWeight: "700", fontSize: 13 },
  sheetRoot: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, gap: 4 },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginVertical: 8 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, height: 76, borderRadius: 16, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 6 },
  tileText: { fontSize: 13, color: c.onSurface },
  appRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  appIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  dim: { opacity: 0.45 },
}));
