import { verifySession } from "./_auth.js";

const ROLE_RULES = {
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
  return value === "draft"
    ? "draft"
    : "published";
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const rawValue = String(value).trim();

  const parsedDate = rawValue.includes("T")
    ? new Date(rawValue)
    : new Date(`${rawValue}T12:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function hasPermission(user, permission) {
  const permissions = Array.isArray(user?.permissions)
    ? user.permissions
    : [];

  return (
    permissions.includes("*") ||
    permissions.includes(permission)
  );
}

function githubHeaders(
  token,
  includeContentType = false
) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "forenseia-dashboard",
    ...(includeContentType
      ? {
          "Content-Type": "application/json",
        }
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

function decodeGitHubContent(content = "") {
  try {
    return Buffer.from(
      String(content).replace(/\n/g, ""),
      "base64"
    ).toString("utf8");
  } catch (error) {
    console.error(
      "GitHub content decode error:",
      error
    );

    return "";
  }
}

function removeWrappingQuotes(value = "") {
  const trimmed = String(value).trim();

  if (
    (trimmed.startsWith('"') &&
      trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") &&
      trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFrontmatter(markdown = "") {
  const normalized = String(markdown).replace(
    /\r\n/g,
    "\n"
  );

  if (!normalized.startsWith("---\n")) {
    return {};
  }

  const closingIndex = normalized.indexOf(
    "\n---",
    4
  );

  if (closingIndex === -1) {
    return {};
  }

  const frontmatterText = normalized.slice(
    4,
    closingIndex
  );

  const data = {};

  frontmatterText
    .split("\n")
    .forEach((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return;
      }

      const key = line
        .slice(0, separatorIndex)
        .trim();

      const value = line
        .slice(separatorIndex + 1)
        .trim();

      if (!key) {
        return;
      }

      data[key] =
        removeWrappingQuotes(value);
    });

  return data;
}

function applyRoleRestrictions(
  user,
  payload,
  currentFrontmatter
) {
  if (user.role === "admin") {
    return {
      ...payload,
      author: String(
        payload.author || "ForenseIA"
      ).trim(),
      category: String(
        payload.category || ""
      ).trim(),
    };
  }

  const rules = ROLE_RULES[user.role];

  if (!rules) {
    throw new Error(
      "Tu cuenta no tiene autorización para editar artículos."
    );
  }

  const currentAuthor = String(
    currentFrontmatter.author || ""
  ).trim();

  if (currentAuthor !== rules.author) {
    throw new Error(
      "No tienes permiso para editar este artículo porque pertenece a otra dirección."
    );
  }

  const requestedCategory = String(
    payload.category || ""
  ).trim();

  if (
    !rules.categories.includes(
      requestedCategory
    )
  ) {
    throw new Error(
      "La categoría seleccionada no pertenece a tu dirección."
    );
  }

  return {
    ...payload,
    author: rules.author,
    category: requestedCategory,
  };
}

function createMarkdown(payload) {
  const tags = parseTags(payload.tags);
  const date = normalizeDate(payload.date);

  const frontmatter = [
    "---",
    `title: "${cleanText(payload.title)}"`,
    `description: "${cleanText(
      payload.description
    )}"`,
    `category: "${cleanText(
      payload.category
    )}"`,
    `date: "${date}"`,
    `author: "${cleanText(
      payload.author
    )}"`,
    `status: "${normalizeStatus(
      payload.status
    )}"`,
    payload.cover
      ? `cover: "${cleanText(
          payload.cover
        )}"`
      : null,
    `tags: ${JSON.stringify(tags)}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(
    payload.content || ""
  ).trim()}\n`;
}

