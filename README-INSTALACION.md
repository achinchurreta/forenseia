# ForenseIA Home Redesign

Este paquete reemplaza únicamente:

- `src/pages/index.astro`
- `src/components/layout/Header.astro`
- `src/components/ui/Button.astro`
- `src/components/ui/Container.astro`
- `src/styles/global.css`

## Instalación

Desde la raíz del proyecto:

```bash
cp -r src src-backup-home-anterior
tar -xzf forenseia-home-redesign.tar.gz
rm -rf .astro dist
npm run build
```

El diseño utiliza el archivo existente `public/logo.png` y no modifica el dashboard, las colecciones ni las funciones de Netlify.
