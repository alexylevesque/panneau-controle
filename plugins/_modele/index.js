// MODÈLE DE PLUGIN — copie ce dossier, renomme-le (ex: plugins/lumieres) et c'est tout.
// Les dossiers qui commencent par "_" sont ignorés.
// La config du plugin vient de config.json -> plugins.<nom-du-dossier>

module.exports = (cfg) => ({
  name: 'Mon plugin',
  icon: '✨',
  actions: {
    bonjour: {
      label: 'Dire bonjour',
      icon: '👋',
      run: async () => 'Bonjour !',   // ce qui est retourné s'affiche sur l'iPad
    },
  },
  // Optionnel : petite ligne d'état affichée sous le titre (rafraîchie toutes les 10 s)
  async status() { return { texte: 'Tout va bien' }; },
});
