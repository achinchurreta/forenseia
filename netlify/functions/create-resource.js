import { verifySession } from "./_auth.js";

const ROLE_RULES = {
  "director-ia": {
    author: "Gonzalo García",
    areas: [
      "Inteligencia Artificial",
      "Gobierno Digital",
      "Automatización",
    ],
  },

  "director-psychology": {
    author: "Tania Pérez",
    areas: [
      "Psicología Criminal",
      "Psicología Educativa",
      "Análisis Conductual",
    ],
  },
};

const ALLOWED_TYPES = [
  "Guía",
  "Checklist",
  "Plantilla",
  "Ebook",
  "Infografía",
  "Presentación",
  "Manual",
  "Matriz",
  "Otro",
];

const ALLOWED_AREAS = [
  "Inteligencia Artificial",
  "Gobierno Digital",
  "Automatización",
  "Investigación Digital",
  "Ciberseguridad",
  "OSINT",
  "Inteligencia Patrimonial",
  "Psicología Criminal",
  "Psicología Educativa",
  "Análisis Conductual",
];

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

function normalizeOrder(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : 0;
}

function normalizeOptionalUrl(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://")
  ) {
    return normalized;
  }

  throw new Error(
    "Las URLs deben comenzar con /, https:// o http://."
  );
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

function applyRoleRestrictions(user, payload) {
  const requestedArea = String(
    payload.area || ""
  ).trim();

  if (user.role === "admin") {
    if (!ALLOWED_AREAS.includes(requestedArea)) {
      throw new Error(
        "El área seleccionada no es válida."
      );
    }

    return {
      ...payload,
      area: requestedArea,
      author: String(
        payload.author || "ForenseIA"
      ).trim(),
    };
  }

  const rules = ROLE_RULES[user.role];

  if (!rules) {
    throw new Error(
      "Tu cuenta no tiene autorización para publicar recursos."
    );
  }

  if (!rules.areas.includes(requestedArea)) {
    throw new Error(
      "El área seleccionada no pertenece a tu dirección."
    );
  }

  return {
    ...payload,
    area: requestedArea,
    author: rules.author,
  };
}

function validatePayload(payload) {
  const requiredFields = [
    "title",
    "description",
    "type",
    "area",
    "author",
    "audience",
    "downloadUrl",
    "content",
  ];

  return requiredFields.filter(
    (field) =>
      !String(payload[field] ?? "").trim()
  );
}

function createMarkdown(payload) {
  const downloadUrl = normalizeOptionalUrl(
    payload.downloadUrl
  );

  const relatedService = normalizeOptionalUrl(
    payload.relatedService
  );

  const relatedCourse = normalizeOptionalUrl(
    payload.relatedCourse
  );

  const relatedPost = normalizeOptionalUrl(
    payload.relatedPost
  );

  const cover = normalizeOptionalUrl(
    payload.cover
  );

  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `type: ${quoted(payload.type)}`,
    `area: ${quoted(payload.area)}`,
    `author: ${quoted(payload.author)}`,
    `audience: ${quoted(payload.audience)}`,
    `downloadUrl: ${quoted(downloadUrl)}`,
    `requiresLead: ${normalizeBoolean(
      payload.requiresLead
    )}`,
    payload.campaign
      ? `campaign: ${quoted(payload.campaign)}`
      : null,
    relatedService
      ? `relatedService: ${quoted(relatedService)}`
      : null,
    relatedCourse
      ? `relatedCourse: ${quoted(relatedCourse)}`
      : null,
    relatedPost
      ? `relatedPost: ${quoted(relatedPost)}`
      : null,
    `status: ${quoted(
      normalizeStatus(payload.status)
    )}`,
    `featured: ${normalizeBoolean(
      payload.featured
    )}`,
    `order: ${normalizeOrder(payload.order)}`,
    cover
      ? `cover: ${quoted(cover)}`
      : null,
    payload.fileFormat
      ? `fileFormat: ${quoted(
          payload.fileFormat
        )}`
      : null,
    payload.fileSize
      ? `fileSize: ${quoted(
          payload.fileSize
        )}`
      : null,
    `date: ${quoted(
      new Date().toISOString()
    )}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(
    payload.content || ""
  ).trim()}\n`;
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

async function createGitHubFile({
  owner,
  repo,
  branch,
  path,
  token,
  message,
  content,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}`,
    {
      method: "PUT",
      headers: githubHeaders(
        token,
        true
      ),
      body: JSON.stringify({
        message,
        branch,
        content: Buffer.from(
          content,
          "utf8"
        ).toString("base64"),
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

  if (!hasPermission(user, "resources")) {
    return jsonResponse(403, {
      error:
        "No tienes permiso para publicar recursos.",
    });
  }

  try {
    const rawPayload = JSON.parse(
      event.body || "{}"
    );

    if (
      !ALLOWED_TYPES.includes(
        String(rawPayload.type || "").trim()
      )
    ) {
      return jsonResponse(400, {
        error:
          "El tipo de recurso seleccionado no es válido.",
      });
    }

    const payload =
      applyRoleRestrictions(
        user,
        rawPayload
      );

    const missingFields =
      validatePayload(payload);

    if (missingFields.length > 0) {
      return jsonResponse(400, {
        error:
          `Faltan campos obligatorios: ${missingFields.join(
            ", "
          )}`,
      });
    }

    if (
      String(payload.description).length >
      300
    ) {
      return jsonResponse(400, {
        error:
          "La descripción no puede superar los 300 caracteres.",
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

    const slug = createSafeSlug(
      payload.slug || payload.title
    );

    if (!slug) {
      return jsonResponse(400, {
        error:
          "No fue posible generar un slug válido.",
      });
    }

    const path =
      `src/content/resources/${slug}.mdx`;

    const existingFile =
      await getGitHubFile({
        owner,
        repo,
        branch,
        path,
        token,
      });

    if (existingFile.response.ok) {
      return jsonResponse(409, {
        error:
          "Ya existe un recurso con ese slug. Utiliza uno diferente.",
      });
    }

    if (
      existingFile.response.status !== 404
    ) {
      return jsonResponse(
        existingFile.response.status,
        {
          error:
            existingFile.data.message ||
            "No fue posible comprobar el recurso en GitHub.",
        }
      );
    }

    const markdown =
      createMarkdown(payload);

    const createResult =
      await createGitHubFile({
        owner,
        repo,
        branch,
        path,
        token,
        message:
          `Add resource: ${payload.title}`,
        content: markdown,
      });

    if (!createResult.response.ok) {
      return jsonResponse(
        createResult.response.status,
        {
          error:
            createResult.data.message ||
            "No se pudo crear el recurso.",
        }
      );
    }

    return jsonResponse(200, {
      success: true,
      slug,
      path,
      title: payload.title,
      type: payload.type,
      area: payload.area,
      author: payload.author,
      status: normalizeStatus(
        payload.status
      ),
      requiresLead:
        normalizeBoolean(
          payload.requiresLead
        ),
      createdBy: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message:
        "Recurso creado correctamente. Netlify iniciará un nuevo despliegue.",
    });
  } catch (error) {
    console.error(
      "create-resource error:",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al crear el recurso.",
    });
  }
}