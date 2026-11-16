import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

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

export function WayfairLogo({ size = 34 }: { size?: number }) {
  return (
    <View style={[sx.wayfair, { width: size, height: size, borderRadius: size * 0.22 }]} testID="wayfair-logo">
      <Ionicons name="home" size={size * 0.6} color="#FFFFFF" />
    </View>
  );
}

const sx = StyleSheet.create({
  wallet: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  walletGoogle: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DADCE0" },
  walletText: { fontWeight: "600" },
  wayfair: { backgroundColor: "#7B189F", alignItems: "center", justifyContent: "center" },
});
