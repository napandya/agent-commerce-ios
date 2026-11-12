import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { makeStyles, useTheme } from "@/src/theme";
import { API, api, type AgentToken, type CheckoutSession, type Order, type PaymentOption, type Product, type Txn } from "@/src/api";
import { getProtocol, stepLabels } from "@/src/protocols";
import { agentFrom } from "@/src/agents";
import { Stepper } from "@/src/components/Stepper";
import { ProtocolPanel } from "@/src/components/ProtocolPanel";
import { ChatStep, type ChatMsg } from "@/src/components/steps/ChatStep";
import { PaymentStep, PayStep } from "@/src/components/steps/InstacartSteps";
import { AuthorizeStep, FaceIdStep } from "@/src/components/steps/CitiSteps";
import { ConfirmedStep } from "@/src/components/steps/ConfirmedStep";

const newSessionId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function Journey() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const agent = agentFrom(useLocalSearchParams<{ agent?: string }>().agent);
  const STEPS = stepLabels(agent.name);

  const [chatId, setChatId] = useState(newSessionId);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [token, setToken] = useState<AgentToken | null>(null);
  const [txn, setTxn] = useState<Txn | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [declined, setDeclined] = useState(false);
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

  const info = useMemo(
    () => getProtocol(agent.id, step, { session, token, txn, order, declined }),
    [agent.id, step, session, token, txn, order, declined],
  );
  const citi = step === 2 || step === 3;

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(10, qty);
      return next;
    });

  const checkout = async () => {
    const items = Object.entries(cart).filter(([id]) => products[id]).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return;
    setBusy("checkout");
    try {
      setSession(session ? await api.updateCheckout(session.id, { items }) : await api.createCheckout(items, agent.id));
      setStep(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const changeTip = async (tip: number) => {
    if (!session) return;
    setBusy("tip");
    try {
      setSession(await api.updateCheckout(session.id, { tip }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const decide = async (d: "approve" | "decline") => {
    if (!session) return;
    setBusy(d);
    setError(null);
    try {
      const t = await api.authorize(session.id, d);
      setTxn(t);
      if (t.status === "approved") {
        setToken(await api.tokenize(session.id));
        setStep(4);
      } else {
        setDeclined(true);
        setStep(5);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pay = async (opt: PaymentOption) => {
    if (!session) return;
    setBusy("pay");
    setError(null);
    try {
      setOrder(await api.complete(session.id, opt));
      setStep(5);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const restart = () => {
    setChatId(newSessionId());
    setMessages([]);
    setCart({});
    setSession(null);
    setToken(null);
    setTxn(null);
    setOrder(null);
    setDeclined(false);
    setError(null);
    setStep(0);
  };

  const canGoBack = step > 0 && step < 4;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="journey-screen">
      <View style={styles.header}>
        <Pressable
          testID="journey-back-button"
          style={styles.iconBtn}
          onPress={() => (canGoBack ? setStep(step - 1) : router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Ionicons name={canGoBack ? "chevron-back" : "close"} size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{agent.name} · {agent.protocol}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Citi Custom Cash® · {agent.subtitle}</Text>
        </View>
        <Pressable testID="journey-restart-button" style={styles.iconBtn} onPress={restart}>
          <Ionicons name="refresh" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <Stepper step={step} declined={declined} labels={STEPS} />
      <View style={styles.stepLabelRow}>
        <View style={styles.stepNum}><Text style={styles.stepNumText}>{step + 1}</Text></View>
        <Text style={styles.stepLabel} testID="current-step-label">
          {declined && step === 5 ? "DECLINED" : STEPS[step].toUpperCase()}
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {error && step < 3 ? (
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
              cart={cart}
              setQty={setQty}
              onCheckout={checkout}
              checkingOut={busy === "checkout"}
            />
          )}
          {step === 1 && session && (
            <PaymentStep agent={agent} session={session} onContinue={() => setStep(2)} onTip={changeTip} tipping={busy === "tip"} />
          )}
          {step === 2 && <FaceIdStep onVerified={() => setStep(3)} />}
          {step === 3 && session && (
            <AuthorizeStep agentName={agent.name} protocol={agent.protocol} session={session} onDecision={decide} busy={busy as any} error={error} />
          )}
          {step === 4 && session && <PayStep agent={agent} session={session} onPay={pay} paying={busy === "pay"} error={error} />}
          {step === 5 && session && (
            <ConfirmedStep
              agentName={agent.name}
              session={session}
              order={order}
              txn={txn}
              declined={declined}
              onActivity={() => router.push("/activity")}
              onRestart={restart}
            />
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
  stepLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 8 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.stepActive, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 11, fontWeight: "700", color: c.onInfo },
  stepLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: c.onSurfaceTertiary },
  body: { flex: 1, borderTopWidth: 1, borderTopColor: c.border, overflow: "hidden" },
  bodyCiti: { backgroundColor: c.surfaceInverse },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.error, paddingHorizontal: 16, minHeight: 44 },
  errorText: { flex: 1, color: c.onError, fontSize: 13, fontWeight: "600" },
}));
