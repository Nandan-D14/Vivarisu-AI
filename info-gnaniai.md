# Gnani AI Research Notes

**Research date:** 2 November 2026  
**Purpose:** Understand Gnani AI and the Great Indian AI Internship Challenge before planning the story/movie-explainer project.

## 1. What Gnani AI is

Gnani AI is an Indian voice-AI company focused on speech and language systems for Indian languages, real conversations, and telephony audio. Its product direction is described as **Artha**, a sovereign AI stack that can be deployed on infrastructure controlled by the customer.

The relevant product families for our idea are:

| Product | What it does | Relevance to our project |
|---|---|---|
| **Prisma** | Speech-to-text (STT) | Converts a viewer’s spoken question into text. |
| **Timbre** | Text-to-speech (TTS) | Reads the explanation aloud in an Indian language. |
| **Evon** | Open-weight multilingual language model | Possible reasoning/summarisation layer if access and hardware are available. |
| **Warp** | Speech-to-speech model | Interesting for a later voice-to-voice version, but not necessary for the first MVP. |

Gnani’s public messaging focuses on Indian accents, code-switching, noisy telephony audio, names, numerals, and Indian-language context rather than only clean studio speech.

## 2. Internship challenge requirements

The internship page says the challenge is open-ended: participants can build any working application using at least one Gnani AI model or API.

### Eligibility

- Currently enrolled in a college or university course in India.
- At least 18 years old on the registration day.
- Solo or a team of two.

### Important dates

- Contest/build window: 1 October 2026 onward.
- Final submission deadline: **10 November 2026, 11:59 PM IST**.
- Internships are scheduled to begin: 1 January 2027.

### Submission requirements

The submission needs to describe:

- Project title and problem.
- Intended users.
- Gnani models/APIs used.
- Each team member’s contribution.
- A working public demo video.
- Written project explanation.
- A live LinkedIn or X post nominated in the submission.

The public post must include `#GreatIndianAIInternshipChallenge` and `#GnaniAI`. Engagement must be genuine; purchased votes, bots, engagement exchanges, plagiarism, and misleading demos are not allowed.

Each registration receives 5,000 programme credits. The challenge page says offers and stipends are individual, even for a team of two.

### Award categories relevant to our idea

- **Main Character Award:** best regional or low-resource Indian-language build.
- **Mixed Vibes Award:** best code-mixed voice experience such as Hinglish, Tanglish, or Benglish.
- **Jugaad Genius Award:** most creative or unexpected use of Gnani models.
- **Demo Day Drop Award:** best 60-second demo video.
- **Crowd Favourite Award:** genuine public engagement on LinkedIn/X.

The project should not only mention Gnani in the footer. Gnani speech should be central to the user experience and visible in the demo.

## 3. Speech-to-text: Gnani Prisma

### Prisma v3.0

Prisma v3.0 is the most relevant model for a voice story companion because it can:

- Recognise ten documented languages: nine Indian languages plus English.
- Use `indic-auto` to identify the spoken language.
- Accept one to four expected language codes.
- Handle mixed-language speech.
- Return `detected_language_code`.
- Produce `verbatim`, `transcribe`, `codemix`, or `transliterate` output styles.
- Use context hints such as key terms, topic, speaker names, and previous text.

Supported language codes listed in the model documentation:

| Language | Code |
|---|---|
| Bengali | `bn-IN` |
| English (India) | `en-IN` |
| Gujarati | `gu-IN` |
| Hindi | `hi-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi | `mr-IN` |
| Punjabi | `pa-IN` |
| Tamil | `ta-IN` |
| Telugu | `te-IN` |

`indic-auto` is available for Prisma v3.0. It asks Prisma to identify the language rather than requiring the app to know it in advance.

### Prisma access methods

| Method | Use case | Endpoint/shape |
|---|---|---|
| REST | Short recording up to 30 seconds | `POST https://api.vachana.ai/stt/v3` |
| WebSocket realtime | Live microphone or conversation | `wss://api.vachana.ai/stt/v3/stream` |
| Batch | Long recordings or many files | Batch jobs API |

For the first version of our project, REST is the simplest option: record a short viewer question, upload it, and wait for the transcript. WebSocket streaming can be considered later if the demo needs live partial transcription.

### Minimal Prisma REST request

```bash
curl -X POST https://api.vachana.ai/stt/v3 \
  -H 'X-API-Key-ID: <API_KEY>' \
  -F audio_file='@question.wav' \
  -F model=prisma-v3.0 \
  -F language_code=indic-auto
```

Typical response fields include:

