import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    date: z.string(),
    cover: z.string().optional(),
  }),
});

export const collections = {
  blog,
};