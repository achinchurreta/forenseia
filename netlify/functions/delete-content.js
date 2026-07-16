import { verifySession } from "./_auth.js";

const CONTENT_TYPES = {
  course: {
    folder: "src/content/courses",
    label: "curso",
  },

  service: {
    folder: "src/content/services",
    label: "servicio",
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

    const slug = createSlug(payload.slug);

    if (!slug) {
      return jsonResponse(400, {
        error: "Slug no válido",
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

    const path = `${config.folder}/${slug}.mdx`;

    const fileResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
      {
        headers: githubHeaders(token),
      }
    );

    const fileData = await readResponse(fileResponse);

    if (!fileResponse.ok) {
      return jsonResponse(fileResponse.status, {
        error:
          fileData.message ||
          `No se encontró el ${config.label}`,
      });
    }

    if (!fileData.sha) {
      return jsonResponse(500, {
        error: "GitHub no devolvió el SHA del archivo",
      });
    }

    const deleteResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      {
        method: "DELETE",
        headers: githubHeaders(token, true),
        body: JSON.stringify({
          message: `Delete ${config.label}: ${slug}`,
          sha: fileData.sha,
          branch,
        }),
      }
    );

    const deleteData = await readResponse(deleteResponse);

    if (!deleteResponse.ok) {
      return jsonResponse(deleteResponse.status, {
        error:
          deleteData.message ||
          `No se pudo eliminar el ${config.label}`,
      });
    }

    return jsonResponse(200, {
      success: true,
      slug,
      path,
    });
  } catch (error) {
    console.error("delete-content error:", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al eliminar el contenido",
    });
  }
}