```json
{
  "success": true,
  "request_id": "...",
  "transcript": "ನನಗೆ ಈ ಕಥೆಯ ಅಂತ್ಯ ಅರ್ಥವಾಗಲಿಲ್ಲ",
  "model": "prisma-v3.0",
  "detected_language_code": "kn-IN",
  "processing_time": 0.58,
  "end_to_end_latency": 0.66
}
```

### Useful output styles for our project

- `verbatim`: native-language script; useful for displaying Kannada, Hindi, or Tamil text.
- `transcribe`: keeps English words and uses digits/symbols; useful for names and dates.
- `codemix`: keeps English words in Latin script while preserving the native language around them; useful for Hinglish/Tanglish questions.
- `transliterate`: writes the full transcript in Latin letters; useful if a user reads Romanised Kannada/Hindi more easily.

### Useful context hints

For a movie/story question, the app could send:

- `topic`: the selected story or movie and its genre.
- `keyterms`: character names, place names, titles, and uncommon words.
- `previous_text`: useful when a long spoken question is split into multiple clips.

Prisma does not translate text, generate the explanation, provide word-level timestamps, or perform speaker diarization for REST/realtime. Those are separate application concerns.

### Prisma limits relevant to our plan

- REST audio is limited to 30 seconds per request.
- Realtime audio must be sent as mono PCM according to the WebSocket requirements.
- The language list accepts one to four language codes, or `indic-auto` for v3.0.
- Audio should be mixed down to mono when using REST/realtime.
- Audio longer than 30 seconds should use Batch or be split into short clips.

## 4. Text-to-speech: Gnani Timbre

Timbre converts the generated explanation into speech. This makes it important for our project: the app should not only display a summary; it should let a user listen to an explanation in a familiar language.

### Models

- `timbre-v2.5`: 42 voices, generally each with a preferred language.
- `timbre-v3.0`: 13 voices, with each voice speaking all ten documented languages.

Timbre v3.0 also supports expressive inline audio tags such as `<pauses>`, `<laugh>`, `<whispers>`, `<excited>`, and `<slow>`. This could make a story explanation feel more like narration, but we should test whether the participant account supports v3.0 before relying on it.

### Voices relevant to storytelling

For Timbre v2.5:

- Kannada: `Saanvi`, `Kavin`
- Hindi: `Nalini`, `Jalaj`, `Deepak`, and others
- Hinglish: `Poorvi`
- Tamil: `Asmita`, `Noopur`, and others
- Telugu: `Suhana`, `Varuni`, and others

For Timbre v3.0, `Lakshmi` and `Vasudha` are described as suitable for storytelling or e-learning narration. The v3.0 voices support all ten listed languages.

### Timbre REST request

```bash
curl -X POST https://api.vachana.ai/api/v1/tts/inference \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key-ID: <API_KEY>' \
  -d '{
    "text": "ಈ ಕಥೆಯ ಅಂತ್ಯವನ್ನು ಸರಳವಾಗಿ ವಿವರಿಸುತ್ತೇನೆ.",
    "voice": "Kavin",
    "model": "timbre-v2.5",
    "language": "kn-IN",
    "speed": 1.0,
    "audio_config": {
      "sample_rate": 48000,
      "num_channels": 1,
      "sample_width": 2,
      "encoding": "linear_pcm",
      "container": "wav"
    }
  }' \
  --output explanation.wav
```

The REST endpoint returns binary audio. SSE and WebSocket options are available for streaming audio when a more conversational experience is needed.

The documented TTS language parameter includes `auto`, the ten Indian language codes, and `hi-en` for Hinglish. Speed is documented from `0.85` to `1.15`.

## 5. Emotion and sentiment handling

Gnani has emotion-related features, but they should be understood as three separate capabilities:

### 5.1 Expressive narration with Timbre v3.0

Timbre v3.0 supports inline audio tags that change how the generated response is delivered. Documented tags include:

- `<excited>` for energetic delivery.
- `<whispers>` for a hushed voice.
- `<shouting>` for a raised voice.
- `<slow>` for drawn-out pacing.
- `<laugh>`, `<giggle>`, `<sigh>`, and `<pauses>` for expressive or conversational cues.

Example:

```text
The door opened slowly. <pauses> And then, <whispers> someone was standing behind him.
```

These tags control the output style. The application still needs to decide whether a story moment is suspenseful, sad, happy, or exciting. Audio tags are documented for **Timbre v3.0**; they are removed rather than performed by Timbre v2.5.

### 5.2 Sentiment analytics in Gnani’s agent platform

