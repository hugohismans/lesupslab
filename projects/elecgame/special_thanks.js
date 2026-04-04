// Special thanks / content creators — edit this file to update both index.html and game.html
const SPECIAL_THANKS = [
  { pseudo: 'Lesups', level: 'Créateur du jeu' },
  { pseudo: 'Hormun', level: 'Testeur' },
  { pseudo: 'Skunkz', level: 'Testeur' },
  { pseudo: 'Alex', level: 'Testeur' },
  { pseudo: 'AccurateCatFish', level: 'Testeur' },
  { pseudo: 'KetaKoala', level: 'conseiller & level builder' },
  { pseudo: 'Frigolite', level: 'Createur de niveau' },
  { pseudo: 'Philippe 1er (roi des Belges)', level: 'Merci de servir a rien' },
];

// Retourne la couleur CSS associée au rôle d'une entrée Special Thanks.
// Ajouter ici de nouvelles règles si de nouveaux rôles apparaissent.
function specialThanksColor(level) {
  const r = (level || '').toLowerCase();
  if (r.includes('créateur du jeu') || r.includes('createur du jeu')) return '#ffcc44'; // or
  if (r.includes('créateur de niveau') || r.includes('createur de niveau'))  return '#44ff99'; // vert
  if (r.includes('conseiller & level builder'))  return '#ff0000';
  if (r.includes('testeur')) return '#44aaff'; // bleu
  return '#556677'; // gris par défaut
}
