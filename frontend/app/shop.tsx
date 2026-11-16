import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { makeStyles, useTheme } from "@/src/theme";
import { API, api, type Activation, type Cart, type Lookup, type Order, type Product } from "@/src/api";
import { getProtocol, stepLabels } from "@/src/flow";
import { agentFrom } from "@/src/agents";
import { useSkipDelay } from "@/src/presenter";
import { Stepper } from "@/src/components/Stepper";
import { ProtocolPanel } from "@/src/components/ProtocolPanel";
import { PayAuthSheet } from "@/src/components/PayAuthSheet";
import { ChatStep, type ChatMsg } from "@/src/components/steps/ChatStep";
import { CitiSignInStep, DoneStep, OffersStep, WayfairCartStep } from "@/src/components/steps/OffersSteps";

const newSessionId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Scenario = "offer" | "no_offer";
const SCENARIOS: Record<Scenario, { prompt: string; product: string }> = {
  offer: { prompt: "I need a big sectional for my living room", product: "wf-arnav-sectional" },
  no_offer: { prompt: "Something small for my apartment, under $400", product: "wf-zipcode-loveseat" },
};

function narration(step: number, s: Scenario, agent: string, wallet: string) {
  const offer = s === "offer";
  return [
    `${agent} is where the shopper starts. They ask for a sofa and the Wayfair app shows products and a cart. They add ${offer ? "a $1,249.99 sectional" : "a $389.99 loveseat"} and tap Check Citi offers.`,
    "Wayfair opens Citi's page with a signed cart reference — no card number or credentials are shared with the agent. The shopper signs in on Citi's page with Face ID.",
    offer
      ? "Citi Offers asks Mastercard Offers for matches. The retailer-wide pilot matches: 10% back up to $150. Activating records it with Mastercard."
      : "Citi Offers asks Mastercard Offers for matches. None apply — the loveseat is under the $500 minimum — so Citi says so clearly and sends the shopper back.",
    `Back in the Wayfair cart the offer status carries over. The shopper places the order with ${wallet}, confirms with biometrics, and Citi approves the payment.`,
    offer
      ? "Order placed. When the purchase clears, Mastercard matches it to the activation and Citi posts the $125 statement credit."
      : "Order placed without an offer — the purchase posts as usual and appears in Agent Activity.",
  ][step];
}

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
  const [presenting, setPresenting] = useState<Scenario | null>(null);
  const [paused, setPaused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const delay = useSkipDelay(skip);
  const setStep = (n: number) => {
    setError(null);
    setAuthOpen(false);
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
    setAuthOpen(false);
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
    setAutoPrompt(null);
    setStep(0);
  };

  const startPresenter = (s: Scenario) => {
    setPickerOpen(false);
    restart();
    setPaused(false);
    setPresenting(s);
  };

  const running = !!presenting && !paused;
  useEffect(() => {
    const fast = delay(1) === 0;
    const wait = (ms: number) => (fast ? 0 : ms);
    if (!running || !presenting) return;
    const sc = SCENARIOS[presenting];
    let t: ReturnType<typeof setTimeout> | undefined;
    if (step === 0) {
      const last = messages[messages.length - 1];
      if (messages.length === 0) t = setTimeout(() => setAutoPrompt(sc.prompt), wait(5000));
      else if (last?.role === "assistant" && (last.productIds || last.error) && !qty[sc.product]) t = setTimeout(() => setQty(sc.product, 1), wait(6000));
      else if (qty[sc.product] && !busy) t = setTimeout(checkOffers, wait(5000));
    } else if (step === 3 && !busy && !error && !authOpen) {
      t = setTimeout(() => setAuthOpen(true), wait(7000));
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, presenting, step, messages, qty, busy, error, skip, authOpen]);

  const stepBack = () => {
    if (step === 0) return;
    if (step <= 3) {
      setLookup(null);
      setActivation(null);
    }
    setOrder(null);
    setPaused(false);
    setStep(step - 1);
  };

  const skipAhead = () => {
    setPaused(false);
    setSkip((n) => n + 1);
  };

  const canGoBack = step > 0 && step < 4;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="shop-screen">
      <View style={styles.header}>
        <Pressable
          testID="journey-back-button"
          style={styles.iconBtn}
          onPress={() => (canGoBack ? setStep(step === 3 ? 2 : step - 1) : router.push("/home"))}
        >
          <Ionicons name={canGoBack ? "chevron-back" : "grid-outline"} size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable
          testID="agent-switch-button"
          style={styles.titleWrap}
          onPress={() => {
            restart();
            router.setParams({ agent: agent.id === "chatgpt" ? "gemini" : "chatgpt" });
          }}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{agent.name}</Text>
            <Ionicons name="swap-horizontal" size={14} color={colors.muted} />
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            Tap to switch to {agent.id === "chatgpt" ? "Gemini" : "ChatGPT"}
          </Text>
        </Pressable>
        <Pressable testID="presenter-button" style={styles.iconBtn} onPress={() => (presenting ? setPresenting(null) : setPickerOpen(true))}>
          <Ionicons name={presenting ? "stop-circle-outline" : "play-circle-outline"} size={24} color={presenting ? colors.error : colors.onSurface} />
        </Pressable>
        <Pressable testID="journey-restart-button" style={styles.iconBtn} onPress={restart}>
          <Ionicons name="refresh" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <Stepper step={step} labels={STEPS} />
      {presenting && (
        <View style={styles.presenter} testID="presenter-commentary">
          <View style={styles.presenterHead}>
            <View style={[styles.liveDot, paused && styles.liveDotPaused]} />
            <Text style={styles.presenterKicker} numberOfLines={1}>
              {presenting === "offer" ? "OFFER" : "NO OFFER"} · {step + 1}/5
            </Text>
            <Pressable testID="presenter-replay-button" style={styles.presenterBtn} onPress={() => startPresenter(presenting)} hitSlop={6}>
              <Ionicons name="reload" size={16} color={colors.onSurfaceInverse} />
            </Pressable>
            <Pressable
              testID="presenter-back-button"
              style={[styles.presenterBtn, step === 0 && styles.presenterBtnOff]}
              onPress={stepBack}
              disabled={step === 0}
              hitSlop={6}
            >
              <Ionicons name="play-skip-back" size={16} color={colors.onSurfaceInverse} />
            </Pressable>
            <Pressable testID="presenter-pause-button" style={styles.presenterBtn} onPress={() => setPaused((p) => !p)} hitSlop={6}>
              <Ionicons name={paused ? "play" : "pause"} size={16} color={colors.onSurfaceInverse} />
            </Pressable>
            <Pressable
              testID="presenter-skip-button"
              style={[styles.presenterBtn, step === 4 && styles.presenterBtnOff]}
              onPress={skipAhead}
              disabled={step === 4}
              hitSlop={6}
            >
              <Ionicons name="play-forward" size={16} color={colors.onSurfaceInverse} />
            </Pressable>
            <Pressable testID="presenter-exit-button" style={styles.presenterBtn} onPress={() => setPresenting(null)} hitSlop={6}>
              <Ionicons name="close" size={16} color={colors.onSurfaceInverse} />
            </Pressable>
          </View>
          <Text style={styles.presenterText} testID="presenter-text">{narration(step, presenting, agent.name, agent.walletName)}</Text>
        </View>
      )}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard} testID="presenter-picker">
            <Text style={styles.modalTitle}>Presenter mode</Text>
            <Text style={styles.modalSub}>Auto-plays the {agent.name} offers flow with commentary. Pause, go back a step, skip ahead, replay or exit any time.</Text>
            <Pressable testID="presenter-start-offer" style={styles.modalOption} onPress={() => startPresenter("offer")}>
              <Ionicons name="pricetag" size={18} color={colors.success} />
              <View style={styles.flex}>
                <Text style={styles.modalOptTitle}>Offer available</Text>
                <Text style={styles.modalSub}>Sectional sofa · $125 back activated</Text>
              </View>
            </Pressable>
            <Pressable testID="presenter-start-no-offer" style={styles.modalOption} onPress={() => startPresenter("no_offer")}>
              <Ionicons name="pricetag-outline" size={18} color={colors.muted} />
              <View style={styles.flex}>
                <Text style={styles.modalOptTitle}>No matching offer</Text>
                <Text style={styles.modalSub}>Loveseat under $500 · no offer</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
              key={chatId}
              agent={agent}
              sessionId={chatId}
              messages={messages}
              setMessages={setMessages}
              products={products}
              cart={qty}
              setQty={setQty}
              onCheckout={checkOffers}
              checkingOut={busy === "check"}
              onNewChat={restart}
              autoPrompt={running ? autoPrompt : null}
            />
          )}
          {step === 1 && cart && <CitiSignInStep cart={cart} onVerified={() => setStep(2)} auto={running} skip={skip} />}
          {step === 2 && cart && (
            <OffersStep
              cart={cart}
              lookup={lookup}
              setLookup={setLookup}
              activation={activation}
              setActivation={setActivation}
              onReturn={() => setStep(3)}
              auto={running}
              skip={skip}
            />
          )}
          {step === 3 && cart && (
            <WayfairCartStep
              agent={agent}
              cart={cart}
              activation={activation}
              skippedOffer={!!lookup?.offer && !activation}
              onPlace={() => setAuthOpen(true)}
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
        {authOpen && step === 3 && cart && (
          <PayAuthSheet agent={agent} cart={cart} onApproved={placeOrder} onCancel={() => setAuthOpen(false)} auto={running} skip={skip} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center", minHeight: 44, justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 11, color: c.muted },
  body: { flex: 1, borderTopWidth: 1, borderTopColor: c.border, overflow: "hidden" },
  bodyCiti: { backgroundColor: c.surfaceInverse },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.error, paddingHorizontal: 16, minHeight: 44 },
  errorText: { flex: 1, color: c.onError, fontSize: 13, fontWeight: "600" },
  presenter: { backgroundColor: c.surfaceInverse, marginHorizontal: 8, marginBottom: 8, borderRadius: 14, padding: 12, gap: 6 },
  presenterHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.error },
  liveDotPaused: { backgroundColor: c.citiMuted },
  presenterKicker: { flex: 1, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: c.citiMuted },
  presenterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.citiCard, alignItems: "center", justifyContent: "center" },
  presenterBtnOff: { opacity: 0.4 },
  presenterText: { fontSize: 14, lineHeight: 20, color: c.onSurfaceInverse },
  modalBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: c.surface, borderRadius: 20, padding: 20, gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  modalSub: { fontSize: 13, color: c.muted },
  modalOption: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, minHeight: 56 },
  modalOptTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
}));
