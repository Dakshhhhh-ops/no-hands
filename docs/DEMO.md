# Demo shot list (2 minutes)

## Before recording

- Deploy first and open the live URL once a minute or two before recording, so the free server is awake (it sleeps after 15 idle minutes and takes about a minute to wake).
- Record against the live URL, not localhost.
- Set `GROQ_API_KEY` on the host, and not `ANTHROPIC_API_KEY` until Claude is measured (the server prefers Claude whenever its key is set). With a key, every preview is a live call, so the review dialog should not say "Recorded answer"; if it does, the live call failed and the badge says why. Check that the label under the instruction box says "Interpreted by Groq". Groq's free tier allows only a few previews a minute, so leave about 20 seconds between previews while rehearsing.
- Use a project of your own: a docker-compose file with several services, from a repo where the compose file changed over time. Save the version from an older commit (for example `git show <older-commit>:docker-compose.yml > compose-old.yml`) to import, and keep the current file for the code check. VoiceArchitect's own `docker-compose.yml` has a single service, so it draws a one-box diagram. If you have no such project, use the guided demo's example stack and say so.
- Make the hotkey visible: a keystroke overlay, or a second camera on your hands. Viewers must see that you are holding the Wispr Flow hotkey, not typing.
- Have Wispr Flow running with Hinglish (or Hindi and English) selected in its language settings. Wispr recommends one language per dictation.
- For the import shot, either connect a Wispr Flow account that has Notetaker and MCP access and a recent meeting summary, or have a few lines of meeting notes ready to paste. The Wispr connection is tested against mocks only, so do one real sign-in before recording and keep the paste route as the backup.
- Browser at 1440×900 or larger, clean profile, one tab. Show the address bar in the live-URL shot.
- Rehearse once. A preview takes a few seconds; the code check is instant.

## Shots

| Time | Shot | On screen | Say |
| --- | --- | --- | --- |
| 0:00–0:15 | **The problem** | TODO (author): something real from your own work, such as a stale diagram next to the compose file it no longer matches. | TODO (author): the problem in your own words. Do not use a script written for you. |
| 0:15–0:25 | **The live URL, your own stack** | The browser address bar with LIVE_URL, then **From code → Import docker-compose** with your older compose file. Your services appear. No sign-in. | "This is live, no account. That's my own project's compose file from a few weeks ago." |
| 0:25–0:40 | **Flow dictates a Hinglish change** ⟵ *Wispr clip* | Click into the instruction box. With the hotkey visibly held, say a change to one of your own services in Hinglish, for example "<your service> ke aage Redis cache laga do". Release, and the words land in the box. | Nothing extra: the dictation is the audio. |
| 0:40–1:00 | **The diff and a spoken "apply"** | Click **Preview my change**. The review dialog shows the exact change to your services, the new component dashed because it is planned. Focus is already in the follow-up field: hold the hotkey and say "apply" out loud. | "The model turns that into explicit operations, every one is checked against the model, and nothing changes until I say apply." |
| 1:00–1:25 | **The Wispr import** | **Import from Wispr Flow or paste notes**. Pick a recent meeting summary (or paste notes), then **Propose changes from these notes**. Show the review dialog's "read as data, not commands" line. | "Decisions from yesterday's meeting come in the same way: Flow's meeting summary becomes a proposal I review. The notes are data, never commands." |
| 1:25–1:50 | **The check against a newer compose file** | **From code → Check against code** with your current compose file. What changed in your repo since the old commit shows up as one reviewable sync; the change you just planned is kept. Apply. | "When the code moves on, I check the diagram against the newer compose file. Planned work isn't deleted just because it isn't built yet." |
| 1:50–2:00 | Close | The diagram, then the Export menu. | "A diagram that stays true: changed by voice, checked against code." |

## The Wispr clip (10 to 15 seconds)

Use **0:25 to 0:40**, the Hinglish dictation, as the required clip of Wispr Flow in use. Trim it to start just before you hold the hotkey and end when the words have landed in the box, 10 to 15 seconds in all. It needs no voice-over: the spoken Hinglish is the audio. Mention Wispr Flow in the caption or just before the clip, so it is clear Flow typed the text and not the browser microphone, which this shot does not use.

## If something goes wrong live

- If the model is slow or limited, the app says so in a badge and falls back to a recorded answer or the offline rules. Keep going. Recorded answers only exist for the guided demo's **Type it for me** text, so a dictated change about your own services needs the live model: wait 20 seconds and try again.
- If your own Wispr Flow sign-in does not work, show the paste route in the import shot, and say in the submission that the Wispr Flow import is not verified.
- If Flow mishears, click **Keep editing**, fix it, and say so on camera. The review step catching a mistake is part of the point.
- If the Wispr sign-in fails, paste the notes instead; the rest of the shot is the same.

## Submission text

> TODO (author): one paragraph in your own words. The README's first paragraphs describe what the app does if you want to borrow facts, but the problem should be yours.
