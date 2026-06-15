export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  try {
    const { title, slug, description, category, content } = JSON.parse(event.body);

    if (!title || !slug || !description || !category || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan campos obligatorios" }),
      };
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Faltan variables de entorno de GitHub" }),
      };
    }

    const safeSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

    const filePath = `src/content/blog/${safeSlug}.mdx`;

    const markdown = `---
title: "${title.replace(/"/g, "'")}"
description: "${description.replace(/"/g, "'")}"
category: "${category}"
date: "${new Date().toISOString().split("T")[0]}"
---

${content}
`;

    const encodedContent = Buffer.from(markdown).toString("base64");

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "forenseia-dashboard",
        },
        body: JSON.stringify({
          message: `Add blog post: ${title}`,
          content: encodedContent,
          branch,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.message || "Error al crear post" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        path: filePath,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}