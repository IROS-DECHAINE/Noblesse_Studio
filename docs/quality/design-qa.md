# Design QA — accueil Noblesse Studio

- Date : 2026-08-21
- Résultat final : **passed**

## Source de vérité

- Référence acceptée : `design/noblesse-studio-home-studio-pulse-v01.png`
- Implémentation desktop finale : `design/noblesse-studio-home-improved-v03.png`
- Implémentation mobile finale : `design/noblesse-studio-home-improved-v03-mobile.png`
- Capture : build Vite de production, vérifié dans le navigateur intégré
- Viewports : 1536 × 1024 px et 390 × 844 px

Le serveur de QA isolé ne possède pas d'accès Internet sortant ; les captures V03 montrent donc volontairement l'état `API Epic indisponible`. L'état officiel connecté et masqué sous cinq joueurs reste prouvé par la capture V02 et par le test direct du connecteur. Les deux états utilisent le même composant.

## Fidelity ledger

| Point comparé | Preuve maquette | Preuve rendue V03 | Résultat |
|---|---|---|---|
| Navigation | rail gauche bleu nuit, sélection bleue | même rail, mêmes huit destinations, version mobile compacte | conforme |
| En-tête | titre centré, emblème et ligne or | composition identique ; contrôle d'actualisation ajouté à côté du statut | conforme avec ajout fonctionnel |
| KPI | quatre cartes alignées | même grille 4 colonnes, puis 2 × 2 sur mobile | conforme |
| Audience | grand panneau temporel Fortnite/Roblox | même panneau et même axe ; état vide explicite au lieu d'une fausse courbe | conforme |
| Projets | lignes denses avec miniature et mesures | trois vraies lignes portfolio, favoris actifs et accès Projet | conforme avec troisième projet |
| Palette | bleu nuit, bleu électrique, or, vert | couleurs, bordures, ombres et accents conservés | conforme |
| Connexions | non présente dans la maquette initiale | panneau secondaire sous les projets, même système visuel | écart fonctionnel demandé |
| Responsive | non détaillé | 390 × 844 sans débordement, connexions empilées | extension cohérente |

## Diff du texte au-dessus de la ligne de flottaison

Le titre, « Vue d'ensemble », les quatre libellés KPI et « Joueurs en direct » sont conservés. Les chiffres conceptuels sont volontairement remplacés par les états officiels `< 5`, `—`, `indisponible` ou `dernière lecture`. Le seul ajout visible est le bouton d'actualisation Epic, nécessaire au workflow demandé.

## Améliorations fonctionnelles V03

1. Actualisation Epic forcée depuis l'en-tête et le panneau Connexions.
2. Actualisation automatique toutes les cinq minutes, au retour de fenêtre et au rétablissement du réseau.
3. Mode `STALE` : une coupure conserve la dernière observation réussie, datée et clairement signalée.
4. Une réponse vide reste distincte d'une donnée confidentielle.
5. La fenêtre horaire utilise exactement les 24 derniers buckets.
6. Le favori de chaque projet modifie réellement son état et son libellé accessible, puis reste mémorisé après rechargement.
7. Les boutons Projet, Finances et Roblox ouvrent leurs modules réels.
8. Focus clavier visible et boutons désactivés pendant le rafraîchissement.

## QA fonctionnelle

- Suite complète : 72/72 tests réussis.
- Build de production : réussi.
- Actualisation forcée : cache contourné dans le test dédié.
- Panne après succès : dernière observation conservée dans le test dédié.
- Favori PrimeBot Rush : `aria-pressed=true` après clic.
- Accueil → Projet : réussi.
- Accueil → Finances : réussi.
- Accueil → Roblox : réussi.
- Console desktop : aucune erreur, aucun avertissement.
- Console mobile : aucune erreur, aucun avertissement.

## Écarts intentionnels restants

- Les revenus Epic privés restent `—` tant qu'un relevé Creator Portal ou une API officielle n'est pas branché.
- Roblox, Steam et le radar gaming affichent leur prérequis au lieu d'une donnée simulée.
- Le panneau Connexions demande un défilement vertical sur mobile.
- La capture V03 démontre l'état hors ligne ; `design/noblesse-studio-home-real-data-v02.png` conserve la preuve visuelle de l'état Epic connecté/masqué.

## Sévérité

- P0 : aucun
- P1 : aucun
- P2 : aucun
- P3 : aucun bloquant

Verdict : l'implémentation a été fidèlement vérifiée contre le design accepté. Aucun écart matériel corrigeable ne reste sur l'accueil.
