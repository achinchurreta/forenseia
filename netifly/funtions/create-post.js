export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, message: "Función activa" }),
  };
}