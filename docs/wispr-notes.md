# Wispr Flow: what is documented, and what VoiceArchitect builds on

Researched on 21 October 2026 from Wispr Flow's own help center and GitHub; the MCP section was re-checked and extended on 22 October 2026. Everything the app or README says about Wispr Flow must trace back to a line here.

## Documented behavior

### Dictation types into the focused text field

- Push to talk: hold the shortcut, speak, release. Hands-free: start and stop with a shortcut, or double-tap push to talk.
- Platform defaults: Mac push to talk is Fn and hands-free is Fn+Space; Windows push to talk is Ctrl+Win and hands-free is Ctrl+Win+Space. New setups may start push to talk on Caps Lock.
- Shortcuts are customizable, saved per device, and do not sync between devices. The app therefore never names a specific key; it says "your Wispr Flow hotkey".
- Source: [Supported and unsupported keyboard hotkey shortcuts](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts)

### Backtrack and Smart Formatting

- "Backtrack removes filler words, false starts, and self-corrections." Example: "Let's do coffee at 2 actually 3" becomes "Let's do coffee at 3." Only clear corrections are removed.
- Flow handles most punctuation and turns spoken sequences ("first… second…") into lists.
- Source: [How do I use Smart Formatting & Backtrack](https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack)

### Command Mode edits the focused text box

- "Command Mode lets you edit text, draft a reply, or search by voice." It is off by default (Settings → Experimental), triggered by its own shortcut (defaults Fn+Ctrl on Mac, Ctrl+Win+Alt on Windows), and "sends your current text box contents and selected text with your instruction."
- It needs a paid plan or unexpired trial: "Free and lapsed accounts get no response or notification."
- Source: [How to use Command Mode](https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode)

### Dictionary

- "Add names, technical terms, or jargon to your dictionary so Flow recognizes them." Words can be added by hand, learned automatically when "auto-learn words" is on, or imported on Mac and Windows "from a file of up to 3MB and 1,000 items."
- The import file format is not stated in the documentation.
- Source: [Teach Flow your words with the dictionary](https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary)

### Languages, including Hinglish

- "Flow supports 100+ languages, including हिन्दी, Hinglish, Español, …" and recommends "selecting your preferred language(s) in Settings and using one language per dictation."
- Source: [Wispr Flow India](https://wisprflow.ai/india)

### MCP server (read-only)

- Server URL `https://api.wisprflow.ai/connect/mcp`, browser sign-in with a Wispr Flow account, no API key. "Authorization is account-wide and includes existing content, with no per-meeting consent and no API key or token."
- Read-only: clients "cannot create, edit, share or delete content." "Clients can read meeting summaries, notes, transcripts, attendees and tasks; Scratchpad notes;" plus calendar events. Clients cannot "read dictation history or Notetaker chat history."
- "Requires Notetaker and MCP access on your Wispr Flow account." Supported on Mac and Windows. "If Flow prompts you to enable Cloud Sync, follow the prompt if unlocked." "Scratchpad access over MCP has no Cloud Sync requirement."
- "An active personal or organization BAA blocks every MCP feature." "Disabling MCP blocks every MCP feature, including for already-authorized clients."
- "With email-and-password sign-in, the login page must return you to authorization to finish connecting."
- For "Too many requests": "Pause repeated queries, wait about a minute, then retry."
- Error texts it lists include "Cloud Sync must be enabled to use this feature.", "This feature is not available for HIPAA-covered accounts.", "MCP access has been disabled by your organization's administrator.", and "Too many requests".
- Sources: [Connect Claude, ChatGPT or another MCP client to Wispr Flow](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server) (read 21 and 22 October 2026), [Wispr-AI/wispr-flow-plugin](https://github.com/Wispr-AI/wispr-flow-plugin)

### MCP sign-in metadata (fetched 22 October 2026)

- [`https://api.wisprflow.ai/.well-known/oauth-protected-resource`](https://api.wisprflow.ai/.well-known/oauth-protected-resource) (OAuth protected resource metadata, RFC 9728): resource `https://api.wisprflow.ai/connect/mcp`, authorization server `https://mcp-auth.wisprflow.com`, scopes `openid` and `offline_access`, bearer tokens in the header.
- [`https://mcp-auth.wisprflow.com/.well-known/oauth-authorization-server`](https://mcp-auth.wisprflow.com/.well-known/oauth-authorization-server) (RFC 8414): authorization, token, and registration endpoints under `/oauth2/`, `code_challenge_methods_supported: ["S256"]`, grant types `authorization_code` and `refresh_token` (and device code), and `token_endpoint_auth_methods_supported` including `none`, so a public client can register itself.
- These are machine-readable documents, not prose documentation. The help article describes connecting AI clients such as Claude and ChatGPT and does not mention other web apps.

## What VoiceArchitect builds on

| Wispr Flow feature | How the app uses it | Code needed |
| --- | --- | --- |
| Dictation into the focused field | The instruction box is a plain, focusable text area. Hold your Wispr Flow hotkey and speak; the text lands there. | None. It is a normal text field. |
| Hinglish | The interpretation prompt accepts English, Hindi, and Hinglish, and the offline rules understand common Hinglish verbs. | Prompt and rules. |
| Backtrack | Flow already removes fillers and self-corrections. The app's own cleanup only normalizes product names ("post gres" → PostgreSQL) and spoken casing, which also helps text from other dictation tools. | Pure functions, unit-tested. |
| Command Mode | Select the instruction in the box and say "make it Postgres instead"; Flow rewrites the text in place before you preview. Needs a paid plan or trial. | None. |
| Dictionary | The app can copy the loaded model's component and technology names, so you can add them to your Flow dictionary by hand. It does not claim a ready-to-import file, because the format is undocumented. | A copy button. |
| MCP server | **Import from Wispr Flow** acts as a standard MCP client. The server reads the two metadata documents above at run time, registers itself, signs in with the authorization code flow and PKCE S256 (with the MCP URL as `resource`), seals the sign-in and its tokens into an AES-256-GCM, HttpOnly cookie that only the server can open (so it survives restarts), refreshes an expired access token with the same resource, and over Streamable HTTP calls `initialize`, `tools/list`, then `tools/call`, choosing tools from what `tools/list` returns. It reads only a meeting summary or a Scratchpad note the person picks, and skips any tool about transcripts or dictation. The text goes to the model as quoted, untrusted data, and the result is reviewed like any proposal. Error messages follow the help article above. **Tested against mocks only; not yet verified with a real Wispr Flow sign-in.** | `server/wisprMcp.ts`, `src/components/WisprImportDialog.jsx`, `tests/wispr.test.js`. |

## Not built, and why

- **No Wispr API in the browser.** Wispr Flow has no documented API for a web page to start dictation or read transcripts. The browser microphone button uses the Web Speech API and is labelled as a fallback, not as Wispr.
- **No dictation through MCP.** The MCP server does not expose dictation history, so the import reads meeting summaries and Scratchpad notes only. Dictating instructions still happens through Flow typing into the focused field.
- **Corrected on 22 October 2026.** An earlier version of these notes said an MCP connection from the app was not possible because Wispr documents no OAuth handling for third-party web apps. The published metadata above (dynamic registration, public clients, PKCE S256) is enough for a standard MCP client, so the import is now built. What remains unverified is a real sign-in end to end.
- **No dictionary file export.** The import format is not documented, so the app copies a plain word list for manual entry instead of producing a file that might not import.
