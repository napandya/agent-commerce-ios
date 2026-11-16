import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";
import { money, streamChat, type Product } from "@/src/api";
import { WalletMark, WayfairLogo } from "@/src/components/Brand";
import type { AgentConfig } from "@/src/agents";
import { AppPicker, ChatSidebar } from "@/src/components/ChatChrome";

export type ChatMsg = { id: string; role: "user" | "assistant"; text: string; productIds?: string[]; error?: boolean };

const TAGS = /\[\[(product|add):([a-z0-9-]+)(?::(\d+))?\]\]/gi;

function clean(text: string) {
  return text.replace(/\[\[[^\]]*\]\]/g, "").replace(/\[\[[^\]]*$/, "").replace(/\*\*|__/g, "").trim();
}

type Props = {
  agent: AgentConfig;
  sessionId: string;
  messages: ChatMsg[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  products: Record<string, Product>;
  cart: Record<string, number>;
  setQty: (id: string, qty: number) => void;
  onCheckout: () => void;
  checkingOut: boolean;
  onNewChat: () => void;
  autoPrompt?: string | null;
};

export function ChatStep({ agent, sessionId, messages, setMessages, products, cart, setQty, onCheckout, checkingOut, onNewChat, autoPrompt }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [picker, setPicker] = useState(false);
  const [appOn, setAppOn] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const gemini = agent.id === "gemini";
  const cartIds = Object.keys(cart).filter((id) => products[id]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    const aid = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: msg }, { id: aid, role: "assistant", text: "" }]);
    let full = "";
    try {
      const cartItems = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
      await streamChat(sessionId, msg, agent.id, cartItems, (d) => {
        full += d;
        setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: full } : x)));
      });
      const ids: string[] = [];
      for (const [, kind, id, qty] of full.matchAll(TAGS)) {
        if (kind.toLowerCase() === "add") setQty(id, qty === undefined ? 1 : parseInt(qty, 10));
        else if (!ids.includes(id)) ids.push(id);
      }
      setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: clean(full), productIds: ids } : x)));
    } catch (e: any) {
      setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: e.message || "Something went wrong.", error: true } : x)));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoPrompt && messages.length === 0) send(autoPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  return (
    <View style={[styles.root, gemini && styles.rootGemini]} testID="chat-step">
      <View style={styles.header}>
        <Pressable testID="chat-menu-button" style={styles.hBtn} onPress={() => setSidebar(true)}>
          <Ionicons name="menu" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter} testID="chat-model-label">
          {gemini && <Ionicons name="sparkles" size={16} color={colors.geminiBlue} />}
          <Text style={styles.headerTitle} testID="chat-agent-name">{agent.name}</Text>
          <Text style={styles.modelText}>{gemini ? "3 Flash" : "5.4"}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </View>
        <Pressable testID="chat-new-button" style={styles.hBtn} onPress={onNewChat}>
          <Ionicons name="create-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{gemini ? "Hello, Pat" : "What can I help with?"}</Text>
            <Text style={styles.emptySub}>
              {appOn ? "Wayfair is connected. Ask about sofas." : "Tap + to connect the Wayfair app."}
            </Text>
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
                <View style={styles.thinking}><View style={styles.dot} /><Text style={styles.thinkingText}>Thinking</Text></View>
              )}
              {m.productIds && (
                <View style={styles.actions}>
                  {(["copy-outline", "thumbs-up-outline", "thumbs-down-outline", "volume-medium-outline", "refresh"] as const).map((n) => (
                    <Ionicons key={n} name={n} size={16} color={colors.muted} />
                  ))}
                </View>
              )}
              {appOn && m.productIds?.map((id) =>
                products[id] ? (
                  <SuggestionRow key={id} product={products[id]} inCart={!!cart[id]} onAdd={() => setQty(id, (cart[id] ?? 0) + 1)} />
                ) : null,
              )}
            </Animated.View>
          ),
        )}
        {cartIds.length > 0 && (
          <CartWidget agent={agent} products={products} cart={cart} setQty={setQty} onCheckout={onCheckout} loading={checkingOut} disabled={busy} />
        )}
      </ScrollView>
      {messages.length === 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sugScroll} contentContainerStyle={styles.sugRowH}>
          {agent.suggestions.map((s, i) => (
            <Pressable key={s} testID={`chat-suggestion-${i}`} style={styles.sugCard} onPress={() => send(s)}>
              <Text style={styles.sugCardText} numberOfLines={2}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.composer}>
        <View style={styles.composerBox}>
          {appOn && (
            <View style={styles.chip} testID="composer-app-chip">
              <WayfairLogo size={14} />
              <Text style={styles.chipText}>{agent.storeLabel}</Text>
              <Pressable testID="composer-app-remove" style={styles.chipClose} onPress={() => setAppOn(false)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.muted} />
              </Pressable>
            </View>
          )}
          <TextInput
            testID="chat-input"
            style={styles.input}
            placeholder={gemini ? "Ask Gemini" : "Ask anything"}
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <View style={styles.composerBottom}>
            <Pressable testID="chat-plus-button" style={styles.plusBtn} onPress={() => setPicker(true)} hitSlop={6}>
              <Ionicons name="add" size={22} color={colors.onSurface} />
            </Pressable>
            <View style={styles.flex} />
            <Ionicons name="mic-outline" size={22} color={colors.onSurfaceTertiary} />
            <Pressable
              testID="chat-send-button"
              hitSlop={6}
              onPress={() => send(input)}
              style={[styles.send, (!input.trim() || busy) && styles.sendOff]}
              disabled={!input.trim() || busy}
            >
              {busy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="arrow-up" size={18} color={colors.onBrandPrimary} />}
            </Pressable>
          </View>
        </View>
      </View>
      <ChatSidebar agent={agent} open={sidebar} onClose={() => setSidebar(false)} onNewChat={onNewChat} onOpenApps={() => setPicker(true)} appOn={appOn} />
      <AppPicker open={picker} onClose={() => setPicker(false)} appOn={appOn} setAppOn={setAppOn} />
    </View>
  );
}

