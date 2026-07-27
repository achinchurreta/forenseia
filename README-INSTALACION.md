# Corrección final del Blog de ForenseIA

Este paquete reemplaza únicamente las plantillas del blog y agrega una hoja de estilos aislada. No modifica la home, el dashboard ni las funciones de Netlify.

## Archivos incluidos

- `src/pages/blog.astro`
- `src/pages/blog/[slug].astro`
- `src/styles/blog.css`

## Instalación

Desde la raíz del proyecto:

```bash
cp -r src/pages/blog.astro src/pages/blog.astro.backup
cp -r 'src/pages/blog/[slug].astro' 'src/pages/blog/[slug].astro.backup'

tar -xzf forenseia-blog-redesign-final.tar.gz
rm -rf .astro dist
npm run build
npm run dev
```

## Publicar

```bash
git add .
git commit -m "Redesign blog and article layout"
git push origin main
```

## Notas

- El menú y la sección principal se mantienen como **Blog**.
- La **Gaceta** se muestra únicamente como categoría o edición dentro de un artículo.
- Si una imagen de portada no existe o la URL es incorrecta, aparecerá un fondo institucional en lugar del icono de imagen rota.
- Los estilos están aislados en `blog.css` para no descuadrar el resto del sitio.
