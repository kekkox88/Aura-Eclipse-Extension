# Aura Eclipse · Nuvola 4.5.0 — Build 384

Estensione audio indipendente per [MySpoti](https://github.com/kota-zo/myspoti). **Autore e manutentore: kekkox88.** ID stabile: `aura.eclipse.tigro`.

> **Nota di distribuzione:** la Build 384 FINAL è pubblicata come `extension.zip` nella [release v4.5.0](https://github.com/kekkox88/Aura-Eclipse-Extension/releases/tag/v4.5.0). I file alla radice di `main` sono allineati alla Build 384. Gli archivi automatici “Source code” della release v4.5.0 contengono lo snapshot precedente del tag.

## Nuvola e i tre motori

- ☁️ **Nuvola** coordina ricerche, cache e risultati condivisi; non è un quarto motore.
- 🐯 **Tigro · HQ Fast** ricerca rapidamente FLAC e Hi-Res.
- 🐳 **Whale · Rare Rescue / Guardian** integra Tigro: prova HQ e poi MP3/AAC per brani rari, edit e remix.
- 🐦 **Colibrì · Eco Stream** privilegia audio compresso e risparmio dati. Disattivalo per utilizzare Tigro + Whale in cascata HQ → lossy.

Quando le fonti non restituiscono audio, MySpoti può utilizzare il proprio fallback Spotify. La cache del player può conservare temporaneamente la sorgente o il codec di un brano già riprodotto: per confronti attendibili usare brani nuovi o svuotare la cache.

## Account, sessioni e diagnostica

La sezione Vault gestisce tre slot Qobuz personali e tre slot Deezer ARL. Le sessioni Aura possono essere verificate automaticamente all'avvio; sono disponibili verifica manuale, manutenzione cache e azzeramento delle attese Qobuz. I Log Dev avanzati sono opzionali e disattivati per impostazione predefinita. Non condividere log contenenti credenziali.

## Installazione e aggiornamenti

Installare il pacchetto `extension.zip` allegato alla [release v4.5.0](https://github.com/kekkox88/Aura-Eclipse-Extension/releases/tag/v4.5.0). Non confondere il file ZIP dell'estensione con il codice sorgente del branch. L'ID resta invariato e il numero di build MySpoti per questa versione è **384**.

## Crediti

- **Aura Eclipse:** kekkox88 — sviluppo e manutenzione delle contribuzioni originali.
- **MySpoti:** [kota-zo/myspoti](https://github.com/kota-zo/myspoti) — piattaforma ospitante indipendente.
- **Ringraziamenti:** Mauro aka @solidsnakeater, Lello aka @PUNITOR_211080 (beta testing), TheWinner02 (progetto Echo).
- **Riferimento tecnico:** [Mornye](https://github.com/mornyeapp/Mornye) e [Mornye-Extension](https://github.com/mornyeapp/Mornye-Extension). Il riferimento non implica affiliazione né prova di riutilizzo di codice.

## Licenza e responsabilità

Le contribuzioni originali di kekkox88 sono proposte con licenza MIT; eventuale codice di terzi mantiene i propri diritti e obblighi. Consultare [LICENSE](LICENSE). Le licenze del progetto ospitante MySpoti e di Mornye non vengono automaticamente trasferite a questa estensione. Prima della distribuzione pubblica devono essere verificati provenienza del codice e diritti di redistribuzione di eventuali credenziali incorporate.
