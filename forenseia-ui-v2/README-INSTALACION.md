# ForenseIA UI v2

Este paquete reemplaza únicamente la capa visual pública incluida en el archivo original.

## Archivos incluidos

- `src/styles/global.css`
- `src/layouts/BaseLayout.astro`
- `src/components/layout/Header.astro`
- `src/components/layout/Footer.astro`
- `src/components/ui/Button.astro`
- `src/components/ui/Container.astro`
- `src/components/ui/PageHeader.astro`
- `src/pages/index.astro`
- `src/pages/cursos/[slug].astro`

## Instalación

Desde la raíz del proyecto, realiza primero un respaldo:

```bash
cp -r src src-backup-ui-v1
```

Después copia el contenido del paquete sobre el proyecto:

```bash
cp -r forenseia-ui-v2/src/* src/
```

Limpia y compila:

```bash
rm -rf .astro dist
npm run build
```

Si el build es correcto:

```bash
git add .
git commit -m "Redesign public UI and course layout"
git push origin main
```

## Nota

El rediseño conserva las importaciones y estructuras existentes: `navigation`, `CONTACT`, `ServiceCard`, `Reveal`, `WhatsAppFloat`, `services`, `courses` y las colecciones de Astro.
