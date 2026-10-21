# Demo shot list (2 minutes)

## Before recording

- Deploy first and open the live URL once a minute or two before recording, so the free server is awake (it sleeps after 15 idle minutes and takes about a minute to wake).
- Set `GROQ_API_KEY` on the host, and not `ANTHROPIC_API_KEY` until Claude is measured (the server prefers Claude whenever its key is set). The recorded answers only match the guided demo's exact text, and Wispr Flow may punctuate or capitalise your dictation differently, so a dictated change needs the live model. Check that the label under the instruction box says "Interpreted by Groq". Groq's free tier allows only a few previews a minute, so leave about 20 seconds between previews while rehearsing.
- Have Wispr Flow running with Hinglish (or Hindi and English) selected in its language settings. Wispr recommends one language per dictation.
- For the import shot, either connect a Wispr Flow account that has Notetaker and MCP access and a recent meeting summary, or have a few lines of meeting notes ready to paste. The Wispr connection is tested against mocks only, so do one real sign-in before recording and keep the paste route as the backup.
- Browser at 1440×900 or larger, clean profile, one tab. Show the address bar in the live-URL shot.
- Rehearse once. A preview takes a few seconds; the code check is instant.

## Shots

| Time | Shot | On screen | Say |
| --- | --- | --- | --- |
| 0:00–0:15 | **The problem** | TODO (author): something real from your own work, such as a stale diagram next to the compose file it no longer matches. | TODO (author): the problem in your own words. Do not use a script written for you. |
| 0:15–0:25 | **The live URL** | The browser address bar with LIVE_URL, the first screen, then click **Start guided demo**. No sign-in. | "This is live. No account, no install. One click starts from a real docker-compose file." |
| 0:25–0:40 | **Flow dictates a Hinglish change** ⟵ *Wispr clip* | Click into the instruction box. Hold your Wispr Flow hotkey and say "payment service ko alag container mein daalo aur gateway se connect karo". Release, and the words land in the box. | Nothing extra: the dictation is the audio. |
| 0:40–1:00 | **The diff and a spoken "apply"** | Click **Preview my change**. The review dialog shows the new payment-service behind the gateway, dashed because it is planned. Focus is already in the follow-up field: hold the hotkey and say "apply". | "The model turns that into explicit operations, every one is checked against the model, and nothing changes until I say apply." |
| 1:00–1:25 | **The Wispr import** | **Import from Wispr Flow or paste notes**. Pick a recent meeting summary (or paste notes), then **Propose changes from these notes**. Show the review dialog's "read as data, not commands" line. | "Decisions from yesterday's meeting come in the same way: Flow's meeting summary becomes a proposal I review. The notes are data, never commands." |
| 1:25–1:50 | **The check against a newer compose file** | Guided step 3, **Run the code check** (or **From code → Try example update**). Two new services, one retired, PostgreSQL upgraded; the planned Payment Service is kept. Apply. | "When the code moves on, I check the diagram against the newer compose file. Planned work isn't deleted just because it isn't built yet." |
| 1:50–2:00 | Close | The diagram, then the Export menu. | "A diagram that stays true: changed by voice, checked against code." |

## The Wispr clip (10 to 15 seconds)

Use **0:25 to 0:40**, the Hinglish dictation, as the required clip of Wispr Flow in use. Trim it to start just before you hold the hotkey and end when the words have landed in the box, 10 to 15 seconds in all. It needs no voice-over: the spoken Hinglish is the audio. Mention Wispr Flow in the caption or just before the clip, so it is clear Flow typed the text and not the browser microphone, which this shot does not use.

## If something goes wrong live

- If the model is slow or limited, the app says so in a badge and falls back to a recorded answer or the offline rules. Keep going. The guided demo's **Type it for me** text always has a recorded answer.
- If Flow mishears, click **Keep editing**, fix it, and say so on camera. The review step catching a mistake is part of the point.
- If the Wispr sign-in fails, paste the notes instead; the rest of the shot is the same.

## Submission text

> TODO (author): one paragraph in your own words. The README's first paragraphs describe what the app does if you want to borrow facts, but the problem should be yours.
