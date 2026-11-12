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

export function getProtocol(agentId: string, step: number, ctx: ProtocolCtx): ProtocolInfo {
  return agentId === "gemini" ? ucpProtocol(step, ctx) : acpProtocol(step, ctx);
}

export const stepLabels = (agentName: string) => [agentName, ...STEPS.slice(1)];

export const COMPARISON: { stage: string; acp: string; ucp: string; agentPay: string }[] = [
  {
    stage: "Discovery",
    acp: "Merchant product feed shown as a Walmart checkout widget inside ChatGPT; Apple Pay on iOS.",
    ucp: "Agent calls the merchant's UCP catalog capability directly (Target).",
    agentPay: "Not involved.",
  },
  {
    stage: "Cart & checkout",
    acp: "POST /checkout_sessions, then update for items & tip. Merchant of record: Walmart.",
    ucp: "UCP checkout-session capability; cart negotiated against Target's UCP profile.",
    agentPay: "Card enrolled once as a tokenized credential.",
  },
  {
    stage: "User consent",
    acp: "Implicit — user taps Checkout/Pay in the merchant widget.",
    ucp: "AP2 Intent Mandate (from prompt) and Cart Mandate (signed by the user's device key).",
    agentPay: "Issuer passkey / Face ID verifies the cardholder.",
  },
  {
    stage: "Payment credential",
    acp: "Apple Pay device token (DPAN) wrapped in an ACP delegated, scoped payment token.",
    ucp: "Google Pay token via Target's UCP payment handler; Citi (Credentials Provider) releases it with a Payment Mandate.",
    agentPay: "Single-use agentic token bound to agent + merchant + amount.",
  },
  {
    stage: "Issuer visibility",
    acp: "Network agent indicator on the authorization.",
    ucp: "Payment Mandate gives Citi proof of human presence & cart contents.",
    agentPay: "Registered agent ID & cryptogram on every authorization.",
  },
  {
    stage: "Completion",
    acp: "POST /checkout_sessions/{id}/complete → order webhook to ChatGPT.",
    ucp: "UCP complete-checkout → order capability updates back to Gemini.",
    agentPay: "Settles like any card transaction; points & Flex Pay apply.",
  },
];

