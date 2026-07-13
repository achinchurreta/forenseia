import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

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

    author: z.enum([
      "Gonzalo García",
      "Augusto Chinchurreta",
      "Tania Pérez",
      "ForenseIA",
    ]),

    status: z.enum(["draft", "published"]).default("published"),

    cover: z.string().optional(),

    tags: z.array(z.string()).default([]),
  }),
});

export const collections = {
  blog,
};