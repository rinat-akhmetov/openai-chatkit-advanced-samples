import { StartScreenPrompt } from "@openai/chatkit";

export const CHATKIT_API_URL =
  import.meta.env.VITE_CHATKIT_API_URL ?? "http://localhost:8000/api/chatkit/chatkit";


/**
 * ChatKit still expects a domain key at runtime. Use any placeholder locally,
 * but register your production domain at
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 * and deploy the real key.
 */
export const CHATKIT_API_DOMAIN_KEY =
  import.meta.env.VITE_CHATKIT_API_DOMAIN_KEY ?? "domain_pk_localhost_dev";

export const FACTS_API_URL = import.meta.env.VITE_FACTS_API_URL ?? "/facts";

/**
 * Channel code for multi-tenant thread isolation.
 * Required by the ChatKit backend for proper conversation scoping.
 */
export const CHATKIT_CHANNEL_CODE =
  import.meta.env.VITE_CHATKIT_CHANNEL_CODE ?? "ETP-clippy";

/**
 * Instance identifier for multi-tenant thread isolation.
 * Required by the ChatKit backend for proper conversation scoping.
 */
export const CHATKIT_INSTANCE =
  import.meta.env.VITE_CHATKIT_INSTANCE ?? "uk";

export const THEME_STORAGE_KEY = "chatkit-boilerplate-theme";

export const GREETING = "Welcome to the ChatKit Demo";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "Top earning trading partners",
    prompt: "who are my top earning trading partners give me YTD value",
    icon: "chart",
  },
  {
    label: "Create a rebate agreement",
    prompt: "How do I create a rebate agreement?",
    icon: "book-open",
  },
  {
    label: "Add a note to a SPA",
    prompt: "How to add a note to a SPA?",
    icon: "book-open",
  },
];

export const PLACEHOLDER_INPUT = "Share a fact about yourself";
