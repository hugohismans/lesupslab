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
      'img/athena/6d80e6ec-4ecb-4ab6-b504-0562551cf1b5.JPG',
      'img/athena/fa952559-467a-406f-bb86-18e43372d208.JPG',
      'img/athena/f5d43d2f-4bc2-4498-b20a-93243a72c202.JPG',
      'img/athena/f3d7d9a6-1f2f-429d-a582-2665d91af84d.JPG',
      'img/athena/sac-raphia-eventail-bambou.jpg',
      'img/athena/IMG_3426.jpeg',
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
      'img/aphrodite/5291be4b-33fb-40c1-b2af-df7f9ac5be8e.JPG',
      'img/aphrodite/97453be2-a5b6-4364-92e7-d56313dcc3e8.JPG',
      'img/aphrodite/cd1735ba-0162-4c89-8e18-9949e2c9e509.JPG',
      'img/aphrodite/e094212d-ec8b-4af7-9487-ce1fded2bfdf.JPG',
      'img/aphrodite/a7da3187-ce9c-4c92-aaf0-304b5ca187fb.JPG',
      'img/aphrodite/92d69270-fdb6-410b-ae11-521644320d84.JPG',
      'img/aphrodite/sac-raphia-rond-mandala.jpg',
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
      'img/hermes/27af69f3-39f2-480c-9931-98abf5b3cbe1.JPG',
      'img/hermes/9fc5b48e-bce2-452b-bcf3-7ec475dc5ac1.JPG',
      'img/hermes/eb25231c-a93b-4f5a-84ad-553eaf1cb176.JPG',
      'img/hermes/sac-raphia-caramel-cabas.jpg',
      'img/hermes/a2ac1325-9d7e-409d-969d-7eb3f3ac3c32.JPG',
      'img/hermes/480ed890-cfe2-45c3-bc31-0b749c53af3d.JPG',
      'img/hermes/f28a4124-fd02-49e1-97ca-a37c629870b5.JPG',
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
    photos: [
      'img/venus/2ec9630c-b6b8-41b9-907a-4d18cacbe083.JPG',
      'img/venus/67199aa0-008a-4330-96c9-a28a6b5fd72e.JPG',
    ],
    dimensions: '40×60 cm',
    price: 65,
    bundle: true,
    accessory: { type: 'trousse', dimensions: '30×40 cm' },
  },
  {
    id: 'demeter',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/demeter/30bd1044-cfd9-48d1-a59e-fdf19cb93120.JPG',
      'img/demeter/b73935b9-396d-4293-b35e-6e004c52fe70.JPG',
      'img/demeter/d8a64d6f-101a-41a2-b382-362b4903d26a.JPG',
      'img/demeter/dfae1c86-d0ff-4ed8-ba18-e28dd327dd83.JPG',
      'img/demeter/835f1073-6c34-4d3d-9472-6de9573ab881.JPG',
    ],
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
      'img/zeus/3eff40b0-c95f-4822-857c-a8bb612a2264.JPG',
      'img/zeus/e8164a0d-8efd-4308-aff1-ccc5061f4a5c.JPG',
      'img/zeus/eaef4d3f-94de-4e8f-8709-83da99271870.JPG',
      'img/zeus/sac-raphia-banane-granny.jpg',
    ],
    dimensions: '34×14 cm',
    price: 15,
  },
  {
    id: 'neptune',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/neptune/5025b8c9-4d00-4b40-9693-7ffd2a3edbc3.JPG',
      'img/neptune/8f3fba03-f8b3-49ab-bdaa-86fec9529757.JPG',
      'img/neptune/sac-raphia-demilune-coquillages.jpg',
      'img/neptune/ed2eee7e-9475-4f28-9bae-c83bbb5d8f5c.JPG',
    ],
    dimensions: '35×35 cm',
    price: 25,
  },
  {
    id: 'lucrece',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/lucrece/d1d55bb5-0274-48a8-9c14-3ed1851b912a.JPG',
      'img/lucrece/0c25e7d7-cad3-4340-9f6b-bc75308f95dd.JPG',
      'img/lucrece/sac-tissu-rayures-marine.jpg',
      'img/lucrece/bebbd88f-9f4b-472f-9dd1-06a022cdc0b2.JPG',
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
      'img/poseidon/sac-tissu-bleu-ciel-tresse.jpg',
      'img/poseidon/74acc9bb-6e20-46df-ae7c-542024b31ee1.JPG',
      'img/poseidon/0147384b-0cff-4e56-8391-be985f4b278b.JPG',
      'img/poseidon/d7f973fa-ece2-4a69-81d6-c7ab79ec7ba9.JPG',
    ],
    dimensions: '33×38 cm',
    price: 35,
  },
  {
    id: 'hera',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/hera/788f15e3-7201-44b3-8bc9-5e78a30a26a3.JPG',
      'img/hera/ff034855-8b64-4ecb-b1bd-ef332b2278af.JPG',
      'img/hera/sac-tissu-orange-terracotta.jpg',
      'img/hera/dde6d82b-e0bd-42e7-9c4c-55ac2b803752.JPG',
    ],
    dimensions: '38×33 cm',
    price: 15,
  },
  {
    id: 'apopis',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/apopis/268ab9e3-d12c-473d-a6fc-d8ba1c97a3f5.JPG',
      'img/apopis/sac-tissu-bleu-marine.jpg',
      'img/apopis/3d7d812e-2141-4b99-b094-405ad201434d.JPG',
      'img/apopis/7ecd955e-2529-41c3-b62f-b925a2ac6ce2.JPG',
      'img/apopis/5b264fed-2534-46f3-98fc-d1aebe9aaeb2.JPG',
    ],
    dimensions: '28×38 cm',
    price: 20,
  },
  {
    id: 'diane',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/diane/3e9a0e8a-3758-4377-8730-a99903b75794.JPG',
    ],
    dimensions: '23×37 cm',
    price: 15,
  },
  {
    id: 'pluton',
    material: 'fabric',
    status: 'available',
    photos: [
      'img/pluton/73de7841-a1cd-4b22-b057-33e117dd4633.JPG',
      'img/pluton/744961a9-3347-40db-b766-f2907acaa306.JPG',
      'img/pluton/758e7ad9-d9ec-442a-b1e6-a3aa7defd133.JPG',
      'img/pluton/75975736-d705-4bf3-91ac-075610bd156b.JPG',
      'img/pluton/1161cc15-d053-482d-b4e1-f7167e280b94.JPG',
      'img/pluton/sac-tissu-ikat-vert.jpg',
    ],
    dimensions: '33×71 cm',
    price: 25,
  },
  {
    id: 'odin',
    material: 'raffia',
    status: 'available',
    photos: [
      'img/odin/49adc3f4-fa70-4ec4-8fc2-9004361dcba1.JPG',
      'img/odin/528b64a4-3383-4be4-a521-39202a37015c.JPG',
      'img/odin/d7b4a825-38ee-409f-8d42-e185defdfb35.JPG',
    ],
    dimensions: '22×14 cm',
    price: 19,
  },
];

// Photos de la palette de couleurs raphia (pour la section sur mesure)
const RAPHIA_PALETTE = [
  'palette_couleur_raraphia/palette_complete_raphia.png',
];
