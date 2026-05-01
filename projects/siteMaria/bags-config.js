// ════════════════════════════════════════════════════════════════════
// Configuration des sacs MISKA
// ════════════════════════════════════════════════════════════════════
//
// Pour ajouter / modifier des photos d'un sac :
//   1. Mets les photos dans le dossier img/<id>/
//   2. Ajoute le chemin dans le tableau "photos" ci-dessous
//   3. La première photo du tableau = photo principale (carte + couverture modal)
//
// Pour marquer un sac comme vendu : status: 'sold'
//
// ════════════════════════════════════════════════════════════════════

const BAGS = [
  {
    id: 'athena',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/sac-raphia-eventail-bambou.jpg',
    ],
    dimensions: '55×40 cm',
    price: 50,
    accessory: { type: 'pochette', dimensions: '24×16×2 cm', price: 20 },
  },
  {
    id: 'aphrodite',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/sac-raphia-rond-mandala.jpg',
    ],
    dimensions: '31×39 cm',
    price: 45,
    accessory: { type: 'pochette', dimensions: '30×15 cm', price: 20 },
    multiColor: true,
  },
  {
    id: 'hermes',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/sac-raphia-caramel-cabas.jpg',
    ],
    dimensions: '24×46 cm',
    price: 45,
    accessory: { type: 'pochette', dimensions: '24×20×2 cm', price: 20 },
    multiColor: true,
  },
  {
    id: 'venus',
    material: 'fabric',
    status: 'available',
    photos: [],
    dimensions: '40×60 cm',
    price: 65,
    bundle: true,
    accessory: { type: 'trousse', dimensions: '30×40 cm' },
  },
  {
    id: 'demeter',
    material: 'fabric',
    status: 'available',
    photos: [],
    dimensions: '47×30 cm',
    price: 50,
    bundle: true,
    accessory: { type: 'trousse', dimensions: '22×20 cm' },
  },
  {
    id: 'zeus',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/sac-raphia-banane-granny.jpg',
    ],
    dimensions: '34×14 cm',
    price: 15,
  },
  {
    id: 'neptune',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/sac-raphia-demilune-coquillages.jpg',
    ],
    dimensions: '35×35 cm',
    price: 25,
  },
  {
    id: 'lucrece',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/0c25e7d7-cad3-4340-9f6b-bc75308f95dd.JPG',
    ],
    dimensions: '28×39 cm',
    price: 30,
  },
  {
    id: 'poseidon',
    material: 'fabric',
    status: 'sold',
    remake: true,
    photos: [
      'img/sac-tissu-bleu-ciel-tresse.jpg',
    ],
    dimensions: '33×38 cm',
    price: 35,
  },
  {
    id: 'hera',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/sac-tissu-orange-terracotta.jpg',
    ],
    dimensions: '38×33 cm',
    price: 15,
  },
  {
    id: 'apopis',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/sac-tissu-bleu-marine.jpg',
    ],
    dimensions: '28×38 cm',
    price: 20,
  },
  {
    id: 'diane',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/sac-tissu-ikat-vert.jpg',
    ],
    dimensions: '23×37 cm',
    price: 15,
  },
  {
    id: 'pluton',
    material: 'fabric',
    status: 'available',
    photos: [],
    dimensions: '33×71 cm',
    price: 25,
  },
  {
    id: 'odin',
    material: 'raffia',
    status: 'available',
    photos: [],
    dimensions: '22×14 cm',
    price: 19,
  },
];

// Photos de la palette de couleurs raphia (pour la section sur mesure)
const RAPHIA_PALETTE = [
  'palette_couleur_raraphia/IMG_3429.jpg',
  'palette_couleur_raraphia/IMG_3430.jpg',
];