function ucpProtocol(step: number, ctx: ProtocolCtx): ProtocolInfo {
  const s = ctx.session;
  const total = s?.totals.total ?? 0;
  const items = s?.line_items.map((l) => ({ sku: l.product.id, qty: l.quantity, price: l.product.price })) ?? [];
  switch (step) {
    case 0:
      return {
        tags: ["UCP", "AP2"],
        title: "Discovery & Intent Mandate",
        summary: "Gemini calls Target's UCP catalog directly (no intermediary app). Your request becomes an AP2 Intent Mandate describing what you asked the agent to buy.",
        flow: ["You", "Gemini", "Target UCP"],
        points: [
          "UCP profile: /.well-known/ucp lists Target's capabilities",
          "dev.ucp.shopping.catalog.search returns live inventory",
          "AP2 Intent Mandate records your natural-language request",
        ],
        endpoint: "POST target.com/ucp/v1/catalog/search",
        payload: {
          intent_mandate: {
            natural_language_description: "Size 12 sandals for a beach trip",
            merchants: ["target.com"],
            requires_refundability: true,
            user_cart_confirmation_required: true,
            intent_expiry: "+1h",
          },
        },
      };
    case 1:
      return {
        tags: ["UCP", "AP2"],
        title: "UCP checkout session",
        summary: "Gemini creates a checkout session using Target's UCP checkout capability. Citi is the AP2 Credentials Provider, so the card shown is a reference, not a card number.",
        flow: ["Gemini", "Target UCP", "Citi (Credentials Provider)"],
        points: [
          "dev.ucp.shopping.checkout.create with line items",
          "Payment handler: Mastercard Agent Pay via Citi",
          "Target is merchant of record; Google Pay is the wallet",
        ],
        endpoint: "POST target.com/ucp/v1/checkout-sessions",
        payload: s
          ? { id: s.id, status: s.status, line_items: items, totals: s.totals, payment: { handlers: ["citi.ap2.credentials", "mastercard.agentpay"] } }
          : { status: "creating..." },
      };
    case 2:
      return {
        tags: ["AP2", "Agent Pay"],
        title: "User presence proof",
        summary: "Face ID unlocks the device key that will sign the AP2 Cart Mandate — cryptographic proof a human approved this exact cart.",
        flow: ["Citi app", "Device key", "Citi"],
        points: ["Human-present transaction", "Device-bound passkey (FIDO2)", "Key signs the Cart Mandate next"],
        endpoint: "POST /citi/auth/passkey/assert",
        payload: { rp_id: "online.citi.com", user_verification: "required", purpose: "ap2.cart_mandate.sign", checkout: s?.id },
      };
    case 3:
      return {
        tags: ["AP2", "Agent Pay"],
        title: "Cart & Payment Mandates",
        summary: "Approving signs the AP2 Cart Mandate. Citi then issues a Mastercard agentic token and a Payment Mandate that tells the network an AI agent is transacting with your consent.",
        flow: ["You", "Cart Mandate", "Citi", "Payment Mandate"],
        points: ["Cart Mandate locks items, price & merchant", "Payment Mandate shared with network/issuer", "Agent spending limits enforced"],
        endpoint: "POST /ap2/mandates/cart",
        payload: {
          cart_mandate: { merchant: "target.com", items, total: { value: total, currency: "USD" }, user_signature: "pending" },
          payment_mandate: ctx.token
            ? { credential: ctx.token.agentic_token, agent_presence: true, human_present: true }
            : "issued after approval",
        },
      };
    case 4:
      return {
        tags: ["UCP", "AP2"],
        title: "Complete UCP checkout",
        summary: "Gemini completes the UCP session with the Citi-issued credential and Payment Mandate; Target authorizes on the Mastercard network.",
        flow: ["Gemini", "Target UCP", "Mastercard", "Citi"],
        points: ["dev.ucp.shopping.checkout.complete", "Payment Mandate attached for dispute evidence", "Points or Flex Pay applied by Citi"],
        endpoint: `POST target.com/ucp/v1/checkout-sessions/${s?.id ?? "{id}"}/complete`,
        payload: {
          payment: { handler: "mastercard.agentpay", token: ctx.token?.agentic_token ?? "mc_atk_…", cryptogram: ctx.token?.cryptogram ?? "…" },
          ap2_payment_mandate_id: `pm_${s?.id?.slice(3, 11) ?? "…"}`,
          citi_auth_code: ctx.txn?.auth_code ?? null,
        },
      };
    default:
      return ctx.declined
        ? {
            tags: ["UCP", "AP2"],
            title: "Mandate rejected",
            summary: "No Cart Mandate signature and no credential were released. The UCP checkout is canceled and Gemini is told why.",
            flow: ["Citi", "Gemini", "Target UCP"],
            points: ["Nothing sent to Target's payment handler", "Decline reason returned to agent", "Logged in Agent Activity"],
            endpoint: "POST target.com/ucp/v1/checkout-sessions/{id}/cancel",
            payload: { id: s?.id, status: "canceled", reason: ctx.txn?.reason ?? "declined" },
          }
        : {
            tags: ["UCP"],
            title: "Order confirmed",
            summary: "Target's UCP order capability pushes status updates to Gemini; Citi posts the transaction with Gemini as initiator.",
            flow: ["Target UCP", "Gemini", "Citi"],
            points: ["dev.ucp.shopping.order updates", "Mandates retained for disputes", "Visible in Agent Activity"],
            endpoint: "WEBHOOK dev.ucp.shopping.order.created",
            payload: { order: ctx.order ?? {} },
          };
  }
}

