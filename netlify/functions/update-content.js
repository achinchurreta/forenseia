import { verifySession } from "./_auth.js";

const CONTENT_TYPES = {
  course: {
    folder: "src/content/courses",
    label: "curso",
    permission: "courses",
    ownerField: "instructor",
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
    permission: "services",
    ownerField: "director",
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

const ROLE_RULES = {
  "director-ia": {
    owner: "Gonzalo García",

    course: {
      areas: ["Inteligencia Artificial"],
    },

    service: {
      areas: ["Inteligencia Artificial"],
    },
  },

  "director-psychology": {
    owner: "Tania Pérez",

    course: {
      areas: [
        "Psicología Criminal",
        "Psicología Educativa",
      ],
    },

    service: {
      areas: ["Psicología Criminal"],
    },
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

function quoted(value = "") {
  return `"${cleanText(value)}"`;
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

function normalizeStatus(value) {
  return value === "draft"
    ? "draft"
    : "published";
}

function normalizeBoolean(value) {
  return value === true || value === "true";
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

function normalizeOrder(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : 0;
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

function validatePayload(payload, config) {
  return [
    "currentSlug",
    "slug",
    ...config.requiredFields,
  ].filter(
    (field) =>
      !String(payload[field] ?? "").trim()
  );
}

function applyRoleRestrictions({
  user,
  payload,
  config,
  currentFrontmatter,
}) {
  if (user.role === "admin") {
    return {
      ...payload,
      area: String(payload.area || "").trim(),
      [config.ownerField]: String(
        payload[config.ownerField] || ""
      ).trim(),
    };
  }

  const roleRules = ROLE_RULES[user.role];
  const contentRules =
    roleRules?.[payload.contentType];

  if (!roleRules || !contentRules) {
    throw new Error(
      "Tu cuenta no tiene autorización para editar este tipo de contenido."
    );
  }

  const currentOwner = String(
    currentFrontmatter[config.ownerField] || ""
  ).trim();

  if (currentOwner !== roleRules.owner) {
    throw new Error(
      `No tienes permiso para editar este ${config.label}, porque pertenece a otra dirección.`
    );
  }

  const requestedArea = String(
    payload.area || ""
  ).trim();

  if (
    !contentRules.areas.includes(
      requestedArea
    )
  ) {
    throw new Error(
      "El área seleccionada no pertenece a tu dirección."
    );
  }

  return {
    ...payload,
    area: requestedArea,
    [config.ownerField]: roleRules.owner,
  };
}

function createCourseMarkdown(payload) {
  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(
      payload.description
    )}`,
    `area: ${quoted(payload.area)}`,
    `instructor: ${quoted(
      payload.instructor
    )}`,
    `duration: ${quoted(
      payload.duration
    )}`,
    `modality: ${quoted(
      payload.modality
    )}`,
    `level: ${quoted(payload.level)}`,
    `audience: ${quoted(
      payload.audience
    )}`,
    `status: ${quoted(
      normalizeStatus(payload.status)
    )}`,
    `featured: ${normalizeBoolean(
      payload.featured
    )}`,
    payload.cover
      ? `cover: ${quoted(payload.cover)}`
      : null,
    payload.price
      ? `price: ${quoted(payload.price)}`
      : null,
    `date: ${quoted(
      normalizeDate(payload.date)
    )}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(
    payload.content || ""
  ).trim()}\n`;
}

function createServiceMarkdown(payload) {
  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(
      payload.description
    )}`,
    `area: ${quoted(payload.area)}`,
    `director: ${quoted(
      payload.director
    )}`,
    `audience: ${quoted(
      payload.audience
    )}`,
    `status: ${quoted(
      normalizeStatus(payload.status)
    )}`,
    `featured: ${normalizeBoolean(
      payload.featured
    )}`,
    `order: ${normalizeOrder(
      payload.order
    )}`,
    payload.cover
      ? `cover: ${quoted(payload.cover)}`
      : null,
    `date: ${quoted(
      normalizeDate(payload.date)
    )}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(
    payload.content || ""
  ).trim()}\n`;
}

function createMarkdown(payload) {
  return payload.contentType === "course"
    ? createCourseMarkdown(payload)
    : createServiceMarkdown(payload);
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

  try {
    const rawPayload = JSON.parse(
      event.body || "{}"
    );

    const contentType = String(
      rawPayload.contentType || ""
    ).trim();

    const config = CONTENT_TYPES[contentType];

    if (!config) {
      return jsonResponse(400, {
        error: "Tipo de contenido no válido",
      });
    }

    if (
      !hasPermission(
        user,
        config.permission
      )
    ) {
      return jsonResponse(403, {
        error:
          `No tienes permiso para editar ${config.label}s`,
      });
    }

    const missingFields =
      validatePayload(
        rawPayload,
        config
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

    const currentSlug =
      createSafeSlug(
        rawPayload.currentSlug
      );

    const newSlug =
      createSafeSlug(
        rawPayload.slug
      );

    if (!currentSlug || !newSlug) {
      return jsonResponse(400, {
        error:
          "El slug actual o el nuevo slug no es válido.",
      });
    }

    const currentPath =
      `${config.folder}/${currentSlug}.mdx`;

    const newPath =
      `${config.folder}/${newSlug}.mdx`;

    /*
     * Primero se obtiene el archivo original.
     *
     * Esto permite:
     * 1. recuperar el SHA;
     * 2. identificar al responsable real;
     * 3. impedir editar contenido ajeno.
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
            `No se encontró el ${config.label} que deseas editar.`,
        });
      }

      return jsonResponse(
        currentFile.response.status,
        {
          error:
            currentFile.data.message ||
            `No fue posible consultar el ${config.label} actual.`,
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
          "GitHub no devolvió el SHA del archivo actual.",
      });
    }

    if (!encodedContent) {
      return jsonResponse(500, {
        error:
          "GitHub no devolvió el contenido necesario para comprobar el responsable.",
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
          "No fue posible leer los datos editoriales del contenido actual.",
      });
    }

    const payload =
      applyRoleRestrictions({
        user,
        payload: {
          ...rawPayload,
          contentType,
        },
        config,
        currentFrontmatter,
      });

    if (
      !String(
        payload[config.ownerField] || ""
      ).trim()
    ) {
      return jsonResponse(400, {
        error:
          `El responsable del ${config.label} es obligatorio.`,
      });
    }

    const markdown =
      createMarkdown(payload);

    /*
     * CASO 1:
     * El slug permanece igual.
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
            `Update ${config.label}: ${payload.title}`,
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
              `No se pudo actualizar el ${config.label}.`,
          }
        );
      }

      return jsonResponse(200, {
        success: true,
        contentType,
        renamed: false,
        slug: newSlug,
        path: currentPath,
        area: payload.area,
        responsible:
          payload[config.ownerField],
        status: normalizeStatus(
          payload.status
        ),
        updatedBy: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        message:
          `${config.label.charAt(0).toUpperCase()}${config.label.slice(
            1
          )} actualizado correctamente.`,
      });
    }

    /*
     * CASO 2:
     * El slug cambió.
     *
     * Se comprueba que el destino no exista.
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
          `Ya existe otro ${config.label} con el nuevo slug.`,
      });
    }

    if (
      destinationFile.response.status !==
      404
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
     * Primero se crea la nueva ruta.
     */
    const createResult =
      await writeGitHubFile({
        owner,
        repo,
        branch,
        path: newPath,
        token,
        message:
          `Rename ${config.label}: ${currentSlug} to ${newSlug}`,
        content: markdown,
      });

    if (!createResult.response.ok) {
      return jsonResponse(
        createResult.response.status,
        {
          error:
            createResult.data.message ||
            `No se pudo crear el ${config.label} con el nuevo slug.`,
        }
      );
    }

    /*
     * Después se elimina la ruta anterior.
     */
    const deleteResult =
      await removeGitHubFile({
        owner,
        repo,
        branch,
        path: currentPath,
        token,
        message:
          `Remove previous ${config.label} path: ${currentSlug}`,
        sha: currentSha,
      });

    if (!deleteResult.response.ok) {
      return jsonResponse(500, {
        error:
          `El ${config.label} actualizado se creó con el nuevo slug, pero no fue posible eliminar el archivo anterior.`,
        warning:
          deleteResult.data.message,
        newSlug,
        newPath,
      });
    }

    return jsonResponse(200, {
      success: true,
      contentType,
      renamed: true,
      previousSlug: currentSlug,
      slug: newSlug,
      path: newPath,
      area: payload.area,
      responsible:
        payload[config.ownerField],
      status: normalizeStatus(
        payload.status
      ),
      updatedBy: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message:
        `${config.label.charAt(0).toUpperCase()}${config.label.slice(
          1
        )} actualizado y slug modificado correctamente.`,
    });
  } catch (error) {
    console.error(
      "update-content error:",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al actualizar el contenido.",
    });
  }
}