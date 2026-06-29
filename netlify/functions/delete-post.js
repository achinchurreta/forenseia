import { verifySession } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  const user = verifySession(event);

  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No autorizado" }),
    };
  }

  try {
    const { slug } = JSON.parse(event.body);

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    const filePath = `src/content/blog/${slug}.mdx`;

    const getFile = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "forenseia-dashboard",
        },
      }
    );

    const fileData = await getFile.json();

    if (!getFile.ok) {
      return {
        statusCode: getFile.status,
        body: JSON.stringify({ error: fileData.message }),
      };
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "forenseia-dashboard",
        },
        body: JSON.stringify({
          message: `Delete blog post: ${slug}`,
          sha: fileData.sha,
          branch,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.message }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}