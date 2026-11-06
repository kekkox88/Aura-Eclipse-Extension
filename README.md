# Aura Eclipse 6.0.7 · Nuvola · Build 613 ☁️

**Three audio engines. One smart coordinator.**

Aura Eclipse is a MySpoti audio extension developed by **kekkox88**. It searches compatible audio sources using three selectable strategies and an automatic coordination layer.

## Getting started (30 seconds)

1. Install **Aura Eclipse** from the MySpoti extension store, or import its release package using MySpoti's extension installation feature.
2. Open **MySpoti → Extensions → Aura Eclipse** and leave **TIGRO** enabled for fast HQ listening.
3. Play a track normally. Enable **WHALE** only if you want more extensive recovery, or **COLIBRÌ** when you prefer lower data usage.
4. If a provider requires authentication, use the built-in session verification or **Vault · Account Manager** as appropriate. No account setup is necessary for every source.

**Important:** You do **not** need to enable all three engines. For most listeners, start with **TIGRO only**.

## Quick start: which switches should I enable?

**You do not need to enable all three engines.** Start with the default configuration, then change it according to your listening needs.

| Engine | Default | Purpose | When to use |
| --- | --- | --- | --- |
| 🐯 **TIGRO · HQ Fast** | **ON** | Fast search for FLAC/Hi-Res | Everyday listening with a focus on lossless audio |
| 🐳 **WHALE · Rare Rescue** | OFF | Searches HQ first, then tries MP3/AAC when needed | Rare songs, edits, remixes, or when HQ cannot be found |
| 🐦 **COLIBRÌ · Eco Stream** | OFF | Prioritizes compressed MP3/AAC | Mobile data saving or when lossy is preferred |

**Suggested setups**

- **HQ listening:** TIGRO on; WHALE and COLIBRÌ off (the installation default).
- **Broader rescue:** Enable WHALE when you want a fallback to compressed formats.
- **Data saving:** Use COLIBRÌ when you prefer compressed audio.

The switches select search strategies, **not three separate music services**. Enabling all of them is not required and does not guarantee higher quality. When multiple engines are enabled, **COLIBRÌ takes precedence over WHALE, and WHALE over TIGRO**. Actual playback also depends on source availability and the audio already cached by MySpoti.

## Behind the scenes

- ☁️ **NUVOLA · Smart Coordinator:** automatic search coordination and metadata caching; no additional toggle is needed.
- 🌞 **SOLE · Legacy Core:** compatibility alternative under Maintenance; switch takes effect on the next audio request.
- 🔐 **Vault · Account Manager:** manage your own compatible account details and sessions. Do not share tokens or credentials.
- 🔄 **Automatic Session Verification:** enabled by default where supported.
- 🛠️ **Advanced Logging:** disabled by default; enable only when diagnosing a problem.

## Tidal refresh token pool

In **Vault · Account Manager**, use **Tidal · Refresh Pool** to enter one or more Tidal OAuth2 **refresh tokens**. Separate tokens with commas (recommended), for example:

```text
REFRESH_TOKEN_1,REFRESH_TOKEN_2,REFRESH_TOKEN_3
```

The current parser also accepts semicolons, whitespace, and new lines, and ignores duplicate entries. **Do not enter an access token, email address, or user ID.** The pool can retry another token when one is unavailable; a successful refresh confirms authentication, **not** direct Tidal audio playback. The pool supports Tidal catalog lookup, while audio playback uses the configured resolvers. Tokens can expire or be revoked.

## Important behavior

**Playback cache:** MySpoti may reuse an already cached version of a track after an engine change. For example, switching from COLIBRÌ to TIGRO does not necessarily replace a previously cached MP3 with FLAC on the same track. This is not proof that the new engine failed to search.

**Audio availability:** Formats and response times depend on the requested track, accessible providers, connectivity, and valid sessions. FLAC/Hi-Res is not guaranteed for every track.

**Credentials:** Some provider credentials in this project were intentionally shared publicly by their owner for testing. They are not guaranteed to remain valid or grant access indefinitely. Never publish your own private account credentials or unredacted diagnostic logs.

## Release notes — 6.0.7 (Build 613)

- Three clearly differentiated audio strategies: TIGRO, WHALE, and COLIBRÌ.
- NUVOLA smart coordination with SOLE compatibility option.
- Source recovery and search-performance improvements carried forward from the 6.0.x development line.
- Updated guidance for switches, account management, and playback caching.

## Credits

Created and maintained by **kekkox88**. Thanks to **Mauro (@solidsnakeater)** for technical contributions and **Lello (@PUNITOR_211080)** for beta testing.

## Support

Before reporting a problem, include the Aura Eclipse version/build, enabled engines, and a redacted MySpoti diagnostic report. **Never publish credentials or session tokens in logs.**

