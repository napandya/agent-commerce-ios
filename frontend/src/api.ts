import { fetch as expoFetch } from "expo/fetch";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Product = {
  id: string; name: string; variant: string; short: string; price: number;
  compare_at: number; image: string; retailer: string;
};
export type Totals = {
  subtotal: number; delivery_fee: number; service_fee: number; bag_fee: number;
  tip: number; tax: number; total: number;
};
export type LineItem = { product: Product; quantity: number; line_total: number };
export type CartItem = { product_id: string; quantity: number };
export type CheckoutSession = {
  id: string; status: string; protocol: string; merchant: string; agent_id: string;
  line_items: LineItem[]; summary: string; totals: Totals; currency: string;
  fulfillment: { type: string; address: string; window: string };
  card: { brand: string; last4: string; product: string }; created_at: string;
};
export type AgentToken = {
  agentic_token: string; token_pan_last4: string; funding_pan_last4: string; agent_id: string;
  scope: { merchant: string; max_amount: number; currency: string; single_use: boolean };
  cryptogram: string; expires_in: number;
};
export type Txn = {
  id: string; checkout_session_id: string; merchant: string; agent_id: string; agent_name: string;
  item: string; item_full: string; amount: number; card_last4: string;
  status: "approved" | "declined" | "completed"; reason: string | null; auth_code: string | null;
  points_earned: number; payment_option: string | null; order_id?: string; created_at: string;
};
export type Order = {
  order_id: string; status: string; points_earned: number; points_redeemed: number;
  payment_option: PaymentOption; flex_monthly: number | null; eta: string; amount: number; transaction_id: string;
};
export type Agent = {
  id: string; name: string; provider: string; protocol: string; enabled: boolean;
  limit: number; revoked: boolean; connected_at: string;
};
export type PaymentOption = "card" | "flex_pay" | "points";
export type Breakdown = { name: string; amount: number; count: number };
export type Insights = {
  month: string; total_spent: number; purchases: number; declined: number; points_earned: number;
  by_agent: Breakdown[]; by_merchant: Breakdown[];
};

async function req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = Array.isArray(err.detail) ? err.detail.map((d: any) => d.msg).join(", ") : err.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  createCheckout: (items: CartItem[], agent_id: string) => req<CheckoutSession>("/checkout_sessions", "POST", { items, tip: 5, agent_id }),
  updateCheckout: (sid: string, body: { items?: CartItem[]; tip?: number }) => req<CheckoutSession>(`/checkout_sessions/${sid}`, "PATCH", body),
  insights: (month: string) => req<Insights>(`/insights?month=${month}`),
  tokenize: (checkout_session_id: string) => req<AgentToken>("/agentpay/tokenize", "POST", { checkout_session_id }),
  authorize: (checkout_session_id: string, decision: "approve" | "decline") =>
    req<Txn>("/citi/authorize", "POST", { checkout_session_id, decision }),
  complete: (sid: string, payment_option: PaymentOption) => req<Order>(`/checkout_sessions/${sid}/complete`, "POST", { payment_option }),
  transactions: () => req<Txn[]>("/transactions"),
  agents: () => req<Agent[]>("/agents"),
  updateAgent: (id: string, body: Partial<Pick<Agent, "enabled" | "limit">>) => req<Agent>(`/agents/${id}`, "PATCH", body),
  revokeAgent: (id: string) => req<Agent>(`/agents/${id}/revoke`, "POST"),
};

export async function streamChat(
  sessionId: string, message: string, agentId: string, cart: CartItem[], onDelta: (t: string) => void,
): Promise<void> {
  const res = await expoFetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ session_id: sessionId, message, agent_id: agentId, cart }),
  });
  if (!res.ok || !res.body) throw new Error("Chat unavailable");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      const data = JSON.parse(line.slice(5));
      if (data.error) throw new Error(data.error);
      if (data.delta) onDelta(data.delta);
      if (data.done) return;
    }
  }
}

export const money = (n: number) => `$${n.toFixed(2)}`;
