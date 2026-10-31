# Blokkverden — iterasjonslogg

Original voxel-sandkasse. Ingen Mojang-assets.

## Iterasjon 18 (2026-10-31)

Start: lør. 31. okt. 01:50 CET · Slutt: lør. 31. okt. END CET (~MIN min) · gren `dev` (ikke publisert)

### Fokus
Feiljakt med ekte tastatur/mus i Chromium (nytt `scripts/it18-explore.ts`: tårnhopp, sniking langs kant/brobygging, stiger, dører, vannlanding, Q-slipp, søvn, graving under vann). Så tre små MC-ting rundt planter: beinmel, blomster, vann som vasker bort planter. `__bv` bare til oppsett.

### Fikset
1. Vann rant inn i chunker som ikke var generert ennå. Det genererte nye chunker i det uendelige (81 → 157 chunker på 200 tikk i test), og brukte opp hele vannbudsjettet. Vann du helte ut i nærheten sto derfor stille i opptil 30+ s (W1 feilet i full kjøring). Nå renner vann aldri inn i ugenererte chunker. Nærmeste chunker tikkes først, og 3×3 chunker rundt spilleren har 400 oppdateringer per tikk
2. Stiger: du måtte holde mellomrom for å klatre, og Shift fikk deg til å suse ned. Nå som MC: gå inn i stigen (W) for å klatre (~2,35 blokker/s), Shift holder deg på stedet, uten taster sklir du ned (maks 3 blokker/s). Du klatrer over kanten på toppen, uten fallskade
3. Dører var bare én blokk (øvre halvdel var luft): klikk på øvre del gikk tvers gjennom, du kunne bygge inn i døra, og den svevde når gulvet ble fjernet. Nå oppfører døra seg som 2 blokker høy: øvre halvdel kan siktes på (høyreklikk åpner/lukker, også med en blokk i hånda, som i MC), og ingenting kan plasseres der. Døra krever 2 ledige ruter og gulv, vender mot den som plasserer den, faller av som ting når gulvet fjernes, og stopper vann
4. Graving gikk like fort under vann og i lufta. Nå som MC: 5× tregere med hodet under vann og 5× tregere når du ikke står på bakken (land 0,7 s → under vann 2,9 s for jord med hånda)
5. Partikler når du knuser blokker var alltid brune. Nå får de fargen til blokkas tekstur (grønt løv, sandfarget sand, grå stein)
6. Vann vasket ikke bort planter. Nå bryter rennende vann fakler, rødtråd, avlinger, spirer, høyt gress og blomster til ting (som i MC)

### Nye funksjoner (3)
- Beinmel: 1 bein gir 3 beinmel. Høyreklikk på avling gir +2–5 vekststadier (ingenting brukes på moden avling). På spire er det 45 % sjanse for at treet vokser med en gang, og beinmelet brukes uansett. På gressblokk sprer det seg høyt gress og noen blomster innen 3 blokker. Grønne partikler
- Blomster: løvetann og valmue (egne teksturer) finnes spredt på gress i slette og skog. De er X-modeller uten kollisjon, knuses med en gang, gir seg selv, plantes på gress, jord eller åkerjord, og faller av og vaskes bort
- Vann vasker bort planter og fakler (se fiks 6)

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (`scripts/core-playtest.ts`, endelig bygg; H2 trenger fortsatt ett nytt forsøk i headless, som før)
- it18-verify: **8/8 PASS** (`scripts/it18-verify.ts`: FL1, BM0–BM3, FL2, W1, PC1)
- it18-explore: **11/11 PASS** (`scripts/it18-explore.ts`: X1 tårnhopp, X2 brobygging, X3 gå gjennom planter, X4 grave ned, X5 tak + hopp, X6 stige, X7 dør, X8 vannlanding, X9 Q-slipp, X10 søvn, X11 graving under vann)
- Regresjon: it17-verify 13/13, it16-verify 6/6
- 114 vitest grønne (17 nye: beinmel, blomster, vannvask, vannbudsjett/ingen nye chunker, dører blokkerer vann, partikkelfarge, stiger, dører, gravestraff)
- Ny seksjon P i CORE-PLAYTEST.md

### Kjente begrensninger
- Beinmel på høyt gress gjør ingenting (MC: dobbelt høyt gress finnes ikke ennå)
- Dørens kollisjon er hele blokka når den er lukket (MC: tynt panel). Merkeboksen rundt stige er en hel blokk
- Flint brukes fortsatt bare til piler (ingen fyrstål eller ild ennå)
- Sand og grus faller fortsatt umiddelbart (ingen fallanimasjon)

### Media
public/progress/it18/ (lokalt på `dev`, ikke publisert): skjermbilder it18-00…08, it18-x1/x2/x6/x7, klipp `clip-it18-beinmel.webm`, `clip-it18-blomster.webm`, `clip-it18-vann-vasker.webm`

---

## Iterasjon 17 (2026-10-31)

