import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";
import { money, streamChat, type Product } from "@/src/api";
import { InstacartMark, TargetLogo } from "@/src/components/Brand";

export type ChatMsg = { id: string; role: "user" | "assistant"; text: string; productId?: string; error?: boolean };

const TAG = /\[\[product:([a-z0-9-]+)\]\]/i;
const SUGGESTIONS = [
  "Find me men's leather sandals in size 12 at Target",
  "I need sandals for a beach trip, size 12",
  "Show me something in black instead",
];

function clean(text: string) {
  const i = text.indexOf("[[");
  return (i >= 0 ? text.slice(0, i) : text).trim();
}

type Props = {
  sessionId: string;
  messages: ChatMsg[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  products: Record<string, Product>;
  onCheckout: (p: Product) => void;
  checkingOut: boolean;
};

export function ChatStep({ sessionId, messages, setMessages, products, onCheckout, checkingOut }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    const aid = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: msg }, { id: aid, role: "assistant", text: "" }]);
    let full = "";
    try {
      await streamChat(sessionId, msg, (d) => {
        full += d;
        setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: full } : x)));
      });
      const match = full.match(TAG);
      setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: clean(full), productId: match?.[1] } : x)));
    } catch (e: any) {
      setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: e.message || "Something went wrong.", error: true } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="chat-step">
      <View style={styles.header}>
        <Ionicons name="menu" size={22} color={colors.onSurface} />
        <Text style={styles.headerTitle}>ChatGPT</Text>
        <Ionicons name="create-outline" size={22} color={colors.onSurface} />
      </View>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>What are you shopping for?</Text>
            <Text style={styles.emptySub}>Instacart is connected. Ask ChatGPT to find something at Target.</Text>
            {SUGGESTIONS.map((s, i) => (
              <Pressable key={s} testID={`chat-suggestion-${i}`} style={styles.suggestion} onPress={() => send(s)}>
                <Ionicons name="sparkles-outline" size={16} color={colors.muted} />
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <Animated.View entering={FadeInUp.duration(220)} key={m.id} style={styles.userBubble}>
              <Text style={styles.userText}>{m.text}</Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(220)} key={m.id} style={styles.aiWrap} testID="chat-assistant-message">
              {m.text ? (
                <Text style={[styles.aiText, m.error && { color: colors.error }]}>{clean(m.text)}</Text>
              ) : (
                <ActivityIndicator color={colors.muted} style={styles.typing} />
              )}
              {m.productId && products[m.productId] && (
                <ProductWidget product={products[m.productId]} onCheckout={onCheckout} loading={checkingOut} />
              )}
            </Animated.View>
          ),
        )}
      </ScrollView>
      <View style={styles.composer}>
        <View style={styles.chip}>
          <InstacartMark label="Instacart" />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            placeholder="Ask ChatGPT"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <Pressable
            testID="chat-send-button"
            onPress={() => send(input)}
            style={[styles.send, (!input.trim() || busy) && styles.sendOff]}
            disabled={!input.trim() || busy}
          >
            {busy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="arrow-up" size={18} color={colors.onBrandPrimary} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProductWidget({ product, onCheckout, loading }: { product: Product; onCheckout: (p: Product) => void; loading: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.widget} testID={`product-widget-${product.id}`}>
      <View style={styles.wHead}>
        <InstacartMark />
      </View>
      <View style={styles.wRow}>
        <TargetLogo size={30} />
        <View style={styles.flex}>
          <Text style={styles.wFee}>4% service fee ($2.50 min.)</Text>
          <Text style={styles.wFee}>$0.15 per bag fee</Text>
        </View>
        <Ionicons name="pencil" size={16} color="#FF7009" />
      </View>
      <View style={styles.points} testID="widget-points-banner">
        <Ionicons name="star" size={14} color={colors.onBrandTertiary} />
        <Text style={styles.pointsText}>
          Earning <Text style={styles.bold}>5x Citi ThankYou® Points</Text> using your Citi Custom Cash card
        </Text>
      </View>
      <View style={styles.wRow}>
        <Image source={{ uri: product.image }} style={styles.pImg} contentFit="cover" />
        <View style={styles.flex}>
          <Text style={styles.pName} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.pVariant}>{product.variant}</Text>
          <Text style={styles.pPrice}>
            {money(product.price)} <Text style={styles.strike}>{money(product.compare_at)}</Text>
          </Text>
        </View>
        <View style={styles.qty}><Text style={styles.qtyText}>1 ct</Text></View>
      </View>
      <View style={styles.wFoot}>
        <View>
          <Text style={styles.wFee}>Delivery by 11:45am</Text>
          <Text style={styles.wFee}>10848 South Bell Avenue</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.wFee}>Items subtotal</Text>
          <Text style={styles.subtotal}>{money(product.price)}</Text>
        </View>
      </View>
      <Pressable testID="widget-checkout-button" style={styles.checkout} onPress={() => onCheckout(product)} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={styles.checkoutText}>Checkout</Text>}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { fontSize: 17, fontWeight: "600", color: c.onSurface },
  list: { padding: 16, gap: 12 },
  empty: { paddingTop: 16, gap: 8 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: c.onSurface },
  emptySub: { fontSize: 14, color: c.muted, marginBottom: 8 },
  suggestion: {
    flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border,
    borderRadius: 12, paddingHorizontal: 12, minHeight: 48,
  },
  suggestionText: { flex: 1, fontSize: 14, color: c.onSurface },
  userBubble: { alignSelf: "flex-end", maxWidth: "80%", backgroundColor: c.surfaceSecondary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { fontSize: 15, color: c.onSurface },
  aiWrap: { gap: 12 },
  aiText: { fontSize: 15, lineHeight: 22, color: c.onSurface },
  typing: { alignSelf: "flex-start" },
  widget: {
    borderWidth: 1, borderColor: c.border, borderRadius: 16, backgroundColor: c.surface, overflow: "hidden",
    shadowColor: c.onSurface, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  wHead: { padding: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  wRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  wFee: { fontSize: 12, color: c.muted },
  points: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.brandTertiary, paddingHorizontal: 12, paddingVertical: 8 },
  pointsText: { flex: 1, fontSize: 12, color: c.onBrandTertiary },
  bold: { fontWeight: "700" },
  pImg: { width: 52, height: 52, borderRadius: 8, backgroundColor: c.surfaceSecondary },
  pName: { fontSize: 13, fontWeight: "600", color: c.onSurface },
  pVariant: { fontSize: 12, color: c.muted },
  pPrice: { fontSize: 13, fontWeight: "600", color: c.onSurface, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: c.muted, fontWeight: "400" },
  qty: { backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  qtyText: { fontSize: 12, fontWeight: "600", color: c.onSurface },
  wFoot: { flexDirection: "row", justifyContent: "space-between", padding: 12 },
  right: { alignItems: "flex-end" },
  subtotal: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  checkout: {
    marginHorizontal: 12, marginBottom: 12, height: 48, borderRadius: 999, backgroundColor: c.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  checkoutText: { color: c.onBrandSecondary, fontSize: 16, fontWeight: "700" },
  composer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.divider, gap: 8 },
  chip: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16,
    fontSize: 15, color: c.onSurface,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
}));
