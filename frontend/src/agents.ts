export type AgentId = "chatgpt" | "gemini";

export type AgentConfig = {
  id: AgentId;
  name: string;
  merchant: string;
  wallet: "apple" | "google";
  walletName: string;
  storeLabel: string;
  subtitle: string;
  model: string;
  suggestions: string[];
};

export const AGENT_CONFIG: Record<AgentId, AgentConfig> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    merchant: "Wayfair",
    wallet: "apple",
    walletName: "Apple Pay",
    storeLabel: "Wayfair",
    subtitle: "ChatGPT → Wayfair → Citi Offers",
    model: "GPT-5.4",
    suggestions: [
      "I need a big sectional for my living room",
      "Show me a velvet sofa in a bold color",
      "Something small for my apartment, under $400",
    ],
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    merchant: "Wayfair",
    wallet: "google",
    walletName: "Google Pay",
    storeLabel: "Wayfair",
    subtitle: "Gemini → Wayfair → Citi Offers",
    model: "Gemini 3 Flash",
    suggestions: [
      "Help me find a leather sofa on sale",
      "What's a good sofa for a family of four?",
      "Show me a compact loveseat",
    ],
  },
};

export const agentFrom = (v?: string | string[]): AgentConfig =>
  AGENT_CONFIG[(Array.isArray(v) ? v[0] : v) as AgentId] ?? AGENT_CONFIG.chatgpt;
