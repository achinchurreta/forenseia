import { verifySession } from "./_auth.js";

const CONTENT_TYPES = {
  course: {
    folder: "src/content/courses",
    label: "curso",
    requiredFields: [
      "title",
      "description",
      "area",
      "instructor",
      "duration",
      "modality",
      "level",
      "audience",
      "status",
      "content",
    ],
  },

  service: {
    folder: "src/content/services",
    label: "servicio",
    requiredFields: [
      "title",
      "description",
      "area",
      "director",
      "audience",
      "status",
      "content",
    ],
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

function createSlug(value = "") {
  return String(value)
    .replace(/\.mdx?$/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

function quoted(value = "") {
  return `"${cleanText(value)}"`;
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function createCourseMarkdown(payload) {
  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `area: ${quoted(payload.area)}`,
    `instructor: ${quoted(payload.instructor)}`,
    `duration: ${quoted(payload.duration)}`,
    `modality: ${quoted(payload.modality)}`,
    `level: ${quoted(payload.level)}`,
    `audience: ${quoted(payload.audience)}`,
    `status: ${quoted(payload.status)}`,
    `featured: ${payload.featured === true || payload.featured === "true"}`,
    payload.cover ? `cover: ${quoted(payload.cover)}` : null,
    payload.price ? `price: ${quoted(payload.price)}` : null,
    `date: ${quoted(normalizeDate(payload.date))}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(payload.content).trim()}\n`;
}

function createServiceMarkdown(payload) {
  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `area: ${quoted(payload.area)}`,
    `director: ${quoted(payload.director)}`,
    `audience: ${quoted(payload.audience)}`,
    `status: ${quoted(payload.status)}`,
    `featured: ${payload.featured === true || payload.featured === "true"}`,
    `order: ${Number(payload.order || 0)}`,
    payload.cover ? `cover: ${quoted(payload.cover)}` : null,
    `date: ${quoted(normalizeDate(payload.date))}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(payload.content).trim()}\n`;
}

function githubHeaders(token, includeContentType = false) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "forenseia-dashboard",
    ...(includeContentType
      ? { "Content-Type": "application/json" }
      : {}),
  };
}

async function readResponse(response) {
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

async function getFile({ owner, repo, branch, path, token }) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(token),
    }
  );

  return {
    response,
    data: await readResponse(response),
  };
}

async function writeFile({
  owner,
  repo,
  branch,
  path,
  token,
  message,
  content,
  sha,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
    {
      method: "PUT",
      headers: githubHeaders(token, true),
      body: JSON.stringify({
        message,
        branch,
        content: Buffer.from(content, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    }
  );

  return {
    response,
    data: await readResponse(response),
  };
}

async function removeFile({
  owner,
  repo,
  branch,
  path,
  token,
  message,
  sha,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
    {
      method: "DELETE",
      headers: githubHeaders(token, true),
      body: JSON.stringify({
        message,
        branch,
        sha,
      }),
    }
  );

  return {
    response,
    data: await readResponse(response),
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

  try {
    const payload = JSON.parse(event.body || "{}");
    const config = CONTENT_TYPES[payload.contentType];

    if (!config) {
      return jsonResponse(400, {
        error: "Tipo de contenido no válido",
      });
    }

    const missingFields = [
      "currentSlug",
      "slug",
      ...config.requiredFields,
    ].filter((field) => !String(payload[field] ?? "").trim());

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
        error: "Faltan variables de GitHub en Netlify",
      });
    }

    const currentSlug = createSlug(payload.currentSlug);
    const newSlug = createSlug(payload.slug);

    if (!currentSlug || !newSlug) {
      return jsonResponse(400, {
        error: "El slug actual o el nuevo slug no es válido",
      });
    }

    const currentPath = `${config.folder}/${currentSlug}.mdx`;
    const newPath = `${config.folder}/${newSlug}.mdx`;

    const markdown =
      payload.contentType === "course"
        ? createCourseMarkdown(payload)
        : createServiceMarkdown(payload);

    const currentFile = await getFile({
      owner,
      repo,
      branch,
      path: currentPath,
      token,
    });

    if (!currentFile.response.ok) {
      return jsonResponse(currentFile.response.status, {
        error:
          currentFile.data.message ||
          `No se encontró el ${config.label} actual`,
      });
    }

    const currentSha = currentFile.data.sha;

    if (!currentSha) {
      return jsonResponse(500, {
        error: "GitHub no devolvió el SHA del archivo actual",
      });
    }

    if (currentSlug === newSlug) {
      const updateResult = await writeFile({
        owner,
        repo,
        branch,
        path: currentPath,
        token,
        message: `Update ${config.label}: ${payload.title}`,
        content: markdown,
        sha: currentSha,
      });

      if (!updateResult.response.ok) {
        return jsonResponse(updateResult.response.status, {
          error:
            updateResult.data.message ||
            `No se pudo actualizar el ${config.label}`,
        });
      }

      return jsonResponse(200, {
        success: true,
        slug: newSlug,
        renamed: false,
      });
    }

    const destination = await getFile({
      owner,
      repo,
      branch,
      path: newPath,
      token,
    });

    if (destination.response.ok) {
      return jsonResponse(409, {
        error: "Ya existe contenido con ese slug",
      });
    }

    if (destination.response.status !== 404) {
      return jsonResponse(destination.response.status, {
        error:
          destination.data.message ||
          "No fue posible comprobar el nuevo slug",
      });
    }

    const createResult = await writeFile({
      owner,
      repo,
      branch,
      path: newPath,
      token,
      message: `Rename ${config.label}: ${currentSlug} to ${newSlug}`,
      content: markdown,
    });

    if (!createResult.response.ok) {
      return jsonResponse(createResult.response.status, {
        error:
          createResult.data.message ||
          "No se pudo crear la nueva ruta",
      });
    }

    const deleteResult = await removeFile({
      owner,
      repo,
      branch,
      path: currentPath,
      token,
      message: `Remove previous ${config.label}: ${currentSlug}`,
      sha: currentSha,
    });

    if (!deleteResult.response.ok) {
      return jsonResponse(500, {
        error:
          "Se creó la nueva ruta, pero no se pudo eliminar la anterior",
        warning: deleteResult.data.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      slug: newSlug,
      renamed: true,
    });
  } catch (error) {
    console.error("update-content error:", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al actualizar el contenido",
    });
  }
}