Gnani Agent Analytics documents sentiment trends such as positive, negative, and neutral emotional tone across calls/chats. This is useful for measuring how an agent interaction is going over time.

### 5.3 Emotion detection is not a native Prisma transcript field

The STT documentation does not describe Prisma REST or realtime responses as returning emotion labels. Gnani’s call-analytics example derives sentiment arcs and emotion shifts from the transcript during a separate LLM analysis step. Therefore, our custom story app should not claim that Prisma itself detects emotion from a user’s voice unless the participant dashboard or API documentation confirms an additional feature.

### How to use emotion in our story project

For each story scene or answer, we can store an emotion label such as `mystery`, `sad`, `happy`, `fear`, or `excited`. The explanation layer can then choose a suitable narration style and, when Timbre v3.0 is available, add one or two appropriate audio tags. For example:

```text
Emotion: suspense
Narration: "ಅವನು ಬಾಗಿಲು ತೆರೆದನು. <pauses> ಒಳಗೆ ಯಾರೂ ಇರಲಿಲ್ಲ."
```

For a viewer’s spoken question, we can optionally infer tone from the transcript and conversation context—such as confused, excited, or frustrated—and respond more patiently or briefly. That inference would be application logic or an LLM analysis step, not something to attribute automatically to Prisma.

## 6. Evon and the explanation layer

Evon v3.3 is described by Gnani as a 30-billion-parameter mixture-of-experts language model with roughly 3.5 billion active parameters per token, a 128K context window, native training across 11 Indian languages, and Apache 2.0 open weights available by request.

The public information describes Evon as self-hostable/open-weight rather than as the same simple speech API used for Prisma and Timbre. We should not assume that a hosted Evon API key is available. For a practical MVP, the architecture can keep the reasoning layer separate and make Prisma/Timbre the clearly demonstrated Gnani components. If Evon access is granted, it can be evaluated as the multilingual explanation model.

## 7. Recommended role for Gnani in our project

The project idea is a YouTube channel plus a voice companion for movie and story explanations.

### Viewer flow

1. A viewer watches a story/movie explanation on YouTube.
2. The viewer opens the companion app.
3. The viewer asks, by voice, “Why did the character do that?” in Kannada, Hindi, or mixed speech.
4. Prisma transcribes the question and identifies the language.
5. The explanation layer answers using only the selected story’s approved notes/context.
6. Timbre reads the answer aloud in the chosen language.
7. The viewer can ask a follow-up question.

### Why this is stronger than a generic summariser

- The YouTube channel gives the project a real audience and a way to collect real questions.
- The app solves the follow-up-question problem that a video cannot solve.
- Regional-language voice interaction makes Gnani essential to the experience.
- A viewer can request simple, detailed, child-friendly, or ending-focused explanations.
- We can demonstrate code-mixed input and regional narration instead of showing only a text chatbot.

## 8. Product decisions still to make

Before writing the build plan, decide:

1. **Primary audience:** Kannada viewers, Hindi viewers, or another language group.
2. **Content focus:** movies, mythology/folk stories, short stories, or a combination.
3. **First format:** web app, mobile app, or voice-call experience.
4. **Explanation source:** prepared notes for a small story library, user-provided story text, or a larger searchable catalogue.
5. **Narration voice:** one consistent narrator or a language-specific voice.
6. **Copyright approach:** begin with original stories, public-domain stories, folklore, or licensed/permission-based content.

The safest MVP is a small catalogue of original, public-domain, or permission-based stories. The app can then demonstrate voice questions and answers without depending on copyrighted movie footage or copied scripts.

## 9. Technical and security notes

- Do not put the Gnani API key directly in a public frontend or GitHub repository.
- Use a backend route/serverless function to call Prisma and Timbre.
- Store the API key in an environment variable such as `GNANI_API_KEY`.
- Handle API errors for missing keys, invalid keys, insufficient credits, forbidden scopes, rate limits, and service failures.
- Do not claim a latency or language result without testing it on our own recordings.
- Keep a small evaluation set containing Kannada/Hindi/English and code-mixed questions, character names, titles, and noisy audio.
- The YouTube channel and app should clearly label AI-generated narration where appropriate.

## 10. Version note that needs confirmation

There is a version difference across current public pages:

- The internship page prominently describes **Prisma v2.5**, **Timbre v2.5**, and Evon for the challenge.
- The current developer documentation documents **Prisma v3.0** and also documents **Timbre v3.0**.
- Prisma v3.0 is opt-in by sending `model=prisma-v3.0`; the `/stt/v3` URL does not itself mean Prisma v3.0.

