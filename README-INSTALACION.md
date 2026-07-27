# Corrección del Blog de ForenseIA

Este paquete corrige exclusivamente la presentación pública del blog.

## Cambios

- El menú muestra **Blog**, no Gaceta.
- La Gaceta queda como tipo o edición de contenido, no como nombre del apartado.
- Rediseño de `/blog` con artículo destacado y cuadrícula compacta.
- Rediseño completo de `/blog/[slug]`.
- Ancho editorial de 820 px.
- Texto de lectura entre 17 y 19 px según pantalla.
- Títulos, listas, imágenes, tablas, citas y código correctamente alineados.
- CTA y publicaciones relacionadas.
- Corrección móvil.

## Instalación

Desde la raíz de tu proyecto:

```bash
cp -r src src-backup-antes-blog

tar -xzf forenseia-blog-correction.tar.gz
rm -rf .astro dist
npm run build
npm run dev
```

Si el build funciona:

```bash
git add .
git commit -m "Fix blog editorial layout"
git push origin main
```

## Nota sobre el contenido

La Gaceta puede seguir existiendo como una categoría, etiqueta o campo `edition` dentro de un post. El apartado público principal seguirá llamándose Blog.
