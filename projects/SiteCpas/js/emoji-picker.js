// ═══════════════════════════════════════════════════════════════════
// emoji-picker.js — Sélecteur d'emoji pour les agents
// ═══════════════════════════════════════════════════════════════════

const EMOJI_PICKER = {
  _callback: null,
  _activeCategory: 0,

  CATEGORIES: [
    {
      label: '🧑‍💼 Personnes',
      emojis: [
        '🧑‍💼','👩‍💼','👨‍💼','🧑‍⚕️','👩‍⚕️','👨‍⚕️','🧑‍🏫','👩‍🏫','👨‍🏫',
        '🧑‍💻','👩‍💻','👨‍💻','🧑‍🔧','👩‍🔧','👨‍🔧','🧑‍🎨','👩‍🎨','👨‍🎨',
        '🧑‍🦯','🧑‍🦼','🧑‍🦽','🤷','🤷‍♀️','🤷‍♂️','🙋','🙋‍♀️','🙋‍♂️',
        '🙆','🙆‍♀️','🙆‍♂️','💁','💁‍♀️','💁‍♂️','🧏','🧏‍♀️','🧏‍♂️',
        '👮','👮‍♀️','👮‍♂️','🕵️','🕵️‍♀️','🕵️‍♂️','💂','💂‍♀️','💂‍♂️',
        '👶','🧒','👦','👧','🧑','👱','👴','👵','🧓',
        '👩','👨','👩‍🦱','👨‍🦱','👩‍🦰','👨‍🦰','👩‍🦳','👨‍🦳','👩‍🦲',
      ]
    },
    {
      label: '😊 Expressions',
      emojis: [
        '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
        '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
        '🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫',
        '🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬',
        '🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
        '🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎',
        '🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳',
        '🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖',
        '😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬',
      ]
    },
    {
      label: '💪 Actions',
      emojis: [
        '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
        '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
        '👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲',
        '🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👁️',
        '🫀','🫁','🧠','🦷','🦴','👀','👅','👃','👂','🦻',
      ]
    },
    {
      label: '⭐ Symboles',
      emojis: [
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
        '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
        '✨','⭐','🌟','💫','⚡','🔥','🌈','☀️','🌤️','⛅',
        '🌙','💎','🏆','🥇','🎖️','🏅','🎗️','🎀','🎁','🎊',
        '🎉','🎈','🎯','🎲','🃏','🀄','🎭','🎨','🖼️','🎬',
        '📌','📍','🔑','🗝️','🔐','🔒','🔓','🔔','🔕','📢',
        '💡','🔦','🕯️','💰','💳','✉️','📧','📨','📩','📬',
      ]
    },
    {
      label: '🌿 Nature',
      emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
        '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
        '🐦','🦅','🦆','🦉','🦇','🐺','🐗','🐴','🦄','🐝',
        '🌸','🌺','🌻','🌹','🌷','🌼','🪷','🍀','🌿','🌱',
        '🌴','🌵','🍁','🍂','🍃','🌾','🍄','🌊','🌋','🏔️',
      ]
    },
    {
      label: '🍕 Nourriture',
      emojis: [
        '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥥',
        '🥑','🍆','🥦','🥕','🌽','🍄','🧄','🧅','🥔','🍠',
        '🍕','🍔','🌮','🌯','🥙','🧆','🥚','🍳','🥞','🧇',
        '🍣','🍱','🍜','🍝','🍛','🍲','🥣','🥗','🧁','🎂',
        '☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍾','🍫',
      ]
    },
  ],

  open(callback) {
    this._callback = callback;
    this._activeCategory = 0;
    this._render();
    g('epSearch').value = '';
    g('emojiPickerOverlay').classList.remove('hidden');
    setTimeout(() => g('epSearch').focus(), 80);
  },

  _render() {
    const cats = g('epCategories');
    cats.innerHTML = this.CATEGORIES.map((c, i) =>
      `<button class="ep-cat${i === this._activeCategory ? ' active' : ''}" data-cat="${i}">${c.label.split(' ')[0]}</button>`
    ).join('');
    cats.querySelectorAll('.ep-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeCategory = parseInt(btn.dataset.cat);
        g('epSearch').value = '';
        this._render();
      });
    });
    this._renderGrid();
    g('epSearch').addEventListener('input', () => this._renderGrid(), { once: true });
  },

  _renderGrid(query) {
    const q = (g('epSearch').value || '').trim().toLowerCase();
    let emojis;
    if (q) {
      // Recherche dans toutes les catégories par correspondance dans le label ou position
      emojis = this.CATEGORIES.flatMap(c => c.emojis);
      // Filtrer par ceux qui "ressemblent" à la query via les noms — on fait simple : on garde tous et on laisse l'utilisateur chercher visuellement
      // Alternative : on affiche juste tout en mode recherche
    } else {
      emojis = this.CATEGORIES[this._activeCategory].emojis;
    }

    g('epGrid').innerHTML = emojis.map(e =>
      `<button class="ep-btn" title="${e}">${e}</button>`
    ).join('');
    g('epGrid').querySelectorAll('.ep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.textContent;
        if (this._callback) this._callback(emoji);
        g('emojiPickerOverlay').classList.add('hidden');
      });
    });
  },

  init() {
    g('epSearch').addEventListener('input', () => this._renderGrid());
    g('emojiPickerOverlay').addEventListener('click', e => {
      if (e.target.id === 'emojiPickerOverlay') g('emojiPickerOverlay').classList.add('hidden');
    });
  }
};
