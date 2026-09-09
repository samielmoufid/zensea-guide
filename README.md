# Zensea — Le guide du handpan

Expérience immersive d'accueil du guide : un écran d'entrée, puis une
descente dans une vraie forêt en 360° (panorama photographique) que l'on
parcourt du regard à la souris, au doigt ou en inclinant le téléphone.
Ambiance sonore synthétisée en direct (vent, feuilles, oiseaux), rais de
lumière, poussières en suspension, brume au sol, halo de soleil.

Le panorama `sunny_vondelpark` vient de Poly Haven (licence CC0, usage
commercial libre). Le son ne charge aucun fichier : tout est généré
par WebAudio, donc aucune licence à gérer et jamais deux fois le même.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
```

`?no3d` force le repli sans WebGL (panorama en fond CSS).

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` : build
Vite, puis publication sur GitHub Pages. Le site est servi sur
**https://guide.zensea.fr** ; `public/CNAME` maintient le domaine à chaque
déploiement.

Mise en place, une seule fois :

1. Dépôt GitHub → Settings → Pages → Source : **GitHub Actions**.
2. Shopify → Paramètres → Domaines → zensea.fr → ajouter un enregistrement
   DNS `CNAME` : hôte `guide`, cible `samielmoufid.github.io`.
3. Settings → Pages → Custom domain : `guide.zensea.fr`, puis cocher
   « Enforce HTTPS » quand le certificat est émis (quelques minutes).

## Étape suivante

Le bouton « Choisir mon handpan » est en place ; l'écran de choix (visuels
et sons des handpans) sera branché quand les assets seront livrés.
