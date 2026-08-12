# Ubuntu’ya kurulum (mevcut API’lere dokunma)

DNS `license.ivplayer.tr` → `78.189.53.159` olduktan sonra.

```bash
sudo mkdir -p /opt/ivplayer /var/www/ivplayer.tr
sudo cp -r license-server /opt/ivplayer/
sudo cp public-site/* /var/www/ivplayer.tr/

sudo cp license-server/deploy/ivplayer-license.env.example /etc/ivplayer-license.env
sudo nano /etc/ivplayer-license.env   # LICENSE_ADMIN_KEY değiştir

sudo cp license-server/deploy/ivplayer-license.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ivplayer-license

sudo cp license-server/deploy/nginx-license.ivplayer.tr.conf /etc/nginx/sites-available/license.ivplayer.tr
sudo cp license-server/deploy/nginx-ivplayer.tr.conf /etc/nginx/sites-available/ivplayer.tr
sudo ln -sf /etc/nginx/sites-available/license.ivplayer.tr /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/ivplayer.tr /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d license.ivplayer.tr -d ivplayer.tr -d www.ivplayer.tr
```

Kontrol: `https://license.ivplayer.tr/v1/health`  
Web oynatıcı: `https://ivplayer.tr/app/` (`npm run web:build` → `/var/www/ivplayer.tr/app/`)  
Eski URL `https://license.ivplayer.tr/app/` → 301 apex’e yönlenir.

Apex site (`ivplayer.tr` / `www`):
1. DNS A kayıtları **yalnızca** `78.189.53.159` olsun (eski `77.245.159.230` varsa sil).
2. `public-site/*` → `/var/www/ivplayer.tr/` (dizin `755`, dosyalar `644`).
3. Web build: `dist-web/*` → `/var/www/ivplayer.tr/app/`
4. Nginx `/app/` + redirect: `sudo bash license-server/deploy/patch-ivplayer-app-location.sh`
5. HTTPS: `bash ~/ivplayer/license-server/deploy/enable-ivplayer-https.sh` (sudo ister).

Mevcut `sites-enabled` dosyalarını silme.