function SuggestionRow({ product, inCart, onAdd }: { product: Product; inCart: boolean; onAdd: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.sugRow} testID={`product-suggestion-${product.id}`}>
      <Image source={{ uri: product.image }} style={styles.sugImg} contentFit="cover" />
      <View style={styles.flex}>
        <Text style={styles.pName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.pVariant}>{product.variant} · {money(product.price)}</Text>
      </View>
      <Pressable testID={`product-add-${product.id}`} onPress={onAdd} hitSlop={6} style={[styles.addBtn, inCart && styles.addBtnOn]}>
        <Ionicons name={inCart ? "checkmark" : "add"} size={16} color={inCart ? colors.onBrandTertiary : colors.onBrandPrimary} />
        <Text style={[styles.addText, inCart && styles.addTextOn]}>{inCart ? "Added" : "Add"}</Text>
      </Pressable>
    </View>
  );
}

type CartProps = {
  agent: AgentConfig; products: Record<string, Product>; cart: Record<string, number>;
  setQty: (id: string, q: number) => void; onCheckout: () => void; loading: boolean; disabled: boolean;
};

function CartWidget({ agent, products, cart, setQty, onCheckout, loading, disabled }: CartProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const gemini = agent.id === "gemini";
  const entries = Object.entries(cart).filter(([id]) => products[id]);
  const subtotal = entries.reduce((s, [id, q]) => s + products[id].price * q, 0);
  const count = entries.reduce((s, [, q]) => s + q, 0);
  return (
    <Animated.View entering={FadeInUp.duration(260)} style={styles.widget} testID="cart-widget">
      <View style={styles.wHead}>
        <View style={styles.chipRow}>
          <WayfairLogo size={20} />
          <Text style={styles.wTitle}>{agent.storeLabel}</Text>
        </View>
        <Text style={styles.wFee} testID="cart-count">{count} item{count === 1 ? "" : "s"}</Text>
      </View>
      <View style={styles.wRow}>
        <WalletMark wallet={agent.wallet} size={14} />
        <Text style={[styles.wFee, styles.flex]}>Pay with {agent.walletName} using your Citi Mastercard ···· 4680</Text>
      </View>
      <View style={styles.points} testID="widget-offers-hint">
        <Ionicons name="pricetag" size={14} color={colors.onBrandTertiary} />
        <Text style={styles.pointsText}>
          Have a Citi card? <Text style={styles.bold}>Check Citi offers</Text> before you place the order
        </Text>
      </View>
      {entries.map(([id, q]) => {
        const p = products[id];
        return (
          <View key={id} style={styles.wRow} testID={`cart-item-${id}`}>
            <Image source={{ uri: p.image }} style={styles.pImg} contentFit="cover" />
            <View style={styles.flex}>
              <Text style={styles.pName} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.pVariant}>{p.variant}</Text>
              <Text style={styles.pPrice}>
                {money(p.price)} <Text style={styles.strike}>{money(p.compare_at)}</Text>
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable testID={`cart-decrease-${id}`} style={styles.stepBtn} onPress={() => setQty(id, q - 1)} hitSlop={4}>
                <Ionicons name={q === 1 ? "trash-outline" : "remove"} size={16} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.qtyText} testID={`cart-qty-${id}`}>{q}</Text>
              <Pressable testID={`cart-increase-${id}`} style={styles.stepBtn} onPress={() => setQty(id, q + 1)} disabled={q >= 5} hitSlop={4}>
                <Ionicons name="add" size={16} color={q >= 5 ? colors.muted : colors.onSurface} />
              </Pressable>
            </View>
          </View>
        );
      })}
      <View style={styles.wFoot}>
        <View>
          <Text style={styles.wFee}>Free delivery in 5–7 days</Text>
          <Text style={styles.wFee}>10848 South Bell Avenue</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.wFee}>Items subtotal</Text>
          <Text style={styles.subtotal} testID="cart-subtotal">{money(subtotal)}</Text>
        </View>
      </View>
      <Pressable
        testID="check-offers-button"
        style={[styles.checkout, gemini && styles.checkoutGemini, disabled && styles.sendOff]}
        onPress={onCheckout}
        disabled={loading || disabled}
      >
        {loading ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={styles.checkoutText}>Check Citi offers</Text>}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  rootGemini: { backgroundColor: c.geminiSurface },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  wTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sugRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 8 },
  sugImg: { width: 40, height: 40, borderRadius: 8, backgroundColor: c.surfaceSecondary },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.brandPrimary },
  addBtnOn: { backgroundColor: c.brandTertiary },
  addText: { fontSize: 13, fontWeight: "700", color: c.onBrandPrimary },
  addTextOn: { color: c.onBrandTertiary },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: 999 },
  stepBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  checkoutGemini: { backgroundColor: c.geminiBlue },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 2 },
  headerTitle: { fontSize: 17, fontWeight: "600", color: c.onSurface },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 26, fontWeight: "600", color: c.onSurface, textAlign: "center" },
  emptySub: { fontSize: 14, color: c.muted, textAlign: "center" },
  userBubble: { alignSelf: "flex-end", maxWidth: "80%", backgroundColor: c.surfaceSecondary, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  userText: { fontSize: 16, color: c.onSurface },
  aiWrap: { gap: 10 },
  aiText: { fontSize: 16, lineHeight: 24, color: c.onSurface },
  widget: {
    borderWidth: 1, borderColor: c.border, borderRadius: 16, backgroundColor: c.surface, overflow: "hidden",
    shadowColor: c.onSurface, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  wHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
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
  composer: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  composerBox: { borderWidth: 1, borderColor: c.border, borderRadius: 26, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, gap: 4, backgroundColor: c.surface,
    shadowColor: c.onSurface, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  chipClose: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 4 },
  input: { minHeight: 40, paddingHorizontal: 8, fontSize: 16, color: c.onSurface },
  composerBottom: { flexDirection: "row", alignItems: "center", gap: 12 },
  plusBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
  hBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modelText: { fontSize: 17, fontWeight: "400", color: c.muted },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.onSurface },
  thinkingText: { fontSize: 14, color: c.muted },
  actions: { flexDirection: "row", gap: 16, paddingVertical: 2 },
  sugScroll: { flexGrow: 0 },
  sugRowH: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sugCard: { flexShrink: 0, width: 200, borderRadius: 16, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56, justifyContent: "center" },
  sugCardText: { fontSize: 14, color: c.onSurface },
}));
