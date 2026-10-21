# Wispr Flow: what is documented, and what VoiceArchitect builds on

Researched on 21 October 2026 from Wispr Flow's own help center and GitHub. Everything the app or README says about Wispr Flow must trace back to a line here.

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

### MCP server (read-only, for AI clients)

- Server URL `https://api.wisprflow.ai/connect/mcp`, browser sign-in with a Wispr Flow account, no API key.
- Read-only. It exposes meeting summaries, notes, transcripts, attendees and tasks, Scratchpad notes, and calendar events. Clients cannot "read dictation history or Notetaker chat history."
- Requires Notetaker and MCP access on the account. Supported on Mac and Windows.
- Sources: [Connect Claude, ChatGPT or another MCP client to Wispr Flow](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server), [Wispr-AI/wispr-flow-plugin](https://github.com/Wispr-AI/wispr-flow-plugin)

## What VoiceArchitect builds on

| Wispr Flow feature | How the app uses it | Code needed |
| --- | --- | --- |
| Dictation into the focused field | The instruction box is a plain, focusable text area. Hold your Wispr Flow hotkey and speak; the text lands there. | None. It is a normal text field. |
| Hinglish | The interpretation prompt accepts English, Hindi, and Hinglish, and the offline rules understand common Hinglish verbs. | Prompt and rules. |
| Backtrack | Flow already removes fillers and self-corrections. The app's own cleanup only normalizes product names ("post gres" → PostgreSQL) and spoken casing, which also helps text from other dictation tools. | Pure functions, unit-tested. |
| Command Mode | Select the instruction in the box and say "make it Postgres instead"; Flow rewrites the text in place before you preview. Needs a paid plan or trial. | None. |
| Dictionary | The app can copy the loaded model's component and technology names, so you can add them to your Flow dictionary by hand. It does not claim a ready-to-import file, because the format is undocumented. | A copy button. |

## Not built, and why

- **No Wispr API in the browser.** Wispr Flow has no documented API for a web page to start dictation or read transcripts. The browser microphone button uses the Web Speech API and is labelled as a fallback, not as Wispr.
- **No MCP connection from the app.** The MCP server is for AI clients such as Claude or ChatGPT, signs in through a browser OAuth flow, is read-only, and does not expose dictation history. A web page calling it would need an MCP client and OAuth handling that Wispr does not document for third-party web apps. The stretch goal "import Wispr notes as context" is therefore limited to pasting text, which needs no Wispr integration at all, and is not claimed as one.
- **No dictionary file export.** The import format is not documented, so the app copies a plain word list for manual entry instead of producing a file that might not import.
