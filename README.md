# Aura Eclipse TWC 1.3.5 — Release (Build 317)

Estensione audio per MySpoti, con tre motori di ricerca e fallback. **Autore: kekkox88.**

**Ringraziamenti:** Mauro aka **solidsnakeater**, Lello aka **PUNITOR_211080** e **TheWinner02** (progetto Echo). Il codice Aura Eclipse attribuisce il pool Qobuz condiviso a `echo-qobuz-extension` 1.0.1; la corrispondenza con i file pubblici di quella versione non è stata verificata indipendentemente.

## Guida rapida

- 🐯 **Tigro · HQ Fast:** ricerca veloce di FLAC e Hi-Res; motore predefinito.
- 🐳 **Whale · Rare Rescue:** ricerca estesa per brani rari, edit e remix; HQ prima, poi fallback MP3/AAC.
- 🐦 **Colibrì · Eco Stream:** privilegia MP3/AAC per ridurre il consumo dati.

**Priorità dei toggle quando più motori sono attivi:** Colibrì > Whale > Tigro. Per usare Tigro, disattiva Colibrì e Whale; per Whale, disattiva Colibrì.

## Account e Vault

Apri il menu dell'estensione in MySpoti e scegli **«Apri la sua pagina»** per raggiungere il Vault. Configura gli account Qobuz personali e i manifest Deezer nelle **Impostazioni**. Non pubblicare token, password, ARL o URL manifest personali. Il Vault non rende segreti i valori già incorporati nel codice distribuibile.

Per Deezer Eclipse, inserisci nel campo **Manifest URL** il tuo link HTTPS personale ottenuto dal servizio previsto dal provider; non inserire il cookie ARL direttamente nel campo.

## Diagnostica e manutenzione

- **Log Dev:** attivalo solo per diagnosi; un codec dichiarato dall'API non equivale a un controllo dei byte audio.
- **Svuota cache:** elimina cache e sospensioni, non gli account.
- **Qobuz · Azzera attese:** rimuove i cooldown temporanei Qobuz senza cancellare gli account.
- **Sessioni Aura:** verifica o reimposta le sessioni senza rimuovere i campi degli account personali.

## Note di rilascio

**1.3.5 TWC (Build 317):** Deezer usa qualità automatica e Whale può riutilizzare il primo MP3 valido senza una seconda richiesta; descrizioni, Welcome (5 passaggi), organizzazione delle impostazioni e documentazione aggiornati. I resolver audio non sono stati modificati rispetto alla Build 317 collaudata.

**ID interno:** `aura.eclipse.tigro`, conservato per compatibilità con le impostazioni esistenti. Versione `1.3.5`, `versionCode` 315.

## Installazione e distribuzione

Il pacchetto `extension.zip` contiene direttamente `manifest.json`, `main.js`, `icon.png`, `README.md` e `LICENSE` alla radice. Conserva una copia della configurazione prima di aggiornare. Per la pubblicazione su GitHub, prepara la release `v1.3.5` e allega il file con nome `extension.zip`; aggiungi il topic `myspoti-extension` al repository se vuoi renderlo individuabile dal catalogo MySpoti. La pubblicazione e l'accettazione nello Store non sono garantite dal solo superamento dei test statici.

## Licenza e attribuzioni

Consulta `LICENSE` per i termini applicabili al codice incluso. La disponibilità pubblica dei resolver o dei token non dimostra, da sola, un'autorizzazione a redistribuire le credenziali: verificare gli accordi con i rispettivi autori prima della diffusione.
