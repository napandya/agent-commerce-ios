import { fetch as expoFetch } from "expo/fetch";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Product = {
  id: string; brand: string; name: string; variant: string; short: string; price: number;
  compare_at: number; clearance: boolean; image: string; retailer: string;
};
export type Totals = { subtotal: number; shipping: number; tax: number; total: number };
export type LineItem = { product: Product; quantity: number; line_total: number };
export type CartItem = { product_id: string; quantity: number };
export type Offer = {
  id: string; title: string; headline: string; program: string; funded_by: string;
  min_spend: number; rate: number; max_credit: number; terms: string[];
  credit: number; eligible_spend: number; mastercard_request_id: string;
};
export type Activation = { activation_id: string; offer_id: string; card_last4: string; credit: number; activated_at: string };
export type Cart = {
  cart_ref: string; status: string; retailer: string; agent_id: string; wallet: string;
  line_items: LineItem[]; summary: string; totals: Totals;
  offer_status: "unchecked" | "eligible" | "no_match" | "activated"; offer: Offer | null; activation: Activation | null;
};
export type Lookup = {
  cart_ref: string; eligible: boolean; offer: Offer | null; reason: string | null;
  card: { brand: string; last4: string; product: string }; mastercard_request_id: string; already_activated: boolean;
};
export type Order = {
  order_id: string; amount: number; wallet: string; card_last4: string; statement_credit: number;
  offer_activated: boolean; points_earned: number; eta: string;
};
export type Txn = {
  id: string; merchant: string; agent_id: string; agent_name: string; item: string; item_full: string;
  amount: number; card_last4: string; status: "approved" | "declined" | "completed"; reason: string | null;
  points_earned: number; statement_credit?: number; order_id?: string; created_at: string;
};
export type Agent = {
  id: string; name: string; provider: string; enabled: boolean;
  limit: number; revoked: boolean; connected_at: string;
};
export type Breakdown = { name: string; amount: number; count: number };
export type Insights = {
  month: string; total_spent: number; purchases: number; declined: number; points_earned: number;
  statement_credits: number; by_agent: Breakdown[]; by_merchant: Breakdown[];
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
  createCart: (agent_id: string, items: CartItem[]) => req<Cart>("/carts", "POST", { agent_id, items }),
  updateCart: (ref: string, items: CartItem[]) => req<Cart>(`/carts/${ref}`, "PATCH", { items }),
  lookupOffers: (cart_ref: string) => req<Lookup>("/citi/offers/lookup", "POST", { cart_ref }),
  activateOffer: (cart_ref: string, offer_id: string) => req<Activation>("/citi/offers/activate", "POST", { cart_ref, offer_id }),
  placeOrder: (ref: string) => req<Order>(`/carts/${ref}/place_order`, "POST"),
  insights: (month: string) => req<Insights>(`/insights?month=${month}`),
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
