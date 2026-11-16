import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { makeStyles, useTheme } from "@/src/theme";
import { API, api, type Activation, type Cart, type Lookup, type Order, type Product } from "@/src/api";
import { getProtocol, stepLabels } from "@/src/flow";
import { agentFrom } from "@/src/agents";
import { Stepper } from "@/src/components/Stepper";
import { ProtocolPanel } from "@/src/components/ProtocolPanel";
import { ChatStep, type ChatMsg } from "@/src/components/steps/ChatStep";
import { CitiSignInStep, DoneStep, OffersStep, WayfairCartStep } from "@/src/components/steps/OffersSteps";

const newSessionId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function Shop() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const agent = agentFrom(useLocalSearchParams<{ agent?: string }>().agent);
  const STEPS = stepLabels(agent.name);

  const [chatId, setChatId] = useState(newSessionId);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [qty, setQtyMap] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [cart, setCart] = useState<Cart | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStepRaw] = useState(0);
  const setStep = (n: number) => {
    setError(null);
    setStepRaw(n);
  };

  useEffect(() => {
    fetch(`${API}/products`)
      .then((r) => r.json())
      .then((list: Product[]) => setProducts(Object.fromEntries(list.map((p) => [p.id, p]))))
      .catch(() => {});
  }, []);

  const info = useMemo(() => getProtocol(agent.id, step, { cart, lookup, activation, order }), [agent.id, step, cart, lookup, activation, order]);
  const citi = step === 1 || step === 2;

  const setQty = (id: string, q: number) =>
    setQtyMap((m) => {
      const next = { ...m };
      if (q <= 0) delete next[id];
      else next[id] = Math.min(5, q);
      return next;
    });

  const checkOffers = async () => {
    const items = Object.entries(qty).filter(([id]) => products[id]).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return;
    setBusy("check");
    try {
      setCart(cart ? await api.updateCart(cart.cart_ref, items) : await api.createCart(agent.id, items));
      setLookup(null);
      setActivation(null);
      setStep(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const placeOrder = async () => {
    if (!cart) return;
    setBusy("order");
    setError(null);
    try {
      setOrder(await api.placeOrder(cart.cart_ref));
      setStep(4);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const restart = () => {
    setChatId(newSessionId());
    setMessages([]);
    setQtyMap({});
    setCart(null);
    setLookup(null);
    setActivation(null);
    setOrder(null);
    setStep(0);
  };

  const canGoBack = step > 0 && step < 4;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="shop-screen">
      <View style={styles.header}>
        <Pressable
          testID="journey-back-button"
          style={styles.iconBtn}
          onPress={() => (canGoBack ? setStep(step === 3 ? 2 : step - 1) : router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Ionicons name={canGoBack ? "chevron-back" : "close"} size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{agent.name} · {agent.protocol}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Citi offers during furniture shopping</Text>
        </View>
        <Pressable testID="journey-restart-button" style={styles.iconBtn} onPress={restart}>
          <Ionicons name="refresh" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <Stepper step={step} labels={STEPS} />

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {error && step === 0 ? (
          <Pressable testID="journey-error-banner" style={styles.errorBanner} onPress={() => setError(null)}>
            <Ionicons name="alert-circle" size={16} color={colors.onError} />
            <Text style={styles.errorText}>{error}</Text>
            <Ionicons name="close" size={16} color={colors.onError} />
          </Pressable>
        ) : null}
        <View style={[styles.body, citi && styles.bodyCiti]}>
          {step === 0 && (
            <ChatStep
              agent={agent}
              sessionId={chatId}
              messages={messages}
              setMessages={setMessages}
              products={products}
              cart={qty}
              setQty={setQty}
              onCheckout={checkOffers}
              checkingOut={busy === "check"}
            />
          )}
          {step === 1 && cart && <CitiSignInStep cart={cart} onVerified={() => setStep(2)} />}
          {step === 2 && cart && (
            <OffersStep
              cart={cart}
              lookup={lookup}
              setLookup={setLookup}
              activation={activation}
              setActivation={setActivation}
              onReturn={() => setStep(3)}
            />
          )}
          {step === 3 && cart && (
            <WayfairCartStep
              agent={agent}
              cart={cart}
              activation={activation}
              skippedOffer={!!lookup?.offer && !activation}
              onPlace={placeOrder}
              onEdit={() => setStep(0)}
              placing={busy === "order"}
              error={error}
            />
          )}
          {step === 4 && cart && order && (
            <DoneStep agentName={agent.name} cart={cart} order={order} onActivity={() => router.push("/activity")} onRestart={restart} />
          )}
        </View>
        <ProtocolPanel info={info} />
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 11, color: c.muted },
  body: { flex: 1, borderTopWidth: 1, borderTopColor: c.border, overflow: "hidden" },
  bodyCiti: { backgroundColor: c.surfaceInverse },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.error, paddingHorizontal: 16, minHeight: 44 },
  errorText: { flex: 1, color: c.onError, fontSize: 13, fontWeight: "600" },
}));
