# Standard per ricostruire un'arena

La Gottardo Arena (`HCAP` in `src/arenas.js`) è il riferimento. Ogni altra arena va portata allo stesso livello, una alla volta, confrontando il risultato con le foto della cartella dell'arena (esterni, interni, settore ospiti segnato a mano).

## Esterno: l'edificio

- **Leggere i volumi dalle foto, dal basso verso l'alto.** Alla Gottardo: basamento in cemento più largo, piano vetrato arretrato, scatola dell'arena che sporge sopra il vetro, volta a botte dentro un bordo piano. Ogni arena ha la sua sequenza: va descritta così prima di scrivere la configurazione.
- **Altezza giusta.** L'involucro può essere più basso dell'interno (`exterior.height`): durante l'intro l'interno è nascosto e ricompare quando la telecamera entra.
- **Accessi credibili.** Le scale devono partire dal piazzale e arrivare al livello che servono, incassate nel basamento (`podium`), mai appoggiate nel vuoto.
- **Facciata e tetto dalle foto:** materiale, fasce, feritoie, pannelli, colore. Niente dettagli inventati che le foto smentiscono.

## Esterno: i dintorni

- **Niente piani verdi uniformi.** Prati a riquadri di verdi diversi (`meadows`), alcuni falciati, con file d'alberi.
- **Niente strade che finiscono nel nulla.** Le strade entrano in galleria in una collina (`tunnels`) o escono dall'inquadratura nella nebbia. Le piste d'aerodromo finiscono come vere piste: soglia, zona di sicurezza, luci di avvicinamento.
- **Nulla deve compenetrarsi:** strade, piste, edifici e versanti non si sovrappongono. Controllare dall'alto.
- **Parcheggi ordinati:** auto in file, una per stallo, senza sovrapposizioni, e non troppe.
- **Elementi riconoscibili dalle foto:** autostrada, fiume, versante boscoso, impianti vicini, hangar. Le richieste annotate nei nomi dei file (es. «marca grigia come posteggio») vanno rispettate.
- **Bordi morbidi:** il paesaggio sfuma nella nebbia, di giorno nel cielo e di notte nel buio; i prati finiscono in modo irregolare.

## Notte

- La notte arriva presto: circa 2,5 s di giorno, 5 di tramonto, 14 di notte (`INTRO` in `engine.js`).
- Si accendono: facciata (con il colore tipico dell'arena, es. fascia blu ad Ambrì), luci di cortesia sul basamento, lampioni con le pozze di luce, fari delle auto, luci delle piste, finestre di città e case.

## Interno

- **Settore ospiti** esattamente dove lo indicano piantina o foto annotata, compresi angoli (`corner`) e settori in piedi (`standing`).
- **Curva di casa** come quella vera: alla Gottardo è una gradinata continua senza scale tra i settori, con due piccoli ingressi (vomitori) a sinistra e a destra del centro.
- Colori dei sedili, tipo di soffitto e travi dalle foto.
- In **Esplora** la telecamera resta sempre dentro l'arena.

## Tecnica

- Evitare lo sfarfallio: superfici piane a quote diverse (prato, piazzale, parcheggi, strade, segnaletica) e niente riquadri sovrapposti alla stessa altezza.
- A ogni modifica aumentare `?v=N` in tutti gli import, poi provare nel browser: intro di giorno e di notte, ingresso nell'arena, Formazioni, Tour, Esplora; console senza errori.

## Procedura

1. Rileggere le foto e le note della cartella dell'arena.
2. Descrivere a parole volumi, dintorni e settori (aggiornare `docs/ARENE-RILIEVO.md`).
3. Scrivere o correggere la configurazione in `src/arenas.js`; se manca un elemento, aggiungerlo in modo riutilizzabile in `src/exterior.js` o `src/engine.js`.
4. Provare tutte le regie e confrontare con le foto.
5. Una sola arena alla volta: la si chiude bene prima di passare alla successiva.