function acpProtocol(step: number, ctx: ProtocolCtx): ProtocolInfo {
  const s = ctx.session;
  const total = s?.totals.total ?? 49.61;
  switch (step) {
    case 0:
      return {
        tags: ["ACP"],
        title: "Product discovery",
        summary: "ChatGPT reads Walmart's ACP product feed, then renders a Walmart checkout widget inside the chat with Apple Pay as the payment method.",
        flow: ["You", "ChatGPT", "Walmart feed"],
        points: [
          "ACP product feed: merchant-supplied catalog indexed by ChatGPT",
          "Feed supplies price, availability and fees",
          "Citi card benefit (5x points) is surfaced before checkout",
        ],
        endpoint: "GET /acp/product_feed?merchant=walmart.com",
        payload: {
          query: "men's leather sandals size 12",
          merchant: "walmart.com",
          filters: { size: "12", in_stock: true },
          context: { delivery_zip: "60643", agent: "chatgpt" },
        },
      };
    case 1:
      return {
        tags: ["ACP", "Apple Pay", "Agent Pay"],
        title: "Create checkout session",
        summary: "The agent opens an ACP checkout session with Walmart. The Apple Pay sheet offers your Citi Mastercard ending 4680 as a device token — the card number is never shared with ChatGPT or Walmart.",
        flow: ["ChatGPT", "Walmart", "Apple Pay", "Mastercard"],
        points: [
          "ACP: POST /checkout_sessions returns line items & totals",
          "Apple Pay: Citi card provisioned as a device-specific token (DPAN)",
          "Walmart stays merchant-of-record",
        ],
        endpoint: "POST /acp/checkout_sessions",
        payload: s
          ? {
              id: s.id,
              status: s.status,
              line_items: s.line_items.map((l) => ({ id: l.product.id, title: l.product.name, quantity: l.quantity, unit_price: l.product.price })),
              fulfillment: s.fulfillment,
              totals: s.totals,
              payment_provider: { provider: "apple_pay", network: "mastercard", agentic: "mastercard_agent_pay" },
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
        tags: ["Agent Pay"],
        title: "Issuer authorization",
        summary: "Citi shows the full purchase context — merchant, agent, item, amount. Approving signs an intent mandate and issues a single-use Mastercard agentic token scoped to this purchase.",
        flow: ["Citi", "Mastercard", "Agentic token", "ChatGPT"],
        points: [
          "Token bound to agent + merchant + max amount",
          "Citi records your approval for this exact cart & amount",
          "Agent spending limits from Agent Controls are enforced",
        ],
        endpoint: "POST /mastercard/agentpay/tokens",
        payload: ctx.token ?? {
          agent_id: s?.agent_id ?? "chatgpt",
          mandate: {
            type: "CartMandate",
            merchant: s?.merchant ?? "Walmart",
            items: [s?.summary ?? "Size 12 Sandals"],
            amount: { value: total, currency: "USD" },
            user_authorization: "pending",
          },
        },
      };
    case 4:
      return {
        tags: ["ACP", "Apple Pay", "Agent Pay"],
        title: "Complete checkout",
        summary: "You confirm in the Apple Pay sheet. ChatGPT completes the ACP session with Walmart using the Apple Pay token plus the Agent Pay cryptogram; the authorization travels the Mastercard network flagged as agent-initiated.",
        flow: ["Apple Pay", "ChatGPT", "Walmart", "Mastercard", "Citi"],
        points: [
          "ACP: POST /checkout_sessions/{id}/complete",
          "Apple Pay payment token + agent indicator & cryptogram",
          "Citi applies 5x ThankYou Points or Flex Pay",
        ],
        endpoint: `POST /acp/checkout_sessions/${s?.id ?? "{id}"}/complete`,
        payload: {
          payment_data: {
            wallet: "apple_pay",
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
            flow: ["Citi", "Mastercard", "Walmart", "ChatGPT"],
            points: ["No card data or token exposed", "Decline reason returned to agent", "Logged in Agent Activity"],
            endpoint: "POST /acp/checkout_sessions/{id}/cancel",
            payload: { id: s?.id, status: "canceled", reason: ctx.txn?.reason ?? "declined" },
          }
        : {
            tags: ["ACP"],
            title: "Order confirmed",
            summary: "Walmart emits an ACP order webhook to ChatGPT; Citi posts the Apple Pay transaction with the agent shown as initiator.",
            flow: ["Walmart", "ChatGPT", "Citi"],
            points: ["ACP webhook: order.created", "Points posted to ThankYou account", "Visible in Agent Activity"],
            endpoint: "WEBHOOK order.created",
            payload: { type: "order.created", data: ctx.order ?? {} },
          };
  }
}