async function getGitHubFile({
  owner,
  repo,
  branch,
  path,
  token,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}?ref=${encodeURIComponent(branch)}`,
    {
      method: "GET",
      headers: githubHeaders(token),
    }
  );

  return {
    response,
    data: await readResponse(response),
  };
}

async function writeGitHubFile({
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
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}`,
    {
      method: "PUT",
      headers: githubHeaders(token, true),
      body: JSON.stringify({
        message,
        branch,
        content: Buffer.from(
          content,
          "utf8"
        ).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    }
  );

  return {
    response,
    data: await readResponse(response),
  };
}

async function removeGitHubFile({
  owner,
  repo,
  branch,
  path,
  token,
  message,
  sha,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}`,
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

  if (!hasPermission(user, "posts")) {
    return jsonResponse(403, {
      error:
        "No tienes permiso para editar artículos",
    });
  }

  try {
    const rawPayload = JSON.parse(
      event.body || "{}"
    );

    const requiredFields = [
      "currentSlug",
      "slug",
      "title",
      "description",
      "category",
      "status",
      "content",
    ];

    const missingFields =
      requiredFields.filter(
        (field) =>
          !String(
            rawPayload[field] ?? ""
          ).trim()
      );

    if (missingFields.length > 0) {
      return jsonResponse(400, {
        error:
          `Faltan campos obligatorios: ${missingFields.join(
            ", "
          )}`,
      });
    }

    const token =
      process.env.GITHUB_TOKEN;

    const owner =
      process.env.GITHUB_OWNER;

    const repo =
      process.env.GITHUB_REPO;

    const branch =
      process.env.GITHUB_BRANCH ||
      "main";

    if (!token || !owner || !repo) {
      return jsonResponse(500, {
        error:
          "Faltan GITHUB_TOKEN, GITHUB_OWNER o GITHUB_REPO en Netlify.",
      });
    }

    const currentSlug = createSafeSlug(
      rawPayload.currentSlug
    );

    const newSlug = createSafeSlug(
      rawPayload.slug
    );

    if (!currentSlug || !newSlug) {
      return jsonResponse(400, {
        error:
          "El slug actual o el nuevo slug no es válido.",
      });
    }

    const currentPath =
      `src/content/blog/${currentSlug}.mdx`;

    const newPath =
      `src/content/blog/${newSlug}.mdx`;

    /*
     * Primero obtenemos el artículo original.
     * Además de obtener el SHA, esto permite
     * verificar quién es el autor real.
     */
    const currentFile =
      await getGitHubFile({
        owner,
        repo,
        branch,
        path: currentPath,
        token,
      });

    if (!currentFile.response.ok) {
      if (
        currentFile.response.status === 404
      ) {
        return jsonResponse(404, {
          error:
            "No se encontró el artículo que deseas editar.",
        });
      }

      return jsonResponse(
        currentFile.response.status,
        {
          error:
            currentFile.data.message ||
            "No fue posible consultar el artículo actual.",
        }
      );
    }

    const currentSha =
      currentFile.data.sha;

    const encodedContent =
      currentFile.data.content;

    if (!currentSha) {
      return jsonResponse(500, {
        error:
          "GitHub no devolvió el SHA del artículo actual.",
      });
    }

    if (!encodedContent) {
      return jsonResponse(500, {
        error:
          "GitHub no devolvió el contenido necesario para comprobar el autor.",
      });
    }

    const currentMarkdown =
      decodeGitHubContent(
        encodedContent
      );

    const currentFrontmatter =
      parseFrontmatter(
        currentMarkdown
      );

    if (
      !currentFrontmatter ||
      Object.keys(
        currentFrontmatter
      ).length === 0
    ) {
      return jsonResponse(500, {
        error:
          "No fue posible leer los datos editoriales del artículo actual.",
      });
    }

    const payload =
      applyRoleRestrictions(
        user,
        rawPayload,
        currentFrontmatter
      );

    if (
      !String(
        payload.author || ""
      ).trim()
    ) {
      return jsonResponse(400, {
        error:
          "El autor del artículo es obligatorio.",
      });
    }

    const markdown =
      createMarkdown(payload);

    /*
     * CASO 1:
     * El slug no cambió.
     */
    if (currentSlug === newSlug) {
      const updateResult =
        await writeGitHubFile({
          owner,
          repo,
          branch,
          path: currentPath,
          token,
          message:
            `Update blog post: ${payload.title}`,
          content: markdown,
          sha: currentSha,
        });

      if (
        !updateResult.response.ok
      ) {
        return jsonResponse(
          updateResult.response.status,
          {
            error:
              updateResult.data.message ||
              "No se pudo actualizar el artículo.",
          }
        );
      }

      return jsonResponse(200, {
        success: true,
        renamed: false,
        slug: newSlug,
        path: currentPath,
        author: payload.author,
        category: payload.category,
        status: normalizeStatus(
          payload.status
        ),
        updatedBy: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
        message:
          "Artículo actualizado correctamente.",
      });
    }

    /*
     * CASO 2:
     * El slug cambió.
     *
     * Antes de crear la nueva ruta,
     * comprobamos que no exista.
     */
    const destinationFile =
      await getGitHubFile({
        owner,
        repo,
        branch,
        path: newPath,
        token,
      });

    if (
      destinationFile.response.ok
    ) {
      return jsonResponse(409, {
        error:
          "Ya existe otro artículo con el nuevo slug.",
      });
    }

    if (
      destinationFile.response.status !== 404
    ) {
      return jsonResponse(
        destinationFile.response.status,
        {
          error:
            destinationFile.data.message ||
            "No fue posible comprobar el nuevo slug.",
        }
      );
    }

    /*
     * Creamos primero el artículo en la
     * nueva ubicación.
     */
    const createResult =
      await writeGitHubFile({
        owner,
        repo,
        branch,
        path: newPath,
        token,
        message:
          `Rename blog post: ${currentSlug} to ${newSlug}`,
        content: markdown,
      });

    if (!createResult.response.ok) {
      return jsonResponse(
        createResult.response.status,
        {
          error:
            createResult.data.message ||
            "No se pudo crear el artículo con el nuevo slug.",
        }
      );
    }

    /*
     * Cuando la ruta nueva ya existe,
     * eliminamos la anterior.
     */
    const deleteResult =
      await removeGitHubFile({
        owner,
        repo,
        branch,
        path: currentPath,
        token,
        message:
          `Remove previous blog path: ${currentSlug}`,
        sha: currentSha,
      });

    if (!deleteResult.response.ok) {
      return jsonResponse(500, {
        error:
          "El artículo actualizado se creó con el nuevo slug, pero no se pudo eliminar el archivo anterior.",
        warning:
          deleteResult.data.message,
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
      author: payload.author,
      category: payload.category,
      status: normalizeStatus(
        payload.status
      ),
      updatedBy: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      message:
        "Artículo actualizado y slug modificado correctamente.",
    });
  } catch (error) {
    console.error(
      "update-post error:",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al actualizar el artículo.",
    });
  }
}