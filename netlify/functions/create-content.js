import { verifySession } from "./_auth.js";

const CONTENT_CONFIG = {
  course: {
    folder: "src/content/courses",
    commitPrefix: "Add course",
  },

  service: {
    folder: "src/content/services",
    commitPrefix: "Add service",
  },
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function cleanText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .trim();
}

function createSlug(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function quoted(value = "") {
  return `"${cleanText(value)}"`;
}

function createCourseFrontmatter(payload) {
  return [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `area: ${quoted(payload.area)}`,
    `instructor: ${quoted(payload.instructor)}`,
    `duration: ${quoted(payload.duration)}`,
    `modality: ${quoted(payload.modality)}`,
    `level: ${quoted(payload.level)}`,
    `audience: ${quoted(payload.audience)}`,
    `status: ${quoted(payload.status || "published")}`,
    `featured: ${payload.featured === true || payload.featured === "true"}`,
    payload.cover ? `cover: ${quoted(payload.cover)}` : null,
    payload.price ? `price: ${quoted(payload.price)}` : null,
    `date: ${quoted(new Date().toISOString())}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
}

function createServiceFrontmatter(payload) {
  return [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `area: ${quoted(payload.area)}`,
    `director: ${quoted(payload.director)}`,
    `audience: ${quoted(payload.audience)}`,
    `status: ${quoted(payload.status || "published")}`,
    `featured: ${payload.featured === true || payload.featured === "true"}`,
    `order: ${Number(payload.order || 0)}`,
    payload.cover ? `cover: ${quoted(payload.cover)}` : null,
    `date: ${quoted(new Date().toISOString())}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
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

  try {
    const payload = JSON.parse(event.body || "{}");
    const config = CONTENT_CONFIG[payload.contentType];

    if (!config) {
      return jsonResponse(400, {
        error: "Tipo de contenido no válido",
      });
    }

    if (
      !payload.title ||
      !payload.description ||
      !payload.area ||
      !payload.content
    ) {
      return jsonResponse(400, {
        error: "Completa todos los campos obligatorios",
      });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return jsonResponse(500, {
        error: "Faltan variables de GitHub",
      });
    }

    const slug = createSlug(payload.slug || payload.title);

    if (!slug) {
      return jsonResponse(400, {
        error: "No fue posible crear el slug",
      });
    }

    const frontmatter =
      payload.contentType === "course"
        ? createCourseFrontmatter(payload)
        : createServiceFrontmatter(payload);

    const markdown = `${frontmatter}\n\n${String(payload.content).trim()}\n`;

    const path = `${config.folder}/${slug}.mdx`;
    const encodedContent = Buffer.from(markdown, "utf8").toString("base64");

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "PUT",

        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "forenseia-dashboard",
        },

        body: JSON.stringify({
          message: `${config.commitPrefix}: ${payload.title}`,
          content: encodedContent,
          branch,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return jsonResponse(response.status, {
        error: data.message || "No se pudo guardar el contenido",
      });
    }

    return jsonResponse(200, {
      success: true,
      slug,
      path,
    });
  } catch (error) {
    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado",
    });
  }
}