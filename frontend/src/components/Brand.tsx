import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles } from "@/src/theme";

// Brand marks keep identical colors in every theme.
export function MastercardLogo({ size = 22 }: { size?: number }) {
  return (
    <View style={{ width: size * 1.6, height: size, flexDirection: "row" }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#EB001B" }} />
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, backgroundColor: "#F79E1B",
          opacity: 0.9, marginLeft: -size * 0.4,
        }}
      />
    </View>
  );
}

export function CitiLogo({ size = 26, color = "#FFFFFF" }: { size?: number; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.citiWrap} testID="citi-logo">
      <View style={[styles.arc, { width: size * 1.4, height: size * 0.5, borderTopLeftRadius: size, borderTopRightRadius: size }]} />
      <Text style={[styles.citi, { fontSize: size, color }]}>citi</Text>
    </View>
  );
}

export function InstacartMark({ label = "Instacart", dark = false }: { label?: string; dark?: boolean }) {
  return (
    <View style={sx.row}>
      <View style={sx.carrot} />
      <Text style={[sx.ic, dark && { color: "#FFFFFF" }]}>{label}</Text>
    </View>
  );
}

// Wallet marks use fixed brand colors in every theme.
export function WalletMark({ wallet, size = 16 }: { wallet: "apple" | "google"; size?: number }) {
  return wallet === "apple" ? (
    <View style={[sx.wallet, { backgroundColor: "#000000" }]} testID="apple-pay-mark">
      <Ionicons name="logo-apple" size={size} color="#FFFFFF" />
      <Text style={[sx.walletText, { color: "#FFFFFF", fontSize: size }]}>Pay</Text>
    </View>
  ) : (
    <View style={[sx.wallet, sx.walletGoogle]} testID="google-pay-mark">
      <Ionicons name="logo-google" size={size - 2} color="#4285F4" />
      <Text style={[sx.walletText, { color: "#3C4043", fontSize: size }]}>Pay</Text>
    </View>
  );
}

export function TargetLogo({ size = 34 }: { size?: number }) {
  return (
    <View style={[sx.target, { width: size, height: size, borderRadius: 6 }]}>
      <View style={[sx.ring, { width: size * 0.7, height: size * 0.7, borderRadius: size }]}>
        <View style={{ width: size * 0.26, height: size * 0.26, borderRadius: size, backgroundColor: "#CC0000" }} />
      </View>
    </View>
  );
}

const sx = StyleSheet.create({
  wallet: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  walletGoogle: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DADCE0" },
  walletText: { fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  carrot: { width: 8, height: 12, borderRadius: 4, backgroundColor: "#FF7009" },
  ic: { fontSize: 15, fontWeight: "700", color: "#003A2B" },
  target: { backgroundColor: "#CC0000", alignItems: "center", justifyContent: "center" },
  ring: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
});

const useStyles = makeStyles((c) => ({
  citiWrap: { alignItems: "center" },
  arc: { borderTopWidth: 2.5, borderLeftWidth: 0, borderRightWidth: 0, borderColor: c.citiRed, marginBottom: -6, marginLeft: 6 },
  citi: { fontWeight: "700", letterSpacing: -0.5 },
}));