Start: lør. 31. okt. 00:51 CET · Slutt: lør. 31. okt. 01:20 CET (~29 min) · gren `dev` (ikke publisert)

### Fokus
Feiljakt med ekte tastatur/mus i Chromium: sikting på små blokker, jordbruk, hopp, lagring av løvforfall. Så tre MC-ting som henger sammen med trær/gress: høyt gress, spirer, grus. `__bv` bare til oppsett.

### Fikset
1. Fakler, avlinger, rødtråd, stiger, spaker osv. kunne ikke siktes på — strålen gikk rett gjennom dem (fra it1). Fakler kunne derfor ikke fjernes, og «høste» traff jorda under. Nå kan alt med omriss siktes på og knuses med venstreklikk, som i MC
2. Gressblokk ga frø i 12 % av tilfellene *i stedet for* jord (MC: alltid jord). Frø kommer nå fra høyt gress
3. Knuser du blokka under en avling/spire/høyt gress, faller planten av som ting (før: svevde avlingen i lufta; bare fakkel/rødtråd/trykkplate falt av)
4. Avlinger var en halvgjennomsiktig boks (gul søyle når moden). Nå MC-modell med fire plan («#») og nye hvete-teksturer: grønne strå som vokser, gylne aks når moden
5. Kort trykk på mellomrom (kortere enn ett bilde, eller rett før du lander) ga ikke hopp ved lav fps → trykket huskes i 0,15 s. Kjernetest B2 feilet på dette i to runder i kveld
6. Ventende løvforfall ble ikke lagret — lagret du rett etter hogst, ble løvet hengende for alltid. Nå lagres det med gjenstående tid, og venter til chunken er lastet etter innlasting
7. Pil ble laget av brostein + pinne + fjær; nå MC: flint + pinne + fjær (4 piler). Kjernetest F12 lager den via arbeidsbenken
8. Kjernetestens `flatPad` lot spilleren falle ~14 blokker mens området ble generert (−10 liv før B2). Står nå på en midlertidig blokk

### Nye funksjoner (3)
- Høyt gress: tuster på gress i slette/skog (X-modell, ingen kollisjon), knuses med en gang, 12,5 % frø. Plasserer du en blokk mot det, erstatter blokka gresset (MC «replaceable»). Mobber kan spawne i det
- Spirer: løv gir spire 5 % (+ pinner 2 %, eple 0,5 %). Plantes bare på gress/jord/åkerjord, ingen kollisjon, vokser til en eik etter noen minutter når det er lys (≥ 9) og plass; gresset under blir jord
- Grus og flint: grus faller som sand, gir flint 10 % (ellers grus); finnes i klumper i stein og på havbunnen

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`, endelig bygg; H2 trenger fortsatt ett nytt forsøk i headless, som før)
- it17-verify: **13/13 PASS** (`scripts/it17-verify.ts`: N0, P1–P4b, G1–G2, S1–S3, J, L3; ny seksjon O i CORE-PLAYTEST.md)
- 97 vitest grønne (13 nye: drops for gress/høyt gress/grus/løv, planter, spirevekst, grus-tyngde, løvforfall lagret/venter på chunk, pil-oppskrift)

### Kjente begrensninger
- Partikler når du knuser planter er brune (jordfarge), ikke grønne
- Ingen beinmel ennå (spirevekst kan ikke fremskyndes i spillet)
- Sand/grus faller fortsatt umiddelbart (ingen fallanimasjon)
- Flint brukes bare til piler ennå (fyrstål kommer senere)
- Vann bryter ikke høyt gress/avlinger slik som i MC

### Media
public/progress/it17/ (lokalt på `dev`, ikke publisert)

---

## Iterasjon 16 (2026-10-30/31)

Start: fre. 30. okt. 23:46 CET · Slutt: lør. 31. okt. 00:33 CET (~47 min) · gren `dev` (ikke publisert)

### Fokus
Feiljakt med ekte tastatur/mus i Chromium: graving under sand, hogst av trær, lys/farger midt på dagen, kjernetesten. `__bv` bare til oppsett.

### Fikset
1. Verden var halvmørk midt på dagen: blokker viste ~55 % av teksturfargen og sidene ~30 % (gjørmete sand, nesten svarte gress-sider). Nå jevnt himmellys som i MC: full farge på toppen, sidene skygges bare med MCs faste sideskygge; natta er like mørk som før
2. Løv ga eple 8 % og pinner 10 % → nå som MC eik: eple 0,5 %, 1–2 pinner 2 %
3. Kjernetest I2 prøvde å lage mobber med ukjente navn («zombi»/«skjelett») → bestod bare hvis det tilfeldigvis gikk mobber rundt (ble PARTIAL i denne runden). Bruker nå `vandrer`/`bueskytt` og krever en fiendtlig mobb
4. Sand som landet i hodet løftet deg opp gjennom blokka, og kameraet så gjennom verden (røntgen). Nå: fast, ser sandteksturen, kveles (se ny funksjon)
5. Landsbyer/ruiner/fangehull ble først bygd når du kom innen 2 chunks — hus «poppet» opp rett ved deg, oppå det du hadde bygd, eller rundt deg (fanget spilleren). Nå bygges de innen ~2 s etter at terrenget genereres, langt utenfor rekkevidde (som MC), og aldri innen 2 chunks fra der du står når verdenen starter/du teleporteres (en ny verden startet med spilleren inne i en husvegg). Funnet fordi kjernetest B3 plutselig sto fast inne i en husvegg
6. Helt mørke huler (lys 0) var gråe og godt synlige; nå nesten svarte som i MC, mens fakkel-/dagslys er like sterkt eller sterkere enn før (ny lyskurve)
7. Kjernetest-padden (`flatPad`) venter nå til terreng og bygninger rundt er generert før den flates ut

### Nye funksjoner (3)
- Fallende sand: knuser du blokka under en sandsøyle faller hele søylen; sand plassert i lufta faller ned (gjennom vann), og blir til en ting hvis den lander på en fakkel. Også etter eksplosjoner
- Kvelning som i MC: hodet inne i en hel blokk → ½ hjerte hvert 0,5 s og blokkteksturen dekker skjermen; grav deg ut
- Løvforfall: hugger du et tre, forsvinner løvet gradvis over ~2–20 s (ikke løv som fortsatt er innen 6 av en annen stamme). Løv du plasserer selv forsvinner aldri

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`, endelig bygg) — kjørt alene etter siste endring; H2 (spise) trenger fortsatt ett nytt forsøk i headless, som før
- it16-verify: **6/6 PASS** (`scripts/it16-verify.ts`: V, S1–S3, L1–L2; ny seksjon N i CORE-PLAYTEST.md)
- 84 vitest grønne (13 nye: fallende sand, løvforfall, løvdrop-rater, kvelning/fysikk, lyskurve)

