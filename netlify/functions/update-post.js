import { verifySession } from "./_auth.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const GITHUB_API_VERSION = "2022-11-28";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
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

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function createMarkdown(payload) {
  const tags = parseTags(payload.tags);
  const date = normalizeDate(payload.date);

  const frontmatter = [
    "---",
    `title: "${cleanText(payload.title)}"`,
    `description: "${cleanText(payload.description)}"`,
    `category: "${cleanText(payload.category)}"`,
    `date: "${date}"`,
    `author: "${cleanText(payload.author)}"`,
    `status: "${cleanText(payload.status || "draft")}"`,
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

function githubHeaders(token, includeContentType = false) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "forenseia-dashboard",
    ...(includeContentType
      ? { "Content-Type": "application/json" }
      : {}),
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

async function getFile({
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
    response,
    data,
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
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      }),
    }
  );

  const data = await readGitHubResponse(response);

  return {
    response,
    data,
  };
}

async function deleteFile({
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
        sha,
        branch,
      }),
    }
  );

  const data = await readGitHubResponse(response);

  return {
    response,
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

  try {
    const payload = JSON.parse(event.body || "{}");

    const requiredFields = [
      "currentSlug",
      "slug",
      "title",
      "description",
      "category",
      "author",
      "status",
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
          "Faltan las variables GITHUB_TOKEN, GITHUB_OWNER o GITHUB_REPO en Netlify.",
      });
    }

    const currentSlug = createSafeSlug(payload.currentSlug);
    const newSlug = createSafeSlug(payload.slug);

    if (!currentSlug || !newSlug) {
      return jsonResponse(400, {
        error: "El slug actual o el nuevo slug no es válido.",
      });
    }

    const currentPath = `src/content/blog/${currentSlug}.mdx`;
    const newPath = `src/content/blog/${newSlug}.mdx`;
    const markdown = createMarkdown(payload);

    /*
     * Primero obtenemos el archivo actual.
     * GitHub exige el SHA para modificar o eliminar un archivo existente.
     */
    const currentFileResult = await getFile({
      owner,
      repo,
      branch,
      path: currentPath,
      token,
    });

    if (!currentFileResult.response.ok) {
      return jsonResponse(currentFileResult.response.status, {
        error:
          currentFileResult.data.message ||
          `No se encontró el artículo actual en ${currentPath}.`,
      });
    }

    const currentSha = currentFileResult.data.sha;

    if (!currentSha) {
      return jsonResponse(500, {
        error: "GitHub no devolvió el SHA del artículo actual.",
      });
    }

    /*
     * Caso 1: el slug no cambió.
     * Solamente actualizamos el mismo archivo utilizando su SHA.
     */
    if (currentSlug === newSlug) {
      const updateResult = await writeFile({
        owner,
        repo,
        branch,
        path: currentPath,
        token,
        message: `Update blog post: ${payload.title}`,
        content: markdown,
        sha: currentSha,
      });

      if (!updateResult.response.ok) {
        return jsonResponse(updateResult.response.status, {
          error:
            updateResult.data.message ||
            "GitHub no pudo actualizar el artículo.",
        });
      }

      return jsonResponse(200, {
        success: true,
        renamed: false,
        slug: newSlug,
        path: currentPath,
        message: "Artículo actualizado correctamente.",
      });
    }

    /*
     * Caso 2: cambió el slug.
     * Verificamos primero que la nueva URL no esté ocupada.
     */
    const destinationResult = await getFile({
      owner,
      repo,
      branch,
      path: newPath,
      token,
    });

    if (destinationResult.response.ok) {
      return jsonResponse(409, {
        error:
          "Ya existe otro artículo con el nuevo slug. Utiliza uno diferente.",
      });
    }

    if (destinationResult.response.status !== 404) {
      return jsonResponse(destinationResult.response.status, {
        error:
          destinationResult.data.message ||
          "No fue posible comprobar el nuevo slug.",
      });
    }

    /*
     * Creamos el artículo en la nueva ruta.
     */
    const createResult = await writeFile({
      owner,
      repo,
      branch,
      path: newPath,
      token,
      message: `Rename blog post: ${currentSlug} to ${newSlug}`,
      content: markdown,
    });

    if (!createResult.response.ok) {
      return jsonResponse(createResult.response.status, {
        error:
          createResult.data.message ||
          "No se pudo crear el artículo con el nuevo slug.",
      });
    }

    /*
     * Después de crear correctamente el nuevo archivo,
     * eliminamos la versión anterior.
     */
    const deleteResult = await deleteFile({
      owner,
      repo,
      branch,
      path: currentPath,
      token,
      message: `Remove previous blog path: ${currentSlug}`,
      sha: currentSha,
    });

    if (!deleteResult.response.ok) {
      return jsonResponse(500, {
        error:
          "El artículo nuevo se creó, pero no se pudo eliminar el archivo anterior. Revisa el repositorio para evitar una publicación duplicada.",
        warning: deleteResult.data.message,
        newSlug,
        newPath,
      });
    }

    return jsonResponse(200, {
      success: true,
      renamed: true,
      previousSlug: currentSlug,
      slug: newSlug,
      path: newPath,
      message: "Artículo actualizado y slug modificado correctamente.",
    });
  } catch (error) {
    console.error("update-post error:", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al actualizar el artículo.",
    });
  }
}