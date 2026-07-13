import { verifySession } from "./_auth.js";

function cleanText(value = "") {
  return String(value).replace(/"/g, "'").trim();
}

function createSafeSlug(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  const user = verifySession(event);

  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "No autorizado" }),
    };
  }

  try {
    const {
      title,
      slug,
      description,
      category,
      author,
      status,
      cover,
      tags,
      content,
    } = JSON.parse(event.body || "{}");

    if (
      !title ||
      !description ||
      !category ||
      !author ||
      !status ||
      !content
    ) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Completa todos los campos obligatorios",
        }),
      };
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Faltan variables de GitHub en Netlify",
        }),
      };
    }

    const safeSlug = createSafeSlug(slug || title);

    if (!safeSlug) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "El slug no es válido" }),
      };
    }

    const parsedTags = String(tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const filePath = `src/content/blog/${safeSlug}.mdx`;

    const frontmatter = [
      "---",
      `title: "${cleanText(title)}"`,
      `description: "${cleanText(description)}"`,
      `category: "${cleanText(category)}"`,
      `date: "${new Date().toISOString()}"`,
      `author: "${cleanText(author)}"`,
      `status: "${cleanText(status)}"`,
      cover ? `cover: "${cleanText(cover)}"` : null,
      `tags: ${JSON.stringify(parsedTags)}`,
      "---",
    ]
      .filter(Boolean)
      .join("\n");

    const markdown = `${frontmatter}\n\n${content.trim()}\n`;

    const encodedContent = Buffer.from(markdown, "utf8").toString("base64");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: data.message || "No se pudo crear el artículo",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        slug: safeSlug,
        path: filePath,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Ocurrió un error inesperado",
      }),
    };
  }
}