### Kjente begrensninger
- Sand faller umiddelbart (ingen synlig fallanimasjon ennå)
- Ventende løvforfall lagres ikke: lagrer du midt i forfallet, blir resten av løvet hengende
- Løv plassert før it16 regnes ikke som «plassert av spiller»
- Ingen grus og ingen spirer ennå (spirer fra løv kommer senere)

### Media
public/progress/it16/ (lokalt på `dev`, ikke publisert)

---

## Iterasjon 15 (2026-10-30)

Start: fre. 30. okt. 22:07 CET · Slutt: 23:0x CET (~60 min)

### Fokus
Feiljakt i nattkamp og eksplosjoner med ekte tastatur/mus i Chromium: knallbolle, mobbedrops, mat, håndverk, huler. `__bv` bare til oppsett. Testene for kamp i core-playtest (I3/I4) brukte `__bv` til selve slaget — nå ekte museklikk.

### Fikset
1. Knallbolle eksploderte ~9 ganger på rad (én gang per bilde i dødsanimasjonen) → drepte deg nesten uansett avstand. Nå nøyaktig én eksplosjon; døende mobber gjør ingenting
2. Eksplosjoner som i MC (stråle-modell med sprengmotstand): krater i gress/jord og litt i stein, kister/ovner sprenges og mister innholdet på bakken, fakler faller av, 1/3 av blokkene slippes som ting; skade etter avstand og dekning (vegg skjermer). Før: stein var immun, kister forsvant aldri, skaden ignorerte vegger
3. Mobbedrops som i MC: vandrer → råttent kjøtt, vever → tråd, knallbolle → krutt (ikke hvis den sprenger seg selv). Før ga alle tre kull
4. Bue lages av 3 pinner + 3 tråd (før lær), fiskestang av tråd (før fjær), 4 tråd → ull
5. Knallbolle-modell: fire korte bein, ingen armer, ansikt bare på hodet (før: armer og «ansikter» på alle kroppsdeler); 20 liv som i MC
6. Ingen mobber spawner oppå trekroner (før sto skjelett i tretoppene og skjøt)
7. Ingen XP når en knallbolle sprenger seg selv

