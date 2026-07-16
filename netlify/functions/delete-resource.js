import { verifySession } from "./_auth.js";

const ROLE_OWNERS = {
  "director-ia": "Gonzalo García",
  "director-psychology": "Tania Pérez",
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

function hasPermission(user, permission) {
  const permissions = Array.isArray(user?.permissions)
    ? user.permissions
    : [];

  return (
    permissions.includes("*") ||
    permissions.includes(permission)
  );
}

function githubHeaders(token, includeContentType = false) {
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

function canDeleteResource(user, frontmatter) {
  if (user.role === "admin") {
    return true;
  }

  const expectedAuthor =
    ROLE_OWNERS[user.role];

  if (!expectedAuthor) {
    return false;
  }

  const currentAuthor = String(
    frontmatter.author || ""
  ).trim();

  return currentAuthor === expectedAuthor;
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

async function removeGitHubFile({
  owner,
  repo,
  branch,
  path,
  token,
  sha,
  message,
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}`,
    {
      method: "DELETE",
      headers: githubHeaders(
        token,
        true
      ),
      body: JSON.stringify({
        message,
        sha,
        branch,
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
        "No tienes permiso para eliminar recursos.",
    });
  }

  try {
    const payload = JSON.parse(
      event.body || "{}"
    );

    const slug = createSafeSlug(
      payload.slug
    );

    if (!slug) {
      return jsonResponse(400, {
        error:
          "El slug recibido no es válido.",
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

    const path =
      `src/content/resources/${slug}.mdx`;

    const fileResult =
      await getGitHubFile({
        owner,
        repo,
        branch,
        path,
        token,
      });

    if (!fileResult.response.ok) {
      if (
        fileResult.response.status === 404
      ) {
        return jsonResponse(404, {
          error:
            "No se encontró el recurso.",
        });
      }

      return jsonResponse(
        fileResult.response.status,
        {
          error:
            fileResult.data.message ||
            "No fue posible consultar el recurso.",
        }
      );
    }

    const sha =
      fileResult.data.sha;

    const encodedContent =
      fileResult.data.content;

    if (!sha) {
      return jsonResponse(500, {
        error:
          "GitHub no devolvió el SHA requerido para eliminar el recurso.",
      });
    }

    if (!encodedContent) {
      return jsonResponse(500, {
        error:
          "GitHub no devolvió el contenido necesario para comprobar el autor.",
      });
    }

    const markdown =
      decodeGitHubContent(
        encodedContent
      );

    const frontmatter =
      parseFrontmatter(markdown);

    if (
      !frontmatter ||
      Object.keys(frontmatter).length === 0
    ) {
      return jsonResponse(500, {
        error:
          "No fue posible leer los datos editoriales del recurso.",
      });
    }

    if (
      !canDeleteResource(
        user,
        frontmatter
      )
    ) {
      return jsonResponse(403, {
        error:
          "No tienes permiso para eliminar este recurso porque pertenece a otra dirección.",
      });
    }

    const title = String(
      frontmatter.title || slug
    ).trim();

    const deleteResult =
      await removeGitHubFile({
        owner,
        repo,
        branch,
        path,
        token,
        sha,
        message:
          `Delete resource: ${title}`,
      });

    if (!deleteResult.response.ok) {
      return jsonResponse(
        deleteResult.response.status,
        {
          error:
            deleteResult.data.message ||
            "No se pudo eliminar el recurso.",
        }
      );
    }

    return jsonResponse(200, {
      success: true,
      slug,
      path,
      title,
      deletedBy: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message:
        "Recurso eliminado correctamente.",
    });
  } catch (error) {
    console.error(
      "delete-resource error:",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al eliminar el recurso.",
    });
  }
}