Before implementation, check the participant dashboard and the credits/account email to confirm which models and endpoints are enabled for this challenge. Build the first integration so the model name can be configured rather than hard-coded.

## 11. Practical usage guide

### Before using the APIs

1. Register for the challenge.
2. Claim the programme credits and wait for the API access instructions.
3. Create an API key in the Gnani dashboard.
4. Confirm which Prisma and Timbre versions are enabled for the account.
5. Keep the key in a backend environment variable such as `GNANI_API_KEY`.

### Basic story-question flow

1. Let the user choose a story or movie from the app’s catalogue.
2. Record a short voice question, ideally under 30 seconds for the REST STT path.
3. Send the recording to Prisma with `model`, `language_code`, and an explicit `format`.
4. Read `transcript` and `detected_language_code` from the response.
5. Pass the transcript and the selected story’s trusted notes to the explanation layer.
6. Ask the explanation layer for a concise answer in the detected or selected language.
7. Assign an emotion/style label to the answer, such as `neutral`, `mystery`, `sad`, `happy`, or `excited`.
8. Convert the answer to audio with Timbre and play or stream the result.

### Recommended first configuration

For multilingual voice questions:

```text
model: prisma-v3.0
language_code: indic-auto
format: codemix
```

Use a fixed language such as `kn-IN` when the user has selected Kannada and the app should prefer Kannada. Use `transliterate` when the user prefers Romanised output.

For a first Kannada narration, use the Timbre v2.5 voice `Kavin` or `Saanvi` if those voices are available in the account. If Timbre v3.0 is enabled, test `Lakshmi` or `Vasudha` for storytelling and add only one or two emotion tags per paragraph.

### Emotion handling guide

Use emotion to improve storytelling, not to make unsupported psychological claims about the user.

| Story state | Narration approach |
|---|---|
| Neutral explanation | No tag; use a clear, conversational voice. |
| Suspense or mystery | Add a pause and slower pacing. |
| Happy or celebratory | Use `<excited>` sparingly. |
| Sad or reflective | Use a slower delivery and natural pauses. |
| Important reveal | Add `<pauses>` before the reveal, then return to a normal tone. |
| User sounds confused | Make the answer shorter, simpler, and more patient. |

Do not automatically label a viewer as sad, angry, or afraid from one sentence. If emotion detection is added later, describe it as an approximate conversation signal and give the user control over narration style.

### Testing checklist

- Test Kannada, Hindi, English, and code-mixed questions.
- Test character names, place names, movie titles, and unusual words with Prisma `keyterms`.
- Test a quiet recording and a recording with background noise.
- Compare `verbatim`, `codemix`, and `transliterate` output.
- Test neutral and expressive Timbre narration side by side.
- Verify that emotion tags are supported by the enabled Timbre version.
- Log request IDs and errors, but do not store voice recordings or API keys unnecessarily.
- Measure transcription accuracy, answer usefulness, response time, and whether users ask follow-up questions.

### Safe content usage

Start with original stories, public-domain stories, Indian folklore, mythology, or content for which permission has been obtained. Do not upload full copyrighted movies, copy scripts, or use large amounts of movie footage/audio without checking the applicable rights and platform rules.

## 12. Sources

- Internship challenge: <https://www.gnani.ai/internship>
- Documentation index: <https://docs.gnani.ai/llms.txt>
- Quick start: <https://docs.gnani.ai/api/introduction/quick-start>
- Speech-to-text overview: <https://docs.gnani.ai/api/STT/overview.md>
- Prisma v3.0: <https://docs.gnani.ai/api/STT/models/prisma-v3.md>
- STT supported languages: <https://docs.gnani.ai/api/STT/languages.md>
- STT limits: <https://docs.gnani.ai/api/STT/limits.md>
- Realtime STT: <https://docs.gnani.ai/api/STT/stt-websocket.md>
- TTS REST: <https://docs.gnani.ai/api/TTS/tts-inference.md>
- TTS voices: <https://docs.gnani.ai/api/TTS/available-voices.md>
- TTS streaming: <https://docs.gnani.ai/api/TTS/tts-sse.md>
- TTS audio tags: <https://docs.gnani.ai/api/TTS/tts-audio-tags.md>
- Agent Analytics: <https://docs.gnani.ai/E03_Agent_Analytics.md>
- Call analytics example: <https://docs.gnani.ai/api/use-cases/call-analytics.md>
- Gnani models: <https://www.gnani.ai/models>
- Evon v3.3: <https://www.gnani.ai/resources/introducing-evon-v3-3-large-language-model>