### Nye funksjoner (2)
- Råttent kjøtt: +4 sult, 80 % sjanse for sult-effekt i 30 s (grønn sultlinje, tømmes raskere)
- Fiendtlige mobber spawner i mørke huler (lys < 8), også om dagen; fakler holder hulene trygge

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`, kjørt alene på endelig bygg; I3/I4 nå med ekte klikk)
- it15-verify: **6/6 PASS** (`scripts/it15-verify.ts`, X1–X6, ny seksjon M i CORE-PLAYTEST.md)
- Naturlig nattøkt (`scripts/it15-session.ts`, ~100 s natt i ny verden med steinsverd): drepte edderkopper/vandrer/bueskytter, 1 død av knallbolle, 0 JS-feil; fant feilen med mobber i tretoppene
- 71 vitest grønne (10 nye), npm audit 0 sårbarheter, secrets-scan rent

### Kjente begrensninger
- Fakkellys under jorda er svakere enn i MC
- XP-kuler er grønne kuber (store når de flyr rett mot kamera)
- Mobber i vann brenner ikke i sola (som MC), men vandrere kan bli stående i vannkanten
- Styreflate-hjul og ekte Mac-GPU-fps kan ikke måles headless

### Media
https://thomasaitest.github.io/blokkverden/progress/it15/

---

## Iterasjon 14 (2026-10-30)

Start: fre. 30. okt. 20:01 CET · Slutt: 20:49 CET (~48 min)

### Fokus
Lengre overlevelsesøkter med ekte tastatur/mus i Chromium: grave rett ned, malm og hakkenivåer, ovn → jernhakke, mat, kister, natt → morgen, creeper, fakler i sjakter. `__bv` bare til oppsett.

### Fikset
1. Grunnfjell i bunnen av verden (y=0, litt på y=1–2): man kan ikke lenger grave seg ut av verden; gamle lagrede verdener får grunnfjell når de lastes. Kan knuses i kreativ (umiddelbart, som MC)
2. Hakkenivåer som i MC: jernmalm krever steinhakke, gull/diamant krever jernhakke; brostein/ovn krever hakke. For svak hakke graver tregere og gir ingenting
3. Rått kjøtt kan stekes i ovnen («Stekt kjøtt», +8 sult); kuer gir også kjøtt, skjeletter gir bein og piler
4. Knuse en kiste/ovn slipper innholdet på bakken (før forsvant alt)
5. Vandrere/bueskyttere brenner i sola under åpen himmel (glødende) — før skjedde det i praksis aldri. Under tak, i vann og om natta brenner de ikke; knallboller brenner ikke
6. Knallbolle: står stille mens den freser, slår ikke i nærkamp, og lunta går tilbake hvis du løper unna (> 7 blokker). Før ble lunta aldri nullstilt → eksploderte med en gang neste gang
7. Plukket opp ting dukker opp i hotbaren med en gang (før ble hotbaren ikke tegnet på nytt), + «plopp»-lyd
8. Egne ikoner for hakke/øks/spade/sverd/krafse per materiale, bue, pil og rustning (før så alle tre-verktøy like ut, jern var en grå firkant)
9. Fakler (og andre ikke-solide blokker) kan settes der du står, f.eks. i bunnen av en 1×1-sjakt; fakkel faller av når blokka under knuses
10. Skyggelegging (AO) som i MC: 1×1-sjakter og tunneler er ikke lenger kullsvarte
11. F3-feilsøking er skjult som standard (og F3-tasten virker nå — sjekket feil tastekode); norsk tekst i F3; «Trehakkejord» → «Trekrafse», «Kreativt inventar»

### Ny funksjon (1)
- Navnet på valgt gjenstand vises over hotbaren i ~2 s når du bytter (som i MC)

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`, kjørt flere ganger)
- it14-verify: **13/13 PASS** (`scripts/it14-verify.ts`, V1–V12, ny seksjon L i CORE-PLAYTEST.md)
- Naturlig økt (`scripts/it14-session.ts`): gikk, gravde fra y≈29 ned til grunnfjell med steinhakke (fikk jernmalm), satte fakkel i sjakta, natt → morgen; 0 JS-feil, 21–45 fps (swiftshader)
- Gammel bygg (it13) feilet V9 (plukket ting vises ikke i hotbar) — bekreftet ekte feil
- 61 vitest grønne (11 nye), npm audit 0 sårbarheter, secrets-scan rent

### Kjente begrensninger
- Fakkellys under jorda er svakere enn i MC (blokklys ganges med sol-/omgivelseslys i rendereren)
- Huler har ingen mobber (spawn bare på overflaten); vandrer/edderkopp/knallbolle slipper fortsatt kull
- Knallbolle-eksplosjon knuser ikke stein og ikke kister/ovner
- Styreflate-hjul og ekte Mac-GPU-fps kan ikke måles headless

### Media
https://thomasaitest.github.io/blokkverden/progress/it14/

---

## Iterasjon 13 (2026-10-30)

### Fokus
Feiljakt for en ekte spiller i Chrome på Mac: pekerlås/Esc, inventar, mus/styreflate, mobber, HUD, avslutt/gjenåpne. Ekte tastatur/mus i Chromium; `__bv` bare til oppsett.

