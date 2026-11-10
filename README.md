# jeux-de-societe

Appli web de jeux de société en ligne. Premier jeu : une enquête façon Cluedo (2 à 6 joueurs).

Site : https://faazik11.github.io/jeux-de-societe/

## Où en est le projet

- [x] Moteur de règles (cartes, plateau, déplacements, hypothèses, réfutation, accusation, maître de jeu)
- [x] Page de test locale (tous les joueurs sur le même écran)
- [x] Jeu en ligne avec Firebase Realtime Database (salons, code de partie, pause, abandon)
- [x] Plateau isométrique animé (Phaser) : décor, pions, déplacements, dés, caméra qui suit le joueur
- [x] Plateau 3D (Three.js) : caméra « table », dés physiques, portes, mises en scène (hypothèse, passage secret, accusation, fin)
- [ ] Thème original et graphismes
- [x] Appli installable sur l'écran d'accueil (PWA), utilisable hors ligne en mode test
- [x] Cartes illustrées, carte montrée qui se retourne, carnet d'enquête en grille, onglets sur téléphone

## Style

Thème « Manoir victorien ». **Toutes les couleurs, polices et matières sont dans `src/theme/charte.ts`** :
pour ajuster le style, on modifie ce fichier, et l'interface, les cartes et le plateau 3D suivent.

## Organisation du code

```
src/games/cluedo/engine/   moteur de règles (TypeScript pur, sans affichage)
  data.ts       suspects, armes, pièces  ← pour changer le thème, c'est ici
  board.ts      plateau : pièces, portes, passages secrets, départs
  movement.ts   calcul des déplacements possibles
  engine.ts     createGame, applyAction, getAvailableActions, getPlayerView
src/games/cluedo/board3d/   plateaux : Board3DView.ts (3D, par défaut), IsoBoard.ts (2.5D), decor.ts
src/games/cluedo/scene3d/   scène 3D Three.js : plateau, portes, meubles, bonhommes, armes, dés, caméra, mises en scène
src/games/cluedo/ui/        écran de partie (plateau + panneau latéral)
src/online/                 Firebase : connexion, salons, envoi des actions
src/screens/                accueil, salon d'attente, mode test
database.rules.json         règles de sécurité de la base Firebase
tests/          tests automatiques
```

## Commandes

```bash
npm install
npm run dev     # lance le site en local
npm test        # lance les tests
npm run build   # prépare la version en ligne
```

Chaque envoi sur la branche `main` lance les tests puis met le site en ligne (GitHub Actions → GitHub Pages).
