export type AgentId = "chatgpt" | "gemini";

export type AgentConfig = {
  id: AgentId;
  name: string;
  protocol: string;
  tags: string[];
  merchant: string;
  store: "walmart" | "target";
  wallet: "apple" | "google";
  walletName: string;
  storeLabel: string;
  subtitle: string;
  suggestions: string[];
};

export const AGENT_CONFIG: Record<AgentId, AgentConfig> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    protocol: "ACP",
    tags: ["ACP", "Agent Pay"],
    merchant: "Walmart",
    store: "walmart",
    wallet: "apple",
    walletName: "Apple Pay",
    storeLabel: "Walmart",
    subtitle: "ChatGPT → Walmart → Apple Pay → Citi",
    suggestions: [
      "Find me men's sandals in size 12 at Walmart",
      "Sandals and socks for a beach trip, size 12",
      "Add 2 packs of no-show socks too",
    ],
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    protocol: "UCP + AP2",
    tags: ["UCP", "AP2", "Agent Pay"],
    merchant: "Target",
    store: "target",
    wallet: "google",
    walletName: "Google Pay",
    storeLabel: "Target",
    subtitle: "Gemini → Target (UCP) → Google Pay → Citi",
    suggestions: [
      "Help me pack for the beach — sandals and swim shorts",
      "Find size 12 sandals in black at Target",
      "Add a 6-pack of socks to my cart",
    ],
  },
};

export const agentFrom = (v?: string | string[]): AgentConfig =>
  AGENT_CONFIG[(Array.isArray(v) ? v[0] : v) as AgentId] ?? AGENT_CONFIG.chatgpt;
