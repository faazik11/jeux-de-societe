// ============================================================================
//  CHARTE GRAPHIQUE : « Manoir victorien »
//  Soirée au manoir, 1890 : bois sombre, velours bordeaux, laiton doré, papier vieilli.
//
//  C'est la SEULE source de couleurs, polices et matières du jeu.
//  Pour ajuster le style (« plus sombre », « moins doré »…), on modifie ce fichier :
//  l'interface, les cartes et le plateau 3D suivent automatiquement.
// ============================================================================

export const CHARTE = {
  nom: 'Manoir victorien',

  // --- Palette ---------------------------------------------------------------
  couleurs: {
    nuit: '#15110e', // fond général
    acajou: '#2a1b14', // panneaux (bois sombre)
    acajouClair: '#3a261b', // panneaux au survol / panneaux internes
    filet: '#5a4029', // bordures fines
    bordeaux: '#6b1e2a', // velours : accents forts, boutons dangereux
    bordeauxClair: '#8e2a38',
    vertBouteille: '#1f3b2d', // papier peint, succès
    vertClair: '#2f5a43',
    laiton: '#c9a24a', // or / laiton : titres, boutons principaux
    laitonClair: '#e6c475',
    laitonSombre: '#8a6a2a',
    papier: '#efe3c6', // cartes, carnet
    papierSombre: '#d9c9a3',
    encre: '#2a1d14', // texte sur papier
    texte: '#eadfca', // texte sur fond sombre
    texteDoux: '#b4a58a',
    danger: '#c2453f',
  },

  // --- Typographie -------------------------------------------------------------
  polices: {
    titres: "'Playfair Display', Georgia, serif",
    texte: "'Lora', Georgia, serif",
  },

  // --- Formes --------------------------------------------------------------------
  formes: {
    rayon: '6px', // coins peu arrondis (style ancien)
    rayonCarte: '8px',
  },

  // --- Couleurs des familles de cartes ------------------------------------------
  cartes: {
    suspect: '#7a1f2b', // bordeaux
    weapon: '#4b5560', // acier
    room: '#2f5a43', // vert bouteille
    fond: '#efe3c6',
    liseré: '#c9a24a',
  },

  // --- Plateau 3D : matières et lumière --------------------------------------------
  plateau: {
    fond: 0x0f0c0a,
    socle: 0x24160e,
    couloirA: 0x6e4a2c, // parquet du couloir (deux tons)
    couloirB: 0x5f3f25,
    paillasson: 0x6b1e2a,
    mur: 0x3b5a47, // papier peint vert bouteille
    murHaut: 0x3a1f17, // corniche
    lambris: 0x3a2416, // soubassement en bois
    porte: 0x4a2a16,
    encadrement: 0x2a170c,
    poignee: 0xc9a24a,
    // Lumière : chaude et tamisée, ombres marquées
    ambiance: { ciel: 0xffe2b8, sol: 0x2a1c12, force: 0.62 },
    soleil: { couleur: 0xffd9a6, force: 1.25 },
    lampes: { couleur: 0xffb866, force: 9, portee: 8 },
    exposition: 1.08,
  },

  /** Sol de chaque pièce (deux tons pour le damier / les lames). */
  sols: {
    cuisine: { a: 0xd8d0c0, b: 0x2a2622 }, // carrelage noir et blanc
    bal: { a: 0x9a6a3c, b: 0x8a5d33 }, // grand parquet
    veranda: { a: 0xb7a27a, b: 0x8f7c58 }, // tomettes
    salleAManger: { a: 0x5a3820, b: 0x4f311c },
    billard: { a: 0x4a2f1f, b: 0x432a1b },
    bibliotheque: { a: 0x4d3222, b: 0x452c1e },
    salon: { a: 0x5a2a28, b: 0x512624 },
    hall: { a: 0xd6cdb9, b: 0x7d1f2a }, // marbre blanc et bordeaux
    bureau: { a: 0x463021, b: 0x3f2b1d },
  } as Record<string, { a: number; b: number }>,

  /** Recoloration des meubles 3D (par nom de matière dans les modèles). */
  meubles: {
    wood: 0x5a3520, // acajou
    woodDark: 0x3a2214,
    carpet: 0x6b1e2a, // velours bordeaux
    carpetDarker: 0x4a1520,
    carpetWhite: 0xe8dcc0,
    carpetBlue: 0x1f3b2d, // velours vert
    metal: 0xc9a24a, // laiton
    metalMedium: 0x8a6a2a,
    metalDark: 0x3a2e22,
    metalLight: 0xe6c475,
    lamp: 0xffe2a8,
    plant: 0x2f6b3f,
  } as Record<string, number>,
} as const;

/** Variables CSS dérivées de la charte (injectées au démarrage). */
export function applyCharteCss() {
  const c = CHARTE.couleurs;
  const vars: Record<string, string> = {
    '--bg': c.nuit,
    '--panel': c.acajou,
    '--panel-2': c.acajouClair,
    '--line': c.filet,
    '--text': c.texte,
    '--muted': c.texteDoux,
    '--accent': c.laiton,
    '--accent-light': c.laitonClair,
    '--accent-dark': c.laitonSombre,
    '--velvet': c.bordeaux,
    '--velvet-light': c.bordeauxClair,
    '--green': c.vertBouteille,
    '--green-light': c.vertClair,
    '--paper': c.papier,
    '--paper-dark': c.papierSombre,
    '--ink': c.encre,
    '--danger': c.danger,
    '--font-title': CHARTE.polices.titres,
    '--font-text': CHARTE.polices.texte,
    '--radius': CHARTE.formes.rayon,
    '--radius-card': CHARTE.formes.rayonCarte,
    '--card-suspect': CHARTE.cartes.suspect,
    '--card-weapon': CHARTE.cartes.weapon,
    '--card-room': CHARTE.cartes.room,
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
