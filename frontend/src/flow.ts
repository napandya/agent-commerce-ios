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
    id: "acp",
    name: "ACP",
    full: "Agentic Commerce Protocol",
    by: "OpenAI + Stripe",
    body: "Lets ChatGPT run a retailer's app and checkout session (here Wayfair) inside the chat, with a scoped payment token.",
  },
  {
    id: "ucp",
    name: "UCP",
    full: "Universal Commerce Protocol",
    by: "Google + retailers",
    body: "Common language Gemini uses to search a retailer's catalog, build a cart and check out directly with the merchant.",
  },
  {
    id: "mco",
    name: "Offers",
    full: "Mastercard Offers",
    by: "Mastercard + Citi",
    body: "Merchant-funded card offers. Citi looks up matches for a cart, records activation, and the statement credit posts when the purchase clears.",
  },
];

export const COMPARISON: { stage: string; acp: string; ucp: string; offers: string }[] = [
  {
    stage: "Shop for the sofa",
    acp: "Wayfair app runs inside ChatGPT; products come from Wayfair's ACP product feed.",
    ucp: "Gemini calls Wayfair's UCP catalog capability directly.",
    offers: "Not involved yet.",
  },
  {
    stage: "Check offers",
    acp: "Wayfair cart widget opens the Citi page with a signed cart reference.",
    ucp: "UCP cart includes a link-out to the Citi page with the same cart reference.",
    offers: "Cart reference carries merchant, category and basket amount only — no card data.",
  },
  {
    stage: "Sign in",
    acp: "Shopper signs in on Citi's page, outside ChatGPT.",
    ucp: "Shopper signs in on Citi's page, outside Gemini.",
    offers: "Citi identifies which Citi cards the shopper holds.",
  },
  {
    stage: "Look up & activate",
    acp: "Agent never sees offer terms until the shopper returns.",
    ucp: "Agent never sees offer terms until the shopper returns.",
    offers: "Citi queries Mastercard Offers; activation is recorded against the card.",
  },
  {
    stage: "Return & place order",
    acp: "ACP checkout completes with Apple Pay.",
    ucp: "UCP checkout completes with Google Pay.",
    offers: "Mastercard matches the cleared purchase to the activation; Citi posts the credit.",
  },
];

export function getProtocol(agentId: string, step: number, ctx: ProtocolCtx): ProtocolInfo {
  const acp = agentId !== "gemini";
  const proto = acp ? "ACP" : "UCP";
  const agent = acp ? "ChatGPT" : "Gemini";
  const c = ctx.cart;
  switch (step) {
    case 0:
      return {
        tags: [proto],
        title: "Shop the retailer catalog",
        summary: acp
          ? "ChatGPT runs the Wayfair app via ACP: it reads Wayfair's product feed and shows a Wayfair cart widget in the chat."
          : "Gemini searches Wayfair's catalog through UCP and builds a cart directly with the merchant.",
        flow: ["Shopper", agent, "Wayfair"],
        points: [
          acp ? "ACP product feed: price, availability, delivery" : "UCP capability: dev.ucp.shopping.catalog.search",
          "Cart lives with Wayfair (merchant of record)",
          "Agent can't quote Citi offers — only Citi can",
        ],
        endpoint: acp ? "GET /acp/product_feed?merchant=wayfair.com" : "POST wayfair.com/ucp/v1/catalog/search",
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
        tags: [proto],
        title: "Return to cart",
        summary: `Citi sends the shopper back to the Wayfair cart in either case. The checkout then completes through ${proto} with ${acp ? "Apple Pay" : "Google Pay"} and the Citi card.`,
        flow: ["Citi Offers", "Wayfair cart", agent],
        points: ["Return URL carries only offer status", "Activation stays with Citi & Mastercard", `${proto} checkout completes the order`],
        endpoint: acp ? "POST /acp/checkout_sessions/{id}/complete" : "POST wayfair.com/ucp/v1/checkout-sessions/{id}/complete",
        payload: { cart_ref: c?.cart_ref, offer_status: ctx.activation ? "activated" : c?.offer_status ?? "no_match", wallet: acp ? "apple_pay" : "google_pay" },
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
