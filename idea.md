# Vivarisu AI — Emotion-Aware Storytelling Studio

**Working title:** Vivarisu AI  
**Project type:** Kannada mystery/movie-explanation YouTube channel plus an AI-assisted storytelling studio.  
**Core idea:** Build a long-form story direction and production system that turns a written or spoken story explanation into a complete, emotionally paced, multi-character Kannada episode for YouTube.

**Updated:** 3 November 2026

## 1. Important clarification

Vivarisu AI is **not** a discussion chatbot or viewer Q&A application.

We are not building an AI that talks with viewers about movies. The main product is the storytelling itself: strong Kannada mystery explanations, emotional narration, scene pacing, character voices, and a polished YouTube-ready output.

The YouTube channel is the public experience. The studio is the technology that helps us create better story explanations and demonstrate Gnani AI.

## 2. What we are building

### Public side: YouTube channel

Vivarisu AI will create Kannada content inspired by the quality of channels such as:

- [Mystery Explainer Kannada](https://www.youtube.com/c/Mysteryexplainerkannada)
- [Sagar's Mystery Info](https://www.youtube.com/@sagarsmysteryinfo)

The channel focuses on:

- Horror movie explanations.
- Mystery and psychological thrillers.
- Ending explanations.
- Hidden clues and details.
- True mystery stories.
- Indian folklore and mythology.
- Original suspense stories.

The target is not a basic plot summary. Every episode should feel like a properly written and narrated story.

### Product side: storytelling studio

The studio lets the creator:

1. Enter a story or movie-explanation script.
2. Record or upload rough voice notes.
3. Use Prisma to convert speech into editable text.
4. Divide the script into scenes.
5. Assign characters, emotion, pace, and intensity to each scene.
6. Upload an authorised narrator reference voice and create a reusable voice embedding.
7. Generate expressive narration or dubbed versions with the cloned narrator voice.
8. Preview the complete story.
9. Export the audio or video for YouTube.

The first version can use a small curated story library and a manual script editor. It does not need to automatically explain every movie on the internet.

## 3. Why we are building it

Movie-explanation channels already have an audience because viewers want complex stories made easy to understand. Our opportunity is to make the storytelling more immersive:

- A suspense scene should sound suspenseful.
- A sad moment should have space and emotion.
- A shocking reveal should have the right pause and emphasis.
- Different characters should feel distinct.
- Kannada narration should sound natural rather than translated or robotic.
- The final content should be useful as a real YouTube episode, not only as a technical demo.

The purpose of Gnani AI is to improve the **experience and production quality of the story**, not to add an unnecessary chatbot or simply wrap an existing playground.

## 4. Target quality level

The reference level is established Kannada mystery and movie-explanation content.

### Mystery Explainer Kannada

Its public positioning is to make excellent and complex movies understandable in Kannada while preserving the movie experience. Public third-party trackers around November 2026 estimate more than 350K subscribers, 100M total views, and more than 300 videos.

### Sagar's Mystery Info

Its public positioning focuses on horror, mystery, psychological thrillers, ending explanations, hidden details, and true-story mysteries. Public third-party trackers estimate roughly 95K subscribers.

These numbers are external estimates and are not the target by themselves. The target is the quality bar:

- Strong hook in the first few seconds.
- Natural Kannada narration.
- Suspenseful script structure.
- Clear explanation of confusing events.
- Research, clues, theories, and themes.
- Good voice recording or synthesis.
- Appropriate background music and pauses.
- Strong thumbnail and title.
- Consistent publishing.

Vivarisu AI should feel like a serious Kannada storytelling brand, not an AI experiment page.

## 5. How the story becomes an episode

```text
Story idea / movie research
          |
          v
Creator script and rough voice notes
          |
          v
Gnani Prisma converts speech to editable text
          |
          v
Scene, character, emotion and pacing plan
          |
          v
Gnani Timbre creates expressive narration
          |
          v
Audio mixing + visuals + subtitles
          |
          v
Final Vivarisu AI YouTube episode
```

## 6. Gnani AI usage

Gnani should be visible and essential in the demo.

### Honest distinction from the Gnani playground

Gnani’s own playground already demonstrates single-prompt text-to-speech, voice selection, emotional audio tags, and explainer-video scenarios. Those features are available to Gnani users and should not be presented as our unique invention.

Our value is the layer around the model:

- Convert one long story script into a scene-by-scene production plan.
- Build a consistent voice identity for the narrator and each character.
- Track the emotional arc across the entire episode rather than applying one emotion to one paragraph.
- Use context-aware pronunciation for Kannada names, locations, and movie terms.
- Generate, preview, compare, and assemble many audio segments into one finished story.
- Synchronise narration, pauses, subtitles, visuals, and background music.
- Export a coherent, YouTube-ready episode instead of a single generated audio sample.

The demo must show this workflow and the before/after result. It should not show only a text box, a voice selector, and a generated audio button.

### Prisma: voice-to-script and multilingual understanding

Use Gnani Prisma to:

- Transcribe the creator’s rough Kannada narration or voice notes.
- Convert spoken research notes into editable script text.
- Handle Kannada-English code-mixed speech.
- Recognise character names, movie titles, places, and unusual terms using context hints.
- Support a future multilingual version of the same story.

For short recordings, use the REST STT endpoint. For a longer recorded episode, split the recording into clips or use the Batch API. The participant account’s confirmed model version must be checked before implementation because the public challenge page and current API docs mention different Prisma versions.

### Timbre: expressive story narration

Use Gnani Timbre to:

- Narrate the final Kannada script.
- Give the narrator a consistent identity.
- Give important characters different voices where practical.
- Control speaking speed and pauses.
- Make suspense, fear, sadness, excitement, and shock audible.
- Produce language-specific versions of an episode.

If Timbre v3.0 is available, use its expressive audio tags:

```text
<pauses>  <excited>  <whispers>  <slow>  <laugh>  <sigh>
```

Example:

```text
ಅವನು ಬಾಗಿಲನ್ನು ನಿಧಾನವಾಗಿ ತೆರೆದನು. <pauses> ಒಳಗೆ ಯಾರೂ ಇರಲಿಲ್ಲ.
ಆದರೆ ಅವನ ಹಿಂದೆ ಯಾರೋ ನಿಂತಿದ್ದರು. <whispers>
```

These tags are for the **story’s narration**, not for detecting the viewer’s emotion. Timbre v2.5 does not perform v3.0 audio tags, so the app must check the enabled account version.

The separate voice-cloning model `vachana-vc-v1` has its own documented request format and does not document Timbre v3.0 audio tags or exact cross-language prosody transfer. We must test those capabilities in the participant account instead of assuming that every Timbre feature carries over to cloned TTS.

### Voice cloning and multilingual dubbing

This is a major Vivarisu AI use case:

> A creator uploads their own authorised voice sample once, and the same narrator voice is used to publish the story in other Indian languages.

The documented Gnani flow is:

1. Upload 5–30 seconds of clean reference audio to the voice-embedding endpoint.
2. Store the returned `speaker_embedding` securely.
3. Transcribe the original narration with Prisma.
4. Translate or adapt the script into the target language using the explanation/translation layer or human review.
5. Reapply the scene’s emotion, pace, and pause instructions.
6. Send the target-language text and the speaker embedding to the voice-cloned TTS endpoint using `vachana-vc-v1`.
7. Assemble the returned scene audio into the dubbed episode.

The result should preserve the creator’s **voice identity** while our story-direction layer preserves the intended emotion, pacing, and dramatic structure.

We must not promise that the current voice-clone endpoint automatically preserves the exact acoustic tone, timing, or emotion of the uploaded performance. The public VC documentation describes speaker embedding and cloned synthesis, but does not clearly guarantee exact prosody transfer across languages. We will measure this with a before/after test and describe the result honestly as “same narrator voice with directed emotional style” if exact transfer is not available.

The reference recording must belong to the uploader or have explicit permission. The app must include consent, deletion, and secure storage controls for voice embeddings and audio.

### Our custom story-direction layer

The application will create a structured “voice director sheet” before calling Timbre:

```text
scene_id
scene_purpose
speaker
speaker_voice
emotion
emotion_intensity
pace
pause_points
pronunciation_terms
music_or_sfx_note
```

This sheet is our product logic. Gnani provides the speech intelligence and synthesis; Vivarisu AI decides how the story should be performed from beginning to end.

### Evon: optional script intelligence

If Evon access is available, it can help with:

- Structuring a rough script.
- Creating scene transitions.
- Identifying character and plot relationships.
- Suggesting emotional beats.
- Translating or adapting a script between supported Indian languages.

Evon should assist the creator, not replace research or fact-checking. If it is not available through the participant account, the MVP can use structured creator-written scripts while still making Prisma and Timbre central.

## 7. Emotion system

Emotion is applied to the story and scene, not automatically assigned to the user.

Each scene can have:

```text
emotion: neutral | suspense | fear | sadness | joy | shock | reflection
intensity: low | medium | high
pace: slow | normal | fast
pause_before_reveal: true | false
voice_style: narrator | character_a | character_b
```

### Example scene plan

| Scene | Story purpose | Emotion | Pace | Voice treatment |
|---|---|---|---|---|
| Opening hook | Create curiosity | Mystery | Slow | Low voice, short pause |
| First discovery | Reveal the clue | Suspense | Normal | Emphasise key words |
| Character loss | Create empathy | Sadness | Slow | Softer delivery, longer pauses |
| Final twist | Surprise the viewer | Shock | Fast then pause | Strong emphasis before reveal |
| Ending meaning | Explain the theme | Reflection | Normal | Clear and calm |

The emotion plan is what makes the project more than text-to-speech. The system should create a deliberate performance for each scene.

## 8. MVP features

### Must have

- Script input or file upload.
- Rough voice-note upload.
- Prisma transcription into editable text.
- Scene-by-scene script editor.
- Automatic or assisted scene segmentation.
- Emotion and pace controls for each scene.
- Character voice mapping that stays consistent across scenes.
- Pronunciation dictionary for names and Kannada terms.
- Character/narrator voice selection.
- Timbre narration generation.
- Authorised voice-clone upload and embedding creation.
- Dub a finished script into at least one target Indian language.
- Audio preview for each scene.
- Full-story playback.
- Audio assembly with silence, music, and scene order.
- Subtitles generated from the final script.
- Kannada-first UI and output.
- Exportable narration audio.
- A visible “Built with Gnani Prisma + Timbre + Voice Cloning” section.

### Good to have

- Background music track upload.
- Auto-generated subtitles.
- English/Hindi/Tamil versions.
- Timeline showing scene emotion.
- Emotional arc chart for the entire episode.
- Compare neutral narration vs expressive narration.
- Compare original-language narration with a dubbed version using the same narrator identity.
- Export a simple video with images, subtitles, and audio.
- YouTube metadata suggestions: title, description, chapters, and tags.

### Do not build first

- Viewer discussion chatbot.
- Automatic explanation of every movie.
- Social network features.
- Phone-call agent.
- Automatic dubbing into every language.
- Complex recommendation engine.
- Fully automatic video editing before the narration pipeline works.

## 9. Recommended tech stack

- **Frontend:** Next.js, React, and Tailwind CSS.
- **Backend:** Python FastAPI for audio and script processing, or Next.js server routes for a smaller MVP.
- **Story data:** JSON files at first; PostgreSQL later.
- **Audio processing:** FFmpeg for joining scene audio, background music, and silence.
- **Speech-to-text:** Gnani Prisma REST first; Batch for long source recordings later.
- **Text-to-speech:** Gnani Timbre REST first; SSE streaming if preview latency matters.
- **Voice cloning:** Gnani voice embeddings plus `vachana-vc-v1` cloned TTS, subject to participant-account access.
- **Optional reasoning:** Evon if access is available, otherwise a controlled script-processing layer.
- **Storage:** Local files during development; object storage for deployed audio exports.
- **Deployment:** Vercel for the frontend and a secure backend host for API calls and audio processing.
- **Security:** Keep the Gnani key only on the backend in `GNANI_API_KEY`.
- **Video editing for channel:** DaVinci Resolve or CapCut for the final creator-controlled edit.

## 10. Build phases

### Phase 0 — Confirm the foundation

- Confirm challenge registration, credits, and API access.
- Check enabled Prisma and Timbre versions.
- Choose Kannada as the first language unless we decide otherwise.
- Choose one mystery/horror story for the first demo.
- Confirm that the content is original, public-domain, folklore-based, or permission-based.

### Phase 1 — Create the creator format

- Define the Vivarisu AI intro and outro.
- Define a repeatable episode structure.
- Create one strong script.
- Mark every scene’s emotion, pace, and pause points.
- Decide the narrator voice and character voices.

### Phase 2 — Test Gnani audio quality

- Record a short Kannada rough narration.
- Transcribe it with Prisma.
- Correct names and terms using context hints.
- Generate the same paragraph with neutral Timbre narration.
- Generate it again with emotional cues.
- Compare whether the story actually feels more alive.
- Create a narrator embedding from an authorised voice sample.
- Generate the same short scene in Kannada and one target language.
- Compare voice identity, pronunciation, emotion, and pacing across both versions.

### Phase 3 — Build the studio MVP

- Add script input.
- Add scene cards.
- Add the voice director sheet.
- Add emotion controls.
- Add character-to-voice mapping.
- Add voice generation.
- Add authorised voice-clone generation.
- Add per-scene audio preview.
- Add audio assembly and final playback.
- Add full-story playback.
- Add audio export.

### Phase 4 — Produce the channel episode

- Prepare visuals and legally usable footage/images.
- Add narration, music, subtitles, and pacing.
- Create thumbnail and title.
- Publish the first episode or private demo.
- Collect genuine viewer feedback on narration and clarity.

### Phase 5 — Add dubbing and improve

- Test Kannada pronunciation, names, code-mixed words, and noisy recordings.
- Compare flat versus emotional narration.
- Test one cross-language dubbed scene with the cloned narrator voice.
- Confirm whether emotion tags and style controls work with the enabled voice-clone model.
- Fix unnatural pauses and excessive effects.

### Phase 6 — Submit

- Record the 60-second challenge demo.
- Publish the demo post with the required hashtags.
- Submit the project description, video, Gnani models, and contribution details.

## 11. 60-second challenge demo

### 0–8 seconds — Show the problem

Show a long story script being treated as one flat voice block. The pacing and character changes are lost.

### 8–18 seconds — Add the story script

Show Vivarisu AI dividing a Kannada mystery script into scenes, characters, emotion, pace, and pause points.

### 18–28 seconds — Prisma

Record rough spoken Kannada story notes. Show Prisma turning them into an editable script with corrected names and terms.

### 28–40 seconds — Voice cloning and dubbing

Show the creator uploading an authorised voice sample, then generate one short scene in Kannada and a second language with the same narrator identity.

### 40–53 seconds — Emotion-aware Timbre

Play the flat single-block version, then the assembled Vivarisu AI episode with scene emotion, pauses, and voice continuity. The difference should be obvious.

### 53–60 seconds — Closing message

> “Vivarisu AI uses Gnani AI to make Kannada stories not just understandable—but alive.”

## 12. YouTube content format

Each episode can follow this structure:

1. **Hook:** Ask a disturbing or mysterious question.
2. **Setup:** Introduce the movie/story without confusion.
3. **Characters:** Explain only the important relationships.
4. **Story progression:** Narrate the major events with scene emotion.
5. **Clues:** Point out details viewers may have missed.
6. **Twist:** Build suspense before revealing it.
7. **Ending:** Explain what happened clearly.
8. **Meaning:** Discuss the theme or possible interpretation.
9. **Outro:** Invite viewers to watch the next Vivarisu AI story.

The YouTube channel should remain creator-led. Gnani supports the voice and production experience; it should not make the content feel mass-produced.

## 13. Copyright and content safety

Start with:

- Original stories.
- Public-domain stories.
- Indian folklore and mythology.
- Permission-based short films or stories.
- Transformative commentary with careful use of copyrighted material where legally appropriate.

Do not upload full movies, copy scripts, or depend on large amounts of copyrighted footage. The channel should add original narration, analysis, interpretation, and editing.

## 14. Success measures

- The narration sounds natural in Kannada.
- Emotion changes are clearly audible but not exaggerated.
- Names and important terms are pronounced acceptably.
- The story is easy to follow.
- The final output is good enough for a real YouTube upload.
- The difference between neutral and emotion-aware narration is noticeable.
- The cloned narrator identity remains recognisable across the tested language version.
- The dubbed version preserves the intended scene emotion and pacing closely enough for review.
- Prisma and Timbre are visibly used in the demo.
- Viewers understand why the emotional version is better.
- The production workflow saves time for future episodes.

## 15. Final project statement

> Vivarisu AI is an emotion-aware Kannada storytelling studio and mystery-explanation channel. It uses Gnani Prisma to turn spoken story ideas and rough narration into editable scripts, Gnani Timbre to create expressive narration, and authorised voice cloning to produce multilingual versions in the creator’s narrator identity. Scene-level direction controls emotion, pacing, and pauses. The goal is to make stories not only understandable, but alive.

## 16. Decisions before implementation

1. Final first story.
2. Kannada narrator voice.
3. Whether the first content is a movie explanation, true mystery, folklore story, or original story.
4. Which Prisma and Timbre versions the participant account provides.
5. Whether Evon access is available.
6. First demo format: narration studio or finished story player.
7. Voice-clone consent and deletion flow for uploaded audio.
