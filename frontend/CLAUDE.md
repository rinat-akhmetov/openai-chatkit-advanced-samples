# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the frontend component of the OpenAI ChatKit Advanced Samples project. It's a Vite + React application that demonstrates ChatKit UI integration with client tools, widgets, and theme switching capabilities. The app wraps the `@openai/chatkit-react` component in a simple fact-recording UI.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://127.0.0.1:5170)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint TypeScript/React files
npm run lint
```

### Running from Repository Root

From the parent directory (`openai-chatkit-advanced-samples`):
```bash
npm run frontend    # Start frontend only
npm run backend     # Start backend only (requires uv)
npm start           # Start both frontend and backend together
```

## Architecture

### Core Components Structure

- **`src/main.tsx`**: Application entry point, renders the root `<App />` component
- **`src/App.tsx`**: Top-level component managing theme state via `useColorScheme` hook
- **`src/components/Home.tsx`**: Main layout with ChatKit panel and fact list
- **`src/components/ChatKitPanel.tsx`**: ChatKit integration with client tool handlers (`switch_theme`, `record_fact`)
- **`src/components/FactCard.tsx`**: Individual fact display component
- **`src/components/ThemeToggle.tsx`**: Manual theme switcher UI

### State Management Pattern

The app uses React hooks for state management:
- **`useFacts`** (src/hooks/useFacts.ts): In-memory fact storage with save/discard actions
- **`useColorScheme`** (src/hooks/useColorScheme.ts): Theme persistence to localStorage

Facts are stored in-memory only; no backend persistence.

### ChatKit Integration

ChatKit configuration in `src/components/ChatKitPanel.tsx` includes:

1. **Client Tools**: Tools executed in the browser without backend roundtrip
   - `switch_theme`: Changes light/dark theme
   - `record_fact`: Saves fact to in-memory state

2. **Event Handlers**:
   - `onClientTool`: Handles client-side tool invocations
   - `onResponseEnd`: Triggers fact list refresh
   - `onThreadChange`: Clears processed fact IDs
   - `onError`: Logs ChatKit errors

3. **Theming**: ChatKit theme is synchronized with app-level color scheme via `useColorScheme`

### Backend Communication

- Vite dev server (port 5170) proxies `/chatkit` and `/facts` routes to FastAPI backend (default: `http://127.0.0.1:8000`)
- Proxy configuration in `vite.config.ts:12-20`
- Backend must be running for ChatKit to function (see repository root README for setup)

### Configuration

Primary configuration in `src/lib/config.ts`:
- `CHATKIT_API_URL`: Backend ChatKit endpoint (default: `http://localhost:8000/api/chatkit/chatkit`)
- `CHATKIT_API_DOMAIN_KEY`: Domain key for production (use placeholder locally: `domain_pk_localhost_dev`)
- `FACTS_API_URL`: Facts API endpoint (default: `/facts`)
- `STARTER_PROMPTS`: ChatKit start screen prompts
- `GREETING`: ChatKit greeting message

Override via environment variables:
- `VITE_CHATKIT_API_URL`
- `VITE_CHATKIT_API_DOMAIN_KEY`
- `VITE_FACTS_API_URL`

Restart `npm run dev` after changing environment variables.

### Styling

- **Tailwind CSS**: Configured in `src/index.css` with custom color palette
- **Theme System**: Light/dark mode via `useColorScheme` hook persisted to localStorage key `chatkit-boilerplate-theme`
- **ChatKit Theming**: Synchronized with app theme via grayscale/accent color configuration

## Production Deployment

For remote access:

1. Host frontend on managed infrastructure behind a custom domain
2. Register domain at [OpenAI domain allowlist](https://platform.openai.com/settings/organization/security/domain-allowlist)
3. Add domain to `vite.config.ts` `server.allowedHosts` array (line 23-27)
4. Set `VITE_CHATKIT_API_DOMAIN_KEY` environment variable to the key from step 2

Local development works without domain registration (uses placeholder key).

## Technology Stack

- **React 19.2**: UI framework
- **Vite 7.1**: Build tool and dev server
- **TypeScript 5.4**: Type safety
- **Tailwind CSS 3.4**: Utility-first styling
- **@openai/chatkit-react**: OpenAI ChatKit component library
- **ESLint 8**: Code quality with TypeScript and React hooks plugins

## Key Files to Modify

- **Starter prompts**: `src/lib/config.ts:22-38` (STARTER_PROMPTS array)
- **ChatKit client tools**: `src/components/ChatKitPanel.tsx:55-84` (onClientTool handler)
- **Fact actions**: `src/hooks/useFacts.ts:16-37` (performAction callback)
- **Theme colors**: `src/lib/config.ts` and ChatKit theme config in `ChatKitPanel.tsx:30-44`
- **Proxy routes**: `vite.config.ts:12-20`

## Notes

- Backend agent instructions are in `backend/app/constants.py` (not in frontend)
- Facts are transient (in-memory only); implement backend persistence if needed
- ChatKit handles error display to users; `onError` is primarily for logging
- Use `import.meta.env.DEV` for development-only console logging
