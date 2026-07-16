import { verifySession } from "./_auth.js";

const CONTENT_CONFIG = {
  course: {
    folder: "src/content/courses",
    permission: "courses",
    label: "curso",
    commitPrefix: "Add course",
  },

  service: {
    folder: "src/content/services",
    permission: "services",
    label: "servicio",
    commitPrefix: "Add service",
  },
};

const ROLE_RULES = {
  "director-ia": {
    course: {
      instructor: "Gonzalo García",
      areas: ["Inteligencia Artificial"],
    },

    service: {
      director: "Gonzalo García",
      areas: ["Inteligencia Artificial"],
    },
  },

  "director-psychology": {
    course: {
      instructor: "Tania Pérez",
      areas: [
        "Psicología Criminal",
        "Psicología Educativa",
      ],
    },

    service: {
      director: "Tania Pérez",
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

function normalizeStatus(value) {
  return value === "draft" ? "draft" : "published";
}

function normalizeBoolean(value) {
  return value === true || value === "true";
}

function applyRoleRestrictions(user, payload) {
  if (user.role === "admin") {
    return payload;
  }

  const rules = ROLE_RULES[user.role]?.[payload.contentType];

  if (!rules) {
    throw new Error(
      "Tu cuenta no tiene autorización para publicar este tipo de contenido."
    );
  }

  const requestedArea = String(payload.area || "").trim();

  if (!rules.areas.includes(requestedArea)) {
    throw new Error(
      "El área seleccionada no pertenece a tu dirección."
    );
  }

  if (payload.contentType === "course") {
    return {
      ...payload,
      instructor: rules.instructor,
      area: requestedArea,
    };
  }

  return {
    ...payload,
    director: rules.director,
    area: requestedArea,
  };
}

function validateCourse(payload) {
  const requiredFields = [
    "title",
    "description",
    "area",
    "instructor",
    "duration",
    "modality",
    "level",
    "audience",
    "content",
  ];

  return requiredFields.filter(
    (field) => !String(payload[field] || "").trim()
  );
}

function validateService(payload) {
  const requiredFields = [
    "title",
    "description",
    "area",
    "director",
    "audience",
    "content",
  ];

  return requiredFields.filter(
    (field) => !String(payload[field] || "").trim()
  );
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
    `status: ${quoted(normalizeStatus(payload.status))}`,
    `featured: ${normalizeBoolean(payload.featured)}`,
    payload.cover
      ? `cover: ${quoted(payload.cover)}`
      : null,
    payload.price
      ? `price: ${quoted(payload.price)}`
      : null,
    `date: ${quoted(new Date().toISOString())}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(payload.content).trim()}\n`;
}

function createServiceMarkdown(payload) {
  const safeOrder = Number.isFinite(Number(payload.order))
    ? Number(payload.order)
    : 0;

  const frontmatter = [
    "---",
    `title: ${quoted(payload.title)}`,
    `description: ${quoted(payload.description)}`,
    `area: ${quoted(payload.area)}`,
    `director: ${quoted(payload.director)}`,
    `audience: ${quoted(payload.audience)}`,
    `status: ${quoted(normalizeStatus(payload.status))}`,
    `featured: ${normalizeBoolean(payload.featured)}`,
    `order: ${safeOrder}`,
    payload.cover
      ? `cover: ${quoted(payload.cover)}`
      : null,
    `date: ${quoted(new Date().toISOString())}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return `${frontmatter}\n\n${String(payload.content).trim()}\n`;
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

  return {
    response,
    data: await readGitHubResponse(response),
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
    const rawPayload = JSON.parse(event.body || "{}");
    const config = CONTENT_CONFIG[rawPayload.contentType];

    if (!config) {
      return jsonResponse(400, {
        error: "Tipo de contenido no válido",
      });
    }

    const permissions = Array.isArray(user.permissions)
      ? user.permissions
      : [];

    const authorized =
      permissions.includes("*") ||
      permissions.includes(config.permission);

    if (!authorized) {
      return jsonResponse(403, {
        error: `No tienes permiso para crear ${config.label}s`,
      });
    }

    const payload = applyRoleRestrictions(
      user,
      rawPayload
    );

    const missingFields =
      payload.contentType === "course"
        ? validateCourse(payload)
        : validateService(payload);

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

    const slug = createSlug(
      payload.slug || payload.title
    );

    if (!slug) {
      return jsonResponse(400, {
        error: "No fue posible crear un slug válido",
      });
    }

    const path = `${config.folder}/${slug}.mdx`;

    const currentFile = await githubFileExists({
      owner,
      repo,
      branch,
      path,
      token,
    });

    if (currentFile.response.ok) {
      return jsonResponse(409, {
        error:
          "Ya existe contenido con ese slug. Utiliza uno diferente.",
      });
    }

    if (currentFile.response.status !== 404) {
      return jsonResponse(currentFile.response.status, {
        error:
          currentFile.data.message ||
          "No fue posible verificar el archivo en GitHub.",
      });
    }

    const markdown =
      payload.contentType === "course"
        ? createCourseMarkdown(payload)
        : createServiceMarkdown(payload);

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
          message: `${config.commitPrefix}: ${payload.title}`,
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
          `No se pudo crear el ${config.label}`,
      });
    }

    return jsonResponse(200, {
      success: true,
      contentType: payload.contentType,
      slug,
      path,
      area: payload.area,
      responsible:
        payload.contentType === "course"
          ? payload.instructor
          : payload.director,
      status: normalizeStatus(payload.status),
    });
  } catch (error) {
    console.error("create-content error:", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al crear el contenido",
    });
  }
}