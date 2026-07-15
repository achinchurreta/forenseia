import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const authors = z.enum([
  "Gonzalo García",
  "Augusto Chinchurreta",
  "Tania Pérez",
  "ForenseIA",
]);

const status = z.enum(["draft", "published"]);

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/blog",
  }),

  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    date: z.coerce.date(),
    author: authors.default("ForenseIA"),
    status: status.default("published"),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const courses = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/courses",
  }),

  schema: z.object({
    title: z.string(),
    description: z.string(),
    area: z.enum([
      "Inteligencia Artificial",
      "Investigación Digital",
      "Ciberseguridad",
      "Psicología Criminal",
      "Psicología Educativa",
    ]),
    instructor: authors,
    duration: z.string(),
    modality: z.string(),
    level: z.enum(["Inicial", "Intermedio", "Avanzado"]),
    audience: z.string(),
    status: status.default("published"),
    featured: z.boolean().default(false),
    cover: z.string().optional(),
    price: z.string().optional(),
    date: z.coerce.date(),
  }),
});

const services = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/services",
  }),

  schema: z.object({
    title: z.string(),
    description: z.string(),
    area: z.enum([
      "Inteligencia Artificial",
      "Investigación Digital y Ciberseguridad",
      "Psicología Criminal",
    ]),
    director: authors,
    audience: z.string(),
    status: status.default("published"),
    featured: z.boolean().default(false),
    order: z.number().default(0),
    cover: z.string().optional(),
    date: z.coerce.date(),
  }),
});

export const collections = {
  blog,
  courses,
  services,
};