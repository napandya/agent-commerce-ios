import type { AgentToken, CheckoutSession, Order, Txn } from "./api";

export type ProtocolCtx = {
  session?: CheckoutSession | null;
  token?: AgentToken | null;
  txn?: Txn | null;
  order?: Order | null;
  declined?: boolean;
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

export const STEPS = ["ChatGPT", "Payment", "Face ID", "Authorize", "Pay", "Confirmed"];

export const PROTOCOL_OVERVIEW = [
  {
    id: "acp",
    name: "ACP",
    full: "Agentic Commerce Protocol",
    by: "OpenAI + Stripe",
    body: "Open standard letting AI agents like ChatGPT create, update and complete checkout sessions with merchants, using a delegated, scoped payment token.",
  },
  {
    id: "ucp",
    name: "UCP",
    full: "Universal Commerce Protocol",
    by: "Google + retailers",
    body: "Common language for discovery, cart, checkout and order management across agents and merchants; pairs with AP2 signed mandates proving user intent.",
  },
  {
    id: "agentpay",
    name: "Agent Pay",
    full: "Mastercard Agent Pay",
    by: "Mastercard + issuers",
    body: "Registers trusted agents and issues agentic tokens bound to the agent, merchant and amount, so issuers like Citi can see and approve agent-initiated payments.",
  },
];

export function getProtocol(step: number, ctx: ProtocolCtx): ProtocolInfo {
  const s = ctx.session;
  const total = s?.totals.total ?? 49.61;
  switch (step) {
    case 0:
      return {
        tags: ["UCP", "ACP"],
        title: "Product discovery",
        summary: "ChatGPT queries Instacart's merchant product feed for Target inventory, then renders an Instacart app widget inside the chat.",
        flow: ["You", "ChatGPT", "Instacart", "Target feed"],
        points: [
          "UCP capability: dev.ucp.shopping.catalog.search",
          "ACP product feed supplies price, availability and fees",
          "Citi card benefit (5x points) is surfaced before checkout",
        ],
        endpoint: "POST /ucp/v1/catalog/search",
        payload: {
          query: "men's leather sandals size 12",
          merchant: "target.instacart",
          filters: { size: "12", in_stock: true },
          context: { delivery_zip: "60643", agent: "chatgpt" },
        },
      };
    case 1:
      return {
        tags: ["ACP", "Agent Pay"],
        title: "Create checkout session",
        summary: "The agent opens an ACP checkout session with Instacart. Instacart pre-populates your enrolled Citi Mastercard ending 4680 — the card number is never shared with the agent.",
        flow: ["ChatGPT", "Instacart", "Mastercard"],
        points: [
          "ACP: POST /checkout_sessions returns line items & totals",
          "Agent Pay: card is enrolled once as a tokenized credential",
          "Merchant stays merchant-of-record",
        ],
        endpoint: "POST /acp/checkout_sessions",
        payload: s
          ? {
              id: s.id,
              status: s.status,
              line_items: [{ id: s.product.id, title: s.product.name, quantity: s.quantity, unit_price: s.product.price }],
              fulfillment: s.fulfillment,
              totals: s.totals,
              payment_provider: { provider: "mastercard_agent_pay", supported_methods: ["card"] },
            }
          : { status: "creating..." },
      };
    case 2:
      return {
        tags: ["Agent Pay"],
        title: "Consumer verification",
        summary: "Citi verifies it's really you with a device-bound passkey (Face ID). Mastercard Agent Pay requires cardholder authentication before an agentic token can be issued.",
        flow: ["Citi app", "Passkey / Face ID", "Citi issuer"],
        points: [
          "FIDO2 / WebAuthn assertion, biometrics never leave the device",
          "Links the agent request to an authenticated cardholder",
          "Replaces OTPs and step-up challenges",
        ],
        endpoint: "POST /citi/auth/passkey/assert",
        payload: {
          rp_id: "online.citi.com",
          user_handle: "Pjvaughan",
          authenticator: "platform (Face ID)",
          user_verification: "required",
          challenge_for: s?.id ?? "cs_…",
        },
      };
    case 3:
      return {
        tags: ["Agent Pay", "UCP · AP2"],
        title: "Issuer authorization & mandate",
        summary: "Citi shows the full purchase context — merchant, agent, item, amount. Approving signs an intent mandate and issues a single-use Mastercard agentic token scoped to this purchase.",
        flow: ["Citi", "Mastercard", "Agentic token", "ChatGPT"],
        points: [
          "Token bound to agent + merchant + max amount",
          "AP2 Cart Mandate: signed proof of what you approved",
          "Agent spending limits from Agent Controls are enforced",
        ],
        endpoint: "POST /mastercard/agentpay/tokens",
        payload: ctx.token ?? {
          agent_id: s?.agent_id ?? "chatgpt",
          mandate: {
            type: "CartMandate",
            merchant: s?.merchant ?? "Target via Instacart",
            items: [s?.product.short ?? "Size 12 Sandals"],
            amount: { value: total, currency: "USD" },
            user_authorization: "pending",
          },
        },
      };
    case 4:
      return {
        tags: ["ACP", "Agent Pay"],
        title: "Complete checkout",
        summary: "ChatGPT returns to Instacart with the shared payment token. Instacart completes the ACP session; the authorization travels the Mastercard network flagged as agent-initiated.",
        flow: ["ChatGPT", "Instacart", "Mastercard", "Citi"],
        points: [
          "ACP: POST /checkout_sessions/{id}/complete",
          "Network message carries the agent indicator & cryptogram",
          "Citi applies 5x ThankYou Points or Flex Pay",
        ],
        endpoint: `POST /acp/checkout_sessions/${s?.id ?? "{id}"}/complete`,
        payload: {
          payment_data: {
            token: ctx.token?.agentic_token ?? "mc_atk_…",
            provider: "mastercard_agent_pay",
            cryptogram: ctx.token?.cryptogram ?? "…",
          },
          citi_auth_code: ctx.txn?.auth_code ?? null,
          amount: total,
        },
      };
    default:
      return ctx.declined
        ? {
            tags: ["ACP", "Agent Pay"],
            title: "Session canceled",
            summary: "Citi declined the agent request. No token was issued, the ACP checkout session is canceled, and ChatGPT is notified so it can tell you.",
            flow: ["Citi", "Mastercard", "Instacart", "ChatGPT"],
            points: ["No card data or token exposed", "Decline reason returned to agent", "Logged in Agent Activity"],
            endpoint: "POST /acp/checkout_sessions/{id}/cancel",
            payload: { id: s?.id, status: "canceled", reason: ctx.txn?.reason ?? "declined" },
          }
        : {
            tags: ["ACP"],
            title: "Order confirmed",
            summary: "Instacart emits an ACP order webhook to ChatGPT; Citi posts the transaction with the agent shown as initiator.",
            flow: ["Instacart", "ChatGPT", "Citi"],
            points: ["ACP webhook: order.created", "Points posted to ThankYou account", "Visible in Agent Activity"],
            endpoint: "WEBHOOK order.created",
            payload: { type: "order.created", data: ctx.order ?? {} },
          };
  }
}
