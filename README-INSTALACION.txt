CORRECCIÓN FORENSEIA UI

1. Desde la raíz del proyecto crea respaldo:
   cp -r src src-backup-antes-correccion-ui

2. Extrae este paquete en la raíz:
   tar -xzf forenseia-ui-correccion.tar.gz

3. Limpia y compila:
   rm -rf .astro dist
   npm run build

4. Si todo compila:
   git add .
   git commit -m "Fix ForenseIA layout logo and visual effects"
   git push origin main

El paquete conserva /logo.png. Verifica que exista con:
   ls -lh public/logo.png
