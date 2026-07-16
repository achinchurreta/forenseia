import { verifySession } from "./_auth.js";

const ALLOWED_BY_ROLE = {
  "director-ia": {
    author: "Gonzalo García",
    categories: [
      "Inteligencia Artificial",
      "Gobierno Digital",
      "Automatización",
      "Agentes Inteligentes",
      "Análisis Documental",
    ],
  },

  "director-psychology": {
    author: "Tania Pérez",
    categories: [
      "Psicología Criminal",
      "Psicología Educativa",
      "Análisis Conductual",
      "Prevención",
      "Factores de Riesgo",
    ],
  },
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function cleanText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

function createSafeSlug(value = "") {
  return String(value)
    .replace(/\.mdx?$/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTags(value = "") {
  if (Array.isArray(value)) {
    return value
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeStatus(value) {
  return value === "draft" ? "draft" : "published";
}

function applyRoleRestrictions(user, payload) {
  if (user.role === "admin") {
    return {
      ...payload,
      author: String(payload.author || "ForenseIA").trim(),
      category: String(payload.category || "").trim(),
    };
  }

  const restrictions = ALLOWED_BY_ROLE[user.role];

  if (!restrictions) {
    throw new Error(
      "Tu cuenta no tiene autorización para publicar artículos."
    );
  }

  const requestedCategory = String(payload.category || "").trim();

  if (!restrictions.categories.includes(requestedCategory)) {
    throw new Error(
      "La categoría seleccionada no pertenece a tu dirección."
    );
  }

  return {
    ...payload,
    author: restrictions.author,
    category: requestedCategory,
  };
}

function createMarkdown(payload) {
  const tags = parseTags(payload.tags);
  const date = new Date().toISOString();

  const frontmatter = [
    "---",
    `title: "${cleanText(payload.title)}"`,
    `description: "${cleanText(payload.description)}"`,
    `category: "${cleanText(payload.category)}"`,
    `date: "${date}"`,
    `author: "${cleanText(payload.author)}"`,
    `status: "${normalizeStatus(payload.status)}"`,
    payload.cover
      ? `cover: "${cleanText(payload.cover)}"`
      : null,
    `tags: ${JSON.stringify(tags)}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(payload.content || "").trim()}\n`;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "forenseia-dashboard",
  };
}

async function readGitHubResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

async function githubFileExists({
  owner,
  repo,
  branch,
  path,
  token,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
    {
      method: "GET",
      headers: githubHeaders(token),
    }
  );

  const data = await readGitHubResponse(response);

  return {
    exists: response.ok,
    status: response.status,
    data,
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Método no permitido",
    });
  }

  const user = verifySession(event);

  if (!user) {
    return jsonResponse(401, {
      error: "No autorizado",
    });
  }

  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];

  const canCreatePosts =
    permissions.includes("*") ||
    permissions.includes("posts");

  if (!canCreatePosts) {
    return jsonResponse(403, {
      error: "No tienes permiso para publicar artículos",
    });
  }

  try {
    const rawPayload = JSON.parse(event.body || "{}");
    const payload = applyRoleRestrictions(user, rawPayload);

    const requiredFields = [
      "title",
      "description",
      "category",
      "author",
      "content",
    ];

    const missingFields = requiredFields.filter(
      (field) => !String(payload[field] || "").trim()
    );

    if (missingFields.length > 0) {
      return jsonResponse(400, {
        error: `Faltan campos obligatorios: ${missingFields.join(", ")}`,
      });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return jsonResponse(500, {
        error:
          "Faltan GITHUB_TOKEN, GITHUB_OWNER o GITHUB_REPO en Netlify.",
      });
    }

    const slug = createSafeSlug(payload.slug || payload.title);

    if (!slug) {
      return jsonResponse(400, {
        error: "No fue posible generar un slug válido",
      });
    }

    const path = `src/content/blog/${slug}.mdx`;

    const existingFile = await githubFileExists({
      owner,
      repo,
      branch,
      path,
      token,
    });

    if (existingFile.exists) {
      return jsonResponse(409, {
        error:
          "Ya existe un artículo con ese slug. Utiliza una dirección diferente.",
      });
    }

    if (existingFile.status !== 404) {
      return jsonResponse(existingFile.status, {
        error:
          existingFile.data.message ||
          "No fue posible verificar el slug en GitHub.",
      });
    }

    const markdown = createMarkdown(payload);
    const encodedContent = Buffer.from(
      markdown,
      "utf8"
    ).toString("base64");

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      {
        method: "PUT",
        headers: githubHeaders(token),
        body: JSON.stringify({
          message: `Add blog post: ${payload.title}`,
          content: encodedContent,
          branch,
        }),
      }
    );

    const data = await readGitHubResponse(response);

    if (!response.ok) {
      return jsonResponse(response.status, {
        error:
          data.message ||
          "GitHub no pudo crear el artículo",
      });
    }

    return jsonResponse(200, {
      success: true,
      slug,
      path,
      author: payload.author,
      category: payload.category,
      status: normalizeStatus(payload.status),
    });
  } catch (error) {
    console.error("create-post error:", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al crear el artículo",
    });
  }
}