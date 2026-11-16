# Citi Agentic Commerce — PRD

## Original problem
Build an iOS mobile app "Citi Agentic Commerce": a mock working prototype recreating the user's screenshots (ChatGPT → Instacart → Citi Face ID → Citi Authorize → Pay → Confirmed) based on agentic protocols ACP, UCP, Mastercard Agent Pay.

## User choices
Live AI chat · Simulated Face ID popup · Protocol panel per step · Agent Controls · Agent Activity history · Decline path

## Architecture
- Expo Router (iOS-first), screens: `/` home, `/journey` 6-step wizard, `/agents`, `/activity`
- FastAPI + MongoDB; LLM gpt-5.4 via Emergent LLM key (SSE streaming, `[[product:id]]` tag renders Instacart widget)
- Mock endpoints: ACP `/api/checkout_sessions` (+ `/complete`), Agent Pay `/api/agentpay/tokenize`, Citi `/api/citi/authorize` (enforces agent enabled/revoked + per-purchase limit), `/api/agents`, `/api/transactions`

## Implemented (Jun 2026)
- Biometric pay authorization on every checkout: wallet pay sheet (Face ID / fingerprint, simulated) → Citi-branded "Payment approval" → order placed (src/components/PayAuthSheet.tsx); auto-plays in Presenter Mode
- Presenter "Payment declined" scenario: velvet sofa, offer activated, Face ID passes but Citi declines (phone not registered), reason shown, declined txn logged via POST /api/carts/{ref}/decline
- Presenter controls: Replay (restart scenario), Back one step (replays previous step), Pause/Play, Skip (fire next auto-step now, via src/presenter.ts useSkipDelay), Exit
- Cleanup: removed ACP/UCP labels, badges and protocol fields everywhere; deleted /compare screen; Agent Activity history now Wayfair-only (no Walmart/Target)
- ChatGPT-style chat chrome (sidebar, app picker, composer) + Presenter Mode (auto-play offer / no-offer scenarios with commentary, pause/exit)
- App now opens straight into the ChatGPT chat surface (/ → /shop?agent=chatgpt); Citi hub moved to /home (grid icon); tap header to switch ChatGPT ↔ Gemini
- REPLACED journeys with "Citi offers during furniture shopping" (Wayfair): real ChatGPT (gpt-5.4) / Gemini (gemini-3-flash-preview) chat → Check Citi offers → Citi sign-in with cart ref → Mastercard Offers lookup → Activate or "No matching offer" → return to cart → place order. Eligibility: $500+ non-clearance (10% back, max $150). Citi logo removed. Route /shop; endpoints /api/carts, /api/citi/offers/lookup|activate, /api/carts/{ref}/place_order
- ChatGPT journey shops at Walmart (own catalog, Apple Pay); Gemini stays at Target (Google Pay)
- Replaced Instacart with Apple Pay (ChatGPT journey) and Google Pay (Gemini journey); Target is merchant for both
- Gemini journey (UCP + AP2 mandates, Target as merchant) alongside ChatGPT/ACP; /compare screen
- Multi-item cart: AI suggestions with Add, qty steppers, PATCH checkout session for items & tip
- Spending Insights on Agent Activity (month nav, by agent/merchant), seeded demo history
- Tested: iteration 3 pass (48/48 backend)
- Full 6-step journey matching screenshots, $49.61 total, 5x ThankYou points, Flex Pay / points options
- Protocol panel with flow, key points and mock JSON per step
- Decline path (user decline or limit/agent-revoked decline), stepper shows DECLINED
- Agent Controls (toggle, limit, revoke) and Agent Activity list
- Tested: iteration 1 & 2 pass

## Backlog
- P1: Multi-item cart / quantity editing, tip chips interactive
- P1: Gemini (UCP/AP2) & Perplexity alternate journeys
- P2: Revoke confirmation sheet, real Face ID option, presenter mode with auto-advance
