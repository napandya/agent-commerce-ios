import type { Activation, Cart, Lookup, Order } from "./api";

export type ProtocolCtx = {
  cart?: Cart | null;
  lookup?: Lookup | null;
  activation?: Activation | null;
  order?: Order | null;
};

export type ProtocolInfo = {
  tags: string[];
  title: string;
  summary: string;
  flow: string[];
  points: string[];
  endpoint: string;
  payload: unknown;
};

export const stepLabels = (agentName: string) => [agentName, "Sign in", "Offers", "Cart", "Done"];

export const PROTOCOL_OVERVIEW = [
  {
    id: "mco",
    name: "Offers",
    full: "Mastercard Offers",
    by: "Mastercard + Citi",
    body: "Merchant-funded card offers. Citi looks up matches for a cart, records activation, and the statement credit posts when the purchase clears.",
  },
];

export function getProtocol(agentId: string, step: number, ctx: ProtocolCtx): ProtocolInfo {
  const chatgpt = agentId !== "gemini";
  const agent = chatgpt ? "ChatGPT" : "Gemini";
  const c = ctx.cart;
  switch (step) {
    case 0:
      return {
        tags: ["Wayfair"],
        title: "Shop the retailer catalog",
        summary: chatgpt
          ? "ChatGPT runs the Wayfair app: it reads Wayfair's product feed and shows a Wayfair cart widget in the chat."
          : "Gemini searches Wayfair's catalog and builds a cart directly with the merchant.",
        flow: ["Shopper", agent, "Wayfair"],
        points: [
          "Wayfair product feed: price, availability, delivery",
          "Cart lives with Wayfair (merchant of record)",
          "Agent can't quote Citi offers — only Citi can",
        ],
        endpoint: "POST wayfair.com/api/catalog/search",
        payload: { query: "sofa", merchant: "wayfair.com", deliver_to: "60643" },
      };
    case 1:
      return {
        tags: ["Citi Offers"],
        title: "Open Citi page with cart reference",
        summary: "Tapping Check offers opens Citi's page with a signed cart reference. The shopper signs in on Citi's page — the agent and retailer never see the credentials.",
        flow: ["Wayfair app", "Citi Offers", "Shopper sign in"],
        points: ["Signed cart reference: merchant, category, basket amount", "No card number or PII leaves Wayfair", "Sign in uses a Face ID passkey"],
        endpoint: "GET online.citi.com/offers/check?cart_ref=…",
        payload: c
          ? {
              cart_ref: c.cart_ref,
              merchant: "Wayfair",
              mcc: "5712 (Furniture)",
              basket_amount: c.totals.subtotal,
              items: c.line_items.map((l) => ({ sku: l.product.id, qty: l.quantity, clearance: l.product.clearance })),
              return_url: `wayfair://cart/${c.cart_ref}`,
              initiated_via: agent,
            }
          : {},
      };
    case 2:
      return {
        tags: ["Citi Offers", "Mastercard Offers"],
        title: ctx.activation ? "Offer activation recorded" : "Look up eligible offers",
        summary: "Citi asks Mastercard Offers which offers match this card and cart. If one matches, Citi shows the terms; tapping Activate records the activation with Mastercard.",
        flow: ["Citi Offers", "Mastercard Offers", "Citi Offers"],
        points: [
          "Retailer-wide statement credit pilot (Wayfair-funded)",
          "Eligibility: $500+ of non-clearance items",
          "No match → shopper sees “No matching offer”",
        ],
        endpoint: ctx.activation ? "POST /mastercard/offers/v1/activations" : "POST /mastercard/offers/v1/eligibility",
        payload: ctx.activation
          ? ctx.activation
          : ctx.lookup
            ? {
                request_id: ctx.lookup.mastercard_request_id,
                card: `${ctx.lookup.card.brand} ···· ${ctx.lookup.card.last4}`,
                matches: ctx.lookup.offer ? [{ id: ctx.lookup.offer.id, credit: ctx.lookup.offer.credit }] : [],
                reason: ctx.lookup.reason,
              }
            : { status: "looking up…" },
      };
    case 3:
      return {
        tags: ["Wayfair"],
        title: "Return to cart",
        summary: `Citi sends the shopper back to the Wayfair cart in either case. Checkout then completes with ${chatgpt ? "Apple Pay" : "Google Pay"} and the Citi card.`,
        flow: ["Citi Offers", "Wayfair cart", agent],
        points: ["Return URL carries only offer status", "Activation stays with Citi & Mastercard", "Biometric check, then Citi approves the payment"],
        endpoint: "POST wayfair.com/api/checkout/{cart_ref}/complete",
        payload: { cart_ref: c?.cart_ref, offer_status: ctx.activation ? "activated" : c?.offer_status ?? "no_match", wallet: chatgpt ? "apple_pay" : "google_pay" },
      };
    default:
      return {
        tags: ["Mastercard Offers"],
        title: "Order placed",
        summary: ctx.order?.offer_activated
          ? "When the Wayfair purchase clears, Mastercard matches it to the activation and Citi posts the statement credit."
          : "Order placed with no Citi offer. The purchase posts to the Citi card as usual.",
        flow: ["Wayfair", "Mastercard", "Citi statement"],
        points: ["Clearing record matched to activation", "Credit posts within 5 business days of shipping", "Visible in Agent Activity"],
        endpoint: "WEBHOOK offers.redemption.matched",
        payload: ctx.order ?? {},
      };
  }
}
