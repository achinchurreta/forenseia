import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/* -------------------------------------------------------
   VALORES COMPARTIDOS
------------------------------------------------------- */

const authors = z.enum([
  "Gonzalo García",
  "Augusto Chinchurreta",
  "Tania Pérez",
  "ForenseIA",
]);

const status = z.enum([
  "draft",
  "published",
]);

/* -------------------------------------------------------
   BLOG
------------------------------------------------------- */

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/blog",
  }),

  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    date: z.coerce.date(),

    author: authors.default("ForenseIA"),

    status: status.default("published"),

    cover: z.string().optional(),

    tags: z
      .array(z.string())
      .default([]),
  }),
});

/* -------------------------------------------------------
   CURSOS
------------------------------------------------------- */

const courses = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/courses",
  }),

  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),

    area: z.enum([
      "Inteligencia Artificial",
      "Investigación Digital",
      "Ciberseguridad",
      "Psicología Criminal",
      "Psicología Educativa",
    ]),

    instructor: authors,

    duration: z.string().min(1),
    modality: z.string().min(1),

    level: z.enum([
      "Inicial",
      "Intermedio",
      "Avanzado",
    ]),

    audience: z.string().min(1),

    status: status.default("published"),

    featured: z
      .boolean()
      .default(false),

    cover: z.string().optional(),
    price: z.string().optional(),

    date: z.coerce.date(),
  }),
});

/* -------------------------------------------------------
   SERVICIOS
------------------------------------------------------- */

const services = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/services",
  }),

  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),

    area: z.enum([
      "Inteligencia Artificial",
      "Investigación Digital y Ciberseguridad",
      "Psicología Criminal",
    ]),

    director: authors,

    audience: z.string().min(1),

    status: status.default("published"),

    featured: z
      .boolean()
      .default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    cover: z.string().optional(),

    date: z.coerce.date(),
  }),
});

/* -------------------------------------------------------
   RECURSOS DESCARGABLES
------------------------------------------------------- */

const resources = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/resources",
  }),

  schema: z.object({
    title: z.string().min(1),

    description: z
      .string()
      .min(1)
      .max(300),

    type: z.enum([
      "Guía",
      "Checklist",
      "Plantilla",
      "Ebook",
      "Infografía",
      "Presentación",
      "Manual",
      "Matriz",
      "Otro",
    ]),

    area: z.enum([
      "Inteligencia Artificial",
      "Gobierno Digital",
      "Automatización",
      "Investigación Digital",
      "Ciberseguridad",
      "OSINT",
      "Inteligencia Patrimonial",
      "Psicología Criminal",
      "Psicología Educativa",
      "Análisis Conductual",
    ]),

    author: authors,

    audience: z.string().min(1),

    /**
     * Puede contener:
     *
     * - una URL externa;
     * - un archivo dentro de /public;
     * - una ruta como /downloads/recurso.pdf.
     */
    downloadUrl: z.string().min(1),

    /**
     * Controla si el usuario debe dejar sus datos
     * antes de acceder al recurso.
     */
    requiresLead: z
      .boolean()
      .default(true),

    /**
     * Identificador opcional del formulario o campaña.
     * Se utilizará posteriormente para segmentar prospectos.
     */
    campaign: z.string().optional(),

    /**
     * Servicio o curso relacionado.
     * Por ahora se guarda como URL para evitar relaciones
     * rígidas entre colecciones.
     */
    relatedService: z.string().optional(),
    relatedCourse: z.string().optional(),
    relatedPost: z.string().optional(),

    status: status.default("published"),

    featured: z
      .boolean()
      .default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    cover: z.string().optional(),

    fileFormat: z.string().optional(),
    fileSize: z.string().optional(),

    date: z.coerce.date(),
  }),
});

/* -------------------------------------------------------
   EXPORTACIÓN
------------------------------------------------------- */

export const collections = {
  blog,
  courses,
  services,
  resources,
};