### Fikset
1. Esc / mistet pekerlås (Cmd+Tab) åpner pausemenyen (headed Chrome sluker Esc-tasten); taster som var holdt nede slippes (ingen «fast» W)
2. Esc i inventaret lukker det uten å åpne pause; før ble `inventoryOpen` stående → WASD død
3. Lukke inventar (E) og «Gjenoppstå» fanger musa igjen som i MC; klikket som fanger musa plasserer/knuser ikke lenger blokker
4. «Til tittel» avslutter økta: før fortsatte gammel løkke å rendre og autolagre gammel tilstand over den gjenåpnede verdenen; WebGL-kontekst og mesh-worker frigjøres
5. Raske musebevegelser kappes ikke lenger (±40 px) — bare OS-hopp > 600 px forkastes
6. Hotbar-scroll: ett hakk = én plass; Mac-styreflate summeres (snurret før gjennom hele hotbaren)
7. Mobber: nærkamp krever vertikal overlapp + siktlinje, skjelettpiler går ikke gjennom vegger/tak (søyle og ly er trygt som i MC)
8. Mob-landing: `ceil()` løftet mobber en hel blokk ved landing → klatret opp på kanter/søyler
9. «Håndverk»-fremskritt kom ved blokkplassering; nå bare ved craft på arbeidsbenk
10. HUD: tomme hjerter synlige (også på dødsskjermen), fast bredde så sult/hjerter ikke forskyves; «Respawn» → «Gjenoppstå»

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`, kjørt etter hver fiks)
- it13-verify: **14/14 PASS** (`scripts/it13-verify.ts`, P1–P11)
- 50 vitest grønne (nye: kontroller, hjul, siktlinje, mob-landing), npm audit 0 sårbarheter, secrets-scan rent

### Kjente begrensninger
- Styreflate-hjul kan ikke syntetiseres via CDP; dekkes av enhetstest
- Headless swiftshader gir ~17–28 fps; ekte Mac-GPU ikke målt

### Media
https://thomasaitest.github.io/blokkverden/progress/it13/

---

## Iterasjon 12 (2026-10-30)

### Fokus
Feiljakt i overlevelseskjernen mot Minecraft-oppførsel (Chromium, ekte tastatur/mus).

### Fikset
1. Drop-fysikk: ting teleporteres ikke lenger til overflaten; Q-drop; død slipper også rustning; full inventar håndteres
2. Tom start i overlevelse; strukturer lagres per verden
3. Ingen sprint ved sult ≤ 6; sult-skade som i MC (½ hjerte / 4 s, stopper på ½ hjerte, ignorerer rustning); fallskade ignorerer rustning
4. HUD: hjerter/sult ikke lenger under XP-linja, halve hjerter; ekte ikoner på drops
5. Løv og vann tegnes til full sikteavstand
6. Hold høyreklikk for å spise (1,6 s, ikke ved full sult); seng setter alltid gjenopplivingspunkt + melding, ingen gratis heling ved søvn
7. Drops av samme type slås sammen; ulastede chunks er solide (ingen fall gjennom verden)
8. Playtest-skript: mer robust sprint/spise-test (swiftshader-hakk), ingen hengende vite preview

### Playtest
- Core: **56 PASS / 0 FAIL / 0 PARTIAL** (ny F12 pil) (`scripts/core-playtest.ts`)
- it12-verify: **8/8 PASS**
- 42 vitest grønne, npm audit 0 sårbarheter, secrets-scan rent

### Media
https://thomasaitest.github.io/blokkverden/progress/it12/

---

## Iterasjon 11 (2026-10-30)

### Fokus
Full `docs/CORE-PLAYTEST.md` i Chromium med ekte tastatur/mus. Retake av misvisende it10-skjermbilder. Stash med pt-*-media droppet (HEAD bedre).

### Fikset
1. Kan ikke plassere blokk i spiller-AABB (D2 self-place, MC-oppførsel)
2. Craft-e2e: høyreklikk én-og-én i rutenett + deposit i alle 36 slots
3. Natt-spawn bruker block light (ikke full skylight)
4. Fallskade-test innen CHUNK_HEIGHT; drukning med vann rundt hodet
5. Ovns-UI åpnes pålitelig etter craft; K-survival fra tømmer → natt
6. Retake: `partial-k6-shelter.png` (hytte+fakkel), `partial-i2-night.png` (fiender)

### Playtest
- **55 PASS / 0 FAIL / 0 PARTIAL** (`scripts/core-playtest.ts`)
- Media: `public/progress/it11/`

### Release
- vitest, npm audit, secrets scan før push til main + Pages

---

## Iterasjon 1 (2026-10-29)

### Bygget
1. Chunket uendelig terreng med seedet støy (sletter, åser, trær, strand/sand, havnivå)
2. Face-culled chunk-meshing med enkel ambient occlusion (budsjettert remesh)
3. Førsteperson med pointer lock: WASD, Space, Shift snike, Ctrl/R sprint
4. AABB-fysikk, kollisjon og tyngdekraft
5. Knusing (hold + progresjon) og plassering med raycast + outline
6. Hotbar 1–9 + scroll (+ touch-tap på slots)
7. Blokksett: gress, jord, stein, brostein, tømmer, planker, løv, sand, glass, vann (placeholder)
8. Dag/natt-himmel med sol og enkel belysning
9. Crosshair + F3-debug (fps, xyz, chunk) + **touch-kontroller** (styrespak, se-dra, hopp/knus/plasser)
10. Lagre/laste verden i IndexedDB (autosave)

### Playtest (headless Chromium, 1280×720)
- ~56 fps ved spawn, 57 chunks lastet
- Gange, hopp, knus og plasser fungerte via `__BV`-API
- Skjermbilder + 2× webm under `public/progress/it1/`

### Bugs funnet
0. ~~Feil atlas-UV (flipY)~~ — fikset før publish
9. Hull / manglende flater ved enkelte vinkler (winding/culling) — midlertidig DoubleSide
1. Y-kollisjon kan gi mikro-float (y ≈ N.00000015) — trenger mer robust snaps
2. Trær klippes på chunk-kanter (løv mangler i nabochunk)
3. Vann er bare en stillestående translucent blokk (ingen strøm/svømming)
4. Meshing på main thread → korte hitch ved chunk-last
5. Knusing er «instant» via API / for rask uten verktøy-forskjell (bare breakTime)
6. Sprint på Ctrl kan kollidere med nettleser-snarveier
7. Ingen fotspor/lyder — verden føles stille
8. Glass/løv-sortering: transparent depth ikke perfekt

### Plan iterasjon 2 (~10)
1. fix: robust Y-snap / stepping (ikke sveve eller falle gjennom)
2. fix: trær genereres over chunk-grenser
3. feat: inventar-UI (E) med 36 slots + hotbar-kobling
4. feat: crafting 2×2 i inventar + oppskrifter (planker, crafting table)
5. feat: crafting table 3×3
6. feat: verktøy (tre-hakke/-øks/-spade/-sverd) med hardhet/mining speed
7. feat: droppete gjenstander i verden + plukk opp
8. feat: helse + hunger (enkle hjerter/kjøtt)
9. feat: fakkel + enkel lyspropagasjon i chunk
10. feat: flere biomer (skog, ørken, snø) + underjordisk stein/malm-start

Media: https://thomasaitest.github.io/blokkverden/progress/it1/

## Iterasjon 2 (2026-10-29)

### Bygget
1. fix: robust Y-snap + step-up (~1 blokk) og fallskade
2. fix: trær over chunk-grenser (pending decorations + setAbs)
3. fix: face-culling med FrontSide (fjernet DoubleSide); separat opaque/transparent mesh
4. Transparent depthWrite=false for vann/glass/løv
5. Inventar (E) med dra/slipp, 36 slots + hotbar
6. Crafting 2×2 i inventar
7. Arbeidsbenk 3×3 (høyreklikk) med oppskrifter (planker, pinner, benk, tre-/steinverktøy)
8. Tre-/steinverktøy med mining speed + durability
9. Item-drops i verden + plukk opp
10. Helse/hunger-HUD + fallskade; sprint via dobbel-W (Ctrl som alt)

### Playtest
- ~56 fps, 66 chunks; inventar/arbeidsbenk/drops OK
- Media: `public/progress/it2/`

### Bugs funnet
1. Inventar-FPS dropper mens overlay er åpent (DOM re-render)
2. Crafting-UI støtter ikke «shift-klikk» / oppskriftsbok
3. Drops er fargede kuber (ikke item-billboards med atlas)
4. Vann mangler fortsatt strøm/svømming
5. Hunger synker litt raskt ved sprint
6. Meshing fortsatt på main thread
7. Ingen lyd
8. Arbeidsbenk åpnes via API i playtest — høyreklikk-mål kan miss’e hvis man holder blokk

### Plan iterasjon 3 (~10)
1. feat: fakkel + lyspropagasjon
2. feat: biomer (skog, ørken, snø) + malm (kull/jern)
3. feat: ovn (furnace) med smelting
4. feat: kiste med lagring
5. feat: vannstrøm + svømming
6. feat: enkle mobs (gris/ku) + drops mat
7. feat: spise mat for hunger
8. feat: bedre drop-rendering (atlas-sprites)
9. feat: oppskriftsbok / shift-craft
10. fix: meshing i worker + mindre hitch

Media: https://thomasaitest.github.io/blokkverden/progress/it2/

## Iterasjon 3 (2026-10-29)

### Bygget
1. Chunk-meshing i Web Worker (+ synk-fallback)
2. Fakkel + sky-/blokkllys (flood fill per chunk)
3. Biomer (ocean, beach, plains, forest, desert, snow) + huler + malm (kull/jern/gull/diamant)
4. Ovn med smelting + drivstoff
5. Kiste med 27 slots (lagret)
6. Rennende vann + svømming/drukning (luftbobler)
7. Spise mat (eple fra løv, bakt eple)
8. Tregere hunger
9. Drops som boblende/roterende mini-kuber
10. Shift-klikk + oppskriftsbok; worker reduserer inventar-hitch

### Playtest
- ~38 fps, 74 chunks, tørr spawn, fakkel om natten, ovn/oppskrifter OK
- Media: `public/progress/it3/`

### Bugs funnet
1. Lys propagerer ikke godt over chunk-grenser (kun kant-seed)
2. Vannfylling kan være treg / flommer flatt
3. Drops bruker tintet atlas, ikke perfekte per-face UV
4. Oppskriftsbok er kun liste (ikke klikk-for-å-plassere mønster)
5. Ovn-UI refreshes hvert 200ms (lite flimring)
6. FPS fortsatt ~35–45 i dense chunks
7. Ingen lyd / mobs ennå
8. Diamant/jern-verktøy mangler (bare tre/stein)

### Plan iterasjon 4 (~10)
1. feat: jern-/diamantverktøy + rustning start
2. feat: enkle mobs (ku/gris/zombie om natten)
3. feat: senger / respawn
4. feat: bedre lys over chunk-grenser
5. feat: lyd (steg, knus, vann, ovn)
6. feat: bue / kamp
7. feat: mer biomer-detalj (kaktus, snølag)
8. feat: kart-item
9. fix: vannnivå-rendering (delvis blokk)
10. feat: achievements / første hub-lenke

Media: https://thomasaitest.github.io/blokkverden/progress/it3/

## Iterasjon 4 — ytelse, lys, lyd, mobber, kamp, seng, vannnivå

**FPS:** før ~38 (it3, radius 4) → etter walk ~56 (radius 6, ~147 chunks). Mål 60@6–8 delvis nådd; ytterligere atlas/frustum-finpuss står.

### Levert
- Ytelse: VIEW_RADIUS 6, delt atlas/materiale, meshesDirty + meshRevision, remesh/lys-budsjett, pixelRatio=1, fog nærmere
- Lys over chunk-grenser (flood til lastede naboer)
- WebAudio SoundBus: steg per materiale, break/place, hurt, eat, ambient
- Passive: gris, ku, sau, høne (+ drops); fiender natt: vandrer, bueskytt, vever, knallbolle (eksplosiv, original)
- Kamp: melee, knockback, krits; bue/piler; rustning reduserer skade
- Jern-/diamantverktøy + rustningsplasser
- Seng: søvn hopper natt + respawn; dødsskjerm + respawn
- Vannmesh med waterLevel (flate/flow)
- Save v4 (respawn, armor)

### Media
`public/progress/it4/` — 01-spawn … 06-respawn, clip-mobs-kamp.webm, clip-utforsk-seng.webm

### Tester
22 vitest grønne; Playwright headless playtest

## Iterasjon 5 — ytelse, playtest-hooks, XP, jordbruk, båt, verdener, UI

**FPS:** før ~38 (it4 walk r6) → etter walk **~38** ved radius 7 (~178 chunks) i headless Chromium. State ~33. Mål 60@7–8 delvis: frustum/LOD for transparent, versioned mesh-sync, færre per-frame allocs, vann-tick tøyler; headless GL underdriver vs ekte GPU. Innstilling for renderavstand 3–10.

### Playtest-kvalitet
- `?test=1` → fersk verden + `window.__bv` (teleport, setTime, spawnMob, give, lookAt, waitForMeshes, buildPlatform, …)
- Staged scener; alle PNG visuelt sjekket. Fix: FP-armor-mesh dekket hele view (slått av; HUD-slots viser rustning).

### Levert
- Ytelse: VIEW_RADIUS 7 (justerbar), transparent LOD, versioned syncChunks, water tick sjeldnere, fog tilpasset
- Bedre mob-pathing (step-up 1, unngå vann/stup), multi-del mob-mesh + bob
- XP-orbs + nivå + fortryllelsesbord (enkel enchant)
- Jordbruk: hoe, åkerjord, avling/vekst, brød; frø
- Båter (plasser + mount)
- Verdenvelger (flere lagre v5) + tittelskjerm + pause/innstillinger (renderavstand, FOV, sens, volum)
- Touch: sneak/E/pause-knapper
- Bevegelse nærmere klassisk (walk 4.317 / sprint 5.612 / hopp)
- Save v5 multi-world; daglengde 900s

### Media
`public/progress/it5/` — 00-tittel … 12-respawn, clip-mobs-kamp.webm, clip-farm-bat-seng.webm

### Tester
22 vitest grønne


## Iterasjon 8 (2026-10-29) — kvalitet, greedy mesh, rødtråd, seng, lagring

**Tid:** start 20:14 CET → slutt 21:09 CET (~55+ min). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. `buildPlatform` hadde feilaktig Helvete-portal-kode inni seg — fjernet
2. Helvete-transit overskrev overworld-chunks — deaktivert (portal kun visuell)
3. Portal-ramme matchet ikke lighting → 0 portalblokker — ny 4×5 `buildPortalFrame`
4. `setWater`/`chunk.set` slettet meta på spak/dør — ny `setMeta`
5. Bevegelse speilvendt mot kamera/raycast — fikset wish→world
6. `give()` valgte ikke hotbar-item — select/swap
7. Atlas-ikon-UV feil etter utvidet atlas — fikset ATLAS_W/H

### Nye features (verifisert)
1. Greedy meshing (enhetstest flat pute <80 tris)
2. Synlig rødtråd (glow-tile + partikler; lampe lyser når powered)
3. Seng: søvn hopper natt + respawn
4. Verdenlagring: rename + slett med bekreftelse

### Perf walk @r7 headless
- merge av: ~40 fps, draw 97, tris ~48k
- merge på: ~58 fps, draw 57, tris ~55k

### Media
`public/progress/it8/`

### Tester
29 vitest grønne

## Iterasjon 9 (2026-10-29) — kvalitet, båt/fiske/dør/lampe, Helvete-dimensjon

**Tid:** start 21:12:58 CET → slutt 22:08 CET (~56 min + CI). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. Båt: mount-avstand for stor + styring — mount innen rekkevidde, vannlinje-visning, sneak-avstigning
2. Fiske: bite/reel upålitelig — 8s bite-vindu, alltid RawFish ved bite; castFish tvinger IKKE lenger; naturlig bite 3/3 wall-clock + 5/5 verify
3. Dør: gjennomsiktig hull — egen svingbar mesh (ikke greedy), opaque, lukket/åpen skudd
4. Lampe: lite synlig «på» — hoppet over greedy mesh, BasicMaterial mørk/av vs lys/på + PointLight, natt-par
5. Helvete: overworld-korrupsjon (it8) — separat chunk-store per dimensjon, round-trip-test

### Nye features (verifisert)
1. Helvete som egen dimensjon/chunk-store (Helstein, Sjelegrus, lava, rød himmel) — portal begge veier; OW urørt etter retur (unit + playtest)
2. 3D-skilttekst (canvas på stolpe) — «Hei / Blokk» verifisert

### Verifisert fungerer
- Båt mount / styre / dismount + vannlinje
- Fiske: naturlig bite (uten forceInstantBite) 3/3 wall-clock + 5/5 i verify
- Dør mesh lukket/åpen (ikke transparent)
- Lampe av (mørk) vs på (emissiv + glow) natt-par
- it8-regresjon: portal 6 indre, give velger hotbar, seng, build
- Helvete round-trip + peekBlock OW-integritet
- 3D-skilt

### Media
`public/progress/it9/` (+ webm)

### Tester
31 vitest grønne (inkl. helvete-dim dual-store)

Media: https://thomasaitest.github.io/blokkverden/progress/it9/

## Iterasjon 10 (2026-10-29) — dør-gap, Helvete-himmel/lava, portal, ulv

**Tid:** start 22:09:55 CET → slutt ~23:10 CET (~60 min). Kvalitet over kvantitet.

### Bugs funnet og fikset
1. Dør åpen: terskel-gap (sky) — sill + 2-blokk flush panel
2. Helvete-himmel blek/hvit — `setDayTime` hvert frame overskrev dim-vis; nå `applyHelveteSky` (rød/mørk)
3. Helvete: få lava nær spawn — lavere terrengbaseline + lavaTop 28; synlig Glødstein-klynger
4. Portal-foto: isolert klar 4×5 tent ramme (6 portal + 14 frame)
5. Ulv-temming: rekkevidde/approach før bone-interact

### Nye features (verifisert)
1. Ulv (`ulv`): temmes med Bein, følger spiller, sitt/stå-toggle

### Verifisert fungerer
- Dør lukket/åpen uten terskel-hull
- Helvete rød himmel/fog (ikke blek)
- Lava-sjøer + glødstein i Helvete
- Portal full tent ramme
- Round-trip OW urørt
- Båt, fiske naturlig 3/3, lampe av/på, skilt, seng
- Ulv tame/follow/sit

### Media
`public/progress/it10/` (+ webm)

### Tester
31 vitest grønne

Media: https://thomasaitest.github.io/blokkverden/progress/it10/

## Iterasjon 10 (pågår) — navigasjon-blokker + core playtest

**Navigasjon-hotfix (Chrome):** Thomas: «navigation didn't work at all» på live.
Rotårsaker adressert:
1. Pointer lock uten drag-to-look-fallback → ingen muse-look hvis lock nektes/etter Esc
2. Etter pause: canvas ikke fokusokusert / lock ikke re-hentet fra Fortsett-klikket
3. Touch-overlay kunne aktiveres på fine-pointer (Mac maxTouchPoints) og nullstille WASD
4. Space/piltaster kunne aktivere fokususet knapp / scrolle — preventDefault under spill

E2E: `scripts/nav-chrome-e2e.ts` (Chromium) — WASD-retninger, piltaster, hopp, drag-look, pause→resume.
Wolf-taming er i branch men spawn av. `docs/CORE-PLAYTEST.md` er acceptance-sjekklisten.
