# Aura Eclipse 6.0.8 · Nuvola · Build 614 ☁️

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

## Release notes — 6.0.8 (Build 614)

- 🌍 Italian and English manifest text in MySpoti, including settings, account and Vault labels, permission explanations, welcome and release notes.
- 📖 Bilingual README.
- 🐯🐳🐦☁️ Tigro, Whale, Colibrì and Nuvola use the same audio logic as Build 613.


## Credits

Created and maintained by **kekkox88**. Thanks to **Mauro (@solidsnakeater)** for technical contributions and **Lello (@PUNITOR_211080)** for beta testing.

## Support

Before reporting a problem, include the Aura Eclipse version/build, enabled engines, and a redacted MySpoti diagnostic report. **Never publish credentials or session tokens in logs.**


---

# 🇮🇹 Guida italiana

**Tre motori audio. Un unico coordinatore intelligente.**

Aura Eclipse è un'estensione audio per MySpoti sviluppata da **kekkox88**. Cerca brani nelle fonti audio compatibili attraverso tre strategie selezionabili e un sistema di coordinamento automatico.

## Per iniziare (30 secondi)

1. Installa **Aura Eclipse** dallo store delle estensioni MySpoti oppure importa il pacchetto della release.
2. Apri **MySpoti → Estensioni → Aura Eclipse** e lascia attivo **TIGRO** per un ascolto HQ rapido.
3. Riproduci normalmente un brano. Attiva **WHALE** per ampliare la ricerca oppure **COLIBRÌ** per ridurre il consumo di dati.
4. Se un servizio richiede l'autenticazione, usa la verifica delle sessioni integrata o **Vault · Account Manager**, secondo necessità. Non tutte le fonti richiedono la configurazione di un account.

**Importante:** non è necessario attivare tutti e tre i motori. Per iniziare, è consigliato usare **solo TIGRO**.

## Quali motori attivare?

| Motore | Predefinito | Funzione | Quando usarlo |
| --- | --- | --- | --- |
| 🐯 **TIGRO · HQ Fast** | **ATTIVO** | Ricerca rapida di FLAC/Hi-Res | Ascolto quotidiano con priorità alla qualità lossless |
| 🐳 **WHALE · Rare Rescue** | Disattivato | Cerca prima HQ, poi MP3/AAC se necessario | Brani rari, edit, remix o brani non disponibili in HQ |
| 🐦 **COLIBRÌ · Eco Stream** | Disattivato | Privilegia MP3/AAC compressi | Risparmio di dati mobili o preferenza per l'audio lossy |

**Configurazioni consigliate**

- **Ascolto HQ:** TIGRO attivo; WHALE e COLIBRÌ disattivati (configurazione iniziale).
- **Recupero più ampio:** attiva WHALE quando desideri un fallback ai formati compressi.
- **Risparmio dati:** usa COLIBRÌ quando preferisci l'audio compresso.

I selettori rappresentano **strategie di ricerca, non tre servizi musicali separati**. Attivarli tutti non è necessario e non garantisce una qualità superiore. Se più motori sono attivi, **COLIBRÌ ha la precedenza su WHALE, che a sua volta precede TIGRO**. La riproduzione dipende anche dalla disponibilità delle fonti e dall'audio già presente nella cache di MySpoti.

## Dietro le quinte

- ☁️ **NUVOLA · Smart Coordinator:** coordina automaticamente le ricerche e gestisce la cache dei metadati; non richiede un selettore dedicato.
- 🌞 **SOLE · Legacy Core:** alternativa di compatibilità in Manutenzione; la modifica si applica dalla richiesta audio successiva.
- 🔐 **Vault · Account Manager:** gestisce i dati e le sessioni dei tuoi account compatibili. Non condividere token o credenziali.
- 🔄 **Verifica automatica delle sessioni:** attiva per impostazione predefinita dove supportata.
- 🛠️ **Log avanzati:** disattivati per impostazione predefinita; abilitali soltanto per diagnosticare un problema.

## Pool di refresh token Tidal

Nel **Vault · Account Manager**, apri **Tidal · Refresh Pool** e inserisci uno o più **refresh token OAuth2** di Tidal, preferibilmente separati da virgole:

```text
REFRESH_TOKEN_1,REFRESH_TOKEN_2,REFRESH_TOKEN_3
```

Il parser accetta anche punti e virgola, spazi e ritorni a capo, ignorando i duplicati. **Non inserire access token, indirizzi email o ID utente.** Il pool può provare un altro token quando il precedente non è disponibile. Un refresh riuscito conferma l'autenticazione, **non** la riproduzione diretta da Tidal: il pool permette la ricerca nel catalogo, mentre l'audio passa attraverso i resolver configurati. I token possono scadere o essere revocati.

## Comportamenti importanti

**Cache di riproduzione:** MySpoti può riutilizzare la versione già memorizzata di un brano dopo il cambio di motore. Per esempio, passando da COLIBRÌ a TIGRO, un MP3 in cache non viene necessariamente sostituito da un FLAC. Questo non dimostra che la nuova ricerca sia fallita.

**Disponibilità audio:** formati e tempi di risposta dipendono dal brano, dai servizi accessibili, dalla connessione e dalla validità delle sessioni. FLAC/Hi-Res non è garantito per ogni brano.

**Credenziali:** alcune credenziali dei servizi impiegate nel progetto sono state condivise pubblicamente dal rispettivo proprietario per i test. Non è garantito che rimangano valide o diano accesso indefinitamente. Non pubblicare credenziali private né log diagnostici non oscurati.

## Novità — 6.0.8 (Build 614)

- 🌍 Testi del manifest in italiano e inglese su MySpoti, comprese impostazioni, voci di account e Vault, motivazioni dei permessi, benvenuto e changelog.
- 📖 README bilingue.
- 🐯🐳🐦☁️ Tigro, Whale, Colibrì e Nuvola usano la stessa logica audio della Build 613.


## Ringraziamenti

Creato e mantenuto da **kekkox88**. Grazie a **Mauro (@solidsnakeater)** per i contributi tecnici e a **Lello (@PUNITOR_211080)** per il beta testing.

## Assistenza

Quando segnali un problema, indica versione/build di Aura Eclipse, motori attivi e un report diagnostico MySpoti con i dati sensibili oscurati. **Non pubblicare mai credenziali o token di sessione nei log.**
