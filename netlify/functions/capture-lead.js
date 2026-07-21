const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_LENGTHS = {
  name: 120,
  email: 180,
  phone: 40,
  institution: 180,
  position: 120,
  interest: 180,
  resourceSlug: 160,
  resourceTitle: 220,
  resourceAuthor: 120,
  resourceArea: 160,
  resourceType: 80,
  resourceUrl: 500,
  campaign: 160,
  source: 80,
  pageUrl: 500,
};

function jsonResponse(
  statusCode,
  body,
  extraHeaders = {}
) {
  return {
    statusCode,

    headers: {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      ...extraHeaders,
    },

    body: JSON.stringify(body),
  };
}

function sanitizeText(
  value = "",
  maxLength = 300
) {
  return String(value)
    .replace(/\0/g, "")
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeBoolean(value) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function normalizePayload(rawPayload = {}) {
  return {
    name: sanitizeText(
      rawPayload.name,
      MAX_LENGTHS.name
    ),

    email: sanitizeText(
      rawPayload.email,
      MAX_LENGTHS.email
    ).toLowerCase(),

    phone: sanitizeText(
      rawPayload.phone,
      MAX_LENGTHS.phone
    ),

    institution: sanitizeText(
      rawPayload.institution,
      MAX_LENGTHS.institution
    ),

    position: sanitizeText(
      rawPayload.position,
      MAX_LENGTHS.position
    ),

    interest: sanitizeText(
      rawPayload.interest,
      MAX_LENGTHS.interest
    ),

    consent: normalizeBoolean(
      rawPayload.consent
    ),

    resourceSlug: sanitizeText(
      rawPayload.resourceSlug,
      MAX_LENGTHS.resourceSlug
    ),

    resourceTitle: sanitizeText(
      rawPayload.resourceTitle,
      MAX_LENGTHS.resourceTitle
    ),

    resourceAuthor: sanitizeText(
      rawPayload.resourceAuthor,
      MAX_LENGTHS.resourceAuthor
    ),

    resourceArea: sanitizeText(
      rawPayload.resourceArea,
      MAX_LENGTHS.resourceArea
    ),

    resourceType: sanitizeText(
      rawPayload.resourceType,
      MAX_LENGTHS.resourceType
    ),

    resourceUrl: sanitizeText(
      rawPayload.resourceUrl,
      MAX_LENGTHS.resourceUrl
    ),

    campaign: sanitizeText(
      rawPayload.campaign,
      MAX_LENGTHS.campaign
    ),

    source: sanitizeText(
      rawPayload.source,
      MAX_LENGTHS.source
    ),

    pageUrl: sanitizeText(
      rawPayload.pageUrl,
      MAX_LENGTHS.pageUrl
    ),

    website: sanitizeText(
      rawPayload.website,
      120
    ),
  };
}

function validatePayload(payload) {
  const errors = [];

  if (!payload.name) {
    errors.push(
      "El nombre es obligatorio."
    );
  }

  if (!payload.email) {
    errors.push(
      "El correo electrónico es obligatorio."
    );
  } else if (
    !EMAIL_PATTERN.test(payload.email)
  ) {
    errors.push(
      "El correo electrónico no es válido."
    );
  }

  if (!payload.interest) {
    errors.push(
      "Selecciona un área de interés."
    );
  }

  if (!payload.resourceSlug) {
    errors.push(
      "No fue posible identificar el recurso."
    );
  }

  if (!payload.resourceTitle) {
    errors.push(
      "No fue posible identificar el título del recurso."
    );
  }

  if (!payload.consent) {
    errors.push(
      "Debes aceptar el uso de datos."
    );
  }

  return errors;
}

function getClientIp(event) {
  const forwardedFor =
    event.headers?.[
      "x-forwarded-for"
    ] ||
    event.headers?.[
      "X-Forwarded-For"
    ] ||
    "";

  return sanitizeText(
    String(forwardedFor)
      .split(",")[0]
      .trim(),
    80
  );
}

function buildAdminEmail({
  payload,
  submittedAt,
  clientIp,
}) {
  const fields = [
    [
      "Nombre",
      payload.name,
    ],

    [
      "Correo",
      payload.email,
    ],

    [
      "Teléfono",
      payload.phone || "No proporcionado",
    ],

    [
      "Institución",
      payload.institution ||
        "No proporcionada",
    ],

    [
      "Cargo o actividad",
      payload.position ||
        "No proporcionado",
    ],

    [
      "Interés",
      payload.interest,
    ],

    [
      "Recurso",
      payload.resourceTitle,
    ],

    [
      "Tipo de recurso",
      payload.resourceType ||
        "No especificado",
    ],

    [
      "Área del recurso",
      payload.resourceArea ||
        "No especificada",
    ],

    [
      "Autor",
      payload.resourceAuthor ||
        "No especificado",
    ],

    [
      "Campaña",
      payload.campaign ||
        "Sin campaña",
    ],

    [
      "Fuente",
      payload.source ||
        "resource-download",
    ],

    [
      "Fecha",
      submittedAt,
    ],

    [
      "IP",
      clientIp ||
        "No disponible",
    ],
  ];

  const rows = fields
    .map(
      ([label, value]) => `
        <tr>
          <td
            style="
              padding:12px;
              border:1px solid #dddddd;
              font-weight:700;
              width:190px;
              vertical-align:top;
            "
          >
            ${escapeHtml(label)}
          </td>

          <td
            style="
              padding:12px;
              border:1px solid #dddddd;
              vertical-align:top;
            "
          >
            ${escapeHtml(value)}
          </td>
        </tr>
      `
    )
    .join("");

  const resourceLink =
    payload.pageUrl ||
    payload.resourceUrl ||
    "";

  return `
    <!DOCTYPE html>
    <html lang="es">
      <body
        style="
          margin:0;
          background:#f4f4f4;
          color:#151515;
          font-family:Arial,sans-serif;
        "
      >
        <div
          style="
            max-width:760px;
            margin:0 auto;
            padding:32px 18px;
          "
        >
          <div
            style="
              background:#050505;
              color:#ffffff;
              padding:28px;
              border-top:4px solid #c8a96b;
            "
          >
            <p
              style="
                margin:0;
                color:#c8a96b;
                font-size:12px;
                letter-spacing:3px;
                text-transform:uppercase;
              "
            >
              ForenseIA
            </p>

            <h1
              style="
                margin:14px 0 0;
                font-size:28px;
              "
            >
              Nuevo prospecto desde recursos
            </h1>

            <p
              style="
                margin:14px 0 0;
                color:#bdbdbd;
                line-height:1.6;
              "
            >
              Una persona solicitó acceso a un
              recurso descargable.
            </p>
          </div>

          <div
            style="
              background:#ffffff;
              padding:26px;
            "
          >
            <table
              style="
                width:100%;
                border-collapse:collapse;
                font-size:14px;
              "
            >
              ${rows}
            </table>

            ${
              resourceLink
                ? `
                  <p
                    style="
                      margin:26px 0 0;
                    "
                  >
                    <a
                      href="${escapeHtml(
                        resourceLink
                      )}"
                      style="
                        display:inline-block;
                        background:#c8a96b;
                        color:#000000;
                        padding:13px 20px;
                        text-decoration:none;
                        font-weight:700;
                      "
                    >
                      Abrir recurso
                    </a>
                  </p>
                `
                : ""
            }

            <p
              style="
                margin:26px 0 0;
                color:#666666;
                font-size:12px;
                line-height:1.6;
              "
            >
              El prospecto aceptó el uso de sus
              datos para recibir el material e
              información relacionada.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildUserEmail({
  payload,
  downloadUrl,
}) {
  return `
    <!DOCTYPE html>
    <html lang="es">
      <body
        style="
          margin:0;
          background:#f4f4f4;
          color:#151515;
          font-family:Arial,sans-serif;
        "
      >
        <div
          style="
            max-width:680px;
            margin:0 auto;
            padding:32px 18px;
          "
        >
          <div
            style="
              background:#050505;
              color:#ffffff;
              padding:30px;
              border-top:4px solid #c8a96b;
            "
          >
            <p
              style="
                margin:0;
                color:#c8a96b;
                font-size:12px;
                letter-spacing:3px;
                text-transform:uppercase;
              "
            >
              ForenseIA
            </p>

            <h1
              style="
                margin:16px 0 0;
                font-size:28px;
                line-height:1.25;
              "
            >
              Tu recurso está listo
            </h1>
          </div>

          <div
            style="
              background:#ffffff;
              padding:30px;
            "
          >
            <p
              style="
                margin:0;
                line-height:1.7;
              "
            >
              Hola
              <strong>
                ${escapeHtml(payload.name)}
              </strong>,
            </p>

            <p
              style="
                margin:18px 0 0;
                line-height:1.7;
              "
            >
              Gracias por solicitar:
            </p>

            <h2
              style="
                margin:12px 0 0;
                font-size:22px;
              "
            >
              ${escapeHtml(
                payload.resourceTitle
              )}
            </h2>

            <p
              style="
                margin:18px 0 0;
                color:#555555;
                line-height:1.7;
              "
            >
              Puedes acceder al material desde el
              siguiente botón:
            </p>

            <p
              style="
                margin:26px 0 0;
              "
            >
              <a
                href="${escapeHtml(downloadUrl)}"
                style="
                  display:inline-block;
                  background:#c8a96b;
                  color:#000000;
                  padding:14px 22px;
                  text-decoration:none;
                  font-weight:700;
                "
              >
                Descargar recurso
              </a>
            </p>

            <p
              style="
                margin:26px 0 0;
                color:#666666;
                font-size:13px;
                line-height:1.7;
              "
            >
              ForenseIA desarrolla contenido,
              cursos y servicios especializados
              en inteligencia artificial,
              investigación digital,
              ciberseguridad y psicología criminal.
            </p>

            <p
              style="
                margin:24px 0 0;
                font-size:13px;
              "
            >
              <a
                href="https://forenseia.org/contacto"
                style="
                  color:#9a762d;
                "
              >
                Contactar al equipo
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendEmail({
  apiKey,
  from,
  to,
  replyTo,
  subject,
  html,
}) {
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${apiKey}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        from,

        to: Array.isArray(to)
          ? to
          : [to],

        subject,

        html,

        ...(replyTo
          ? {
              reply_to: replyTo,
            }
          : {}),
      }),
    }
  );

  const text = await response.text();

  let data = {};

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    data = {
      message: text,
    };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error ||
        "El servicio de correo rechazó la solicitud."
    );
  }

  return data;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error:
        "Método no permitido.",
    });
  }

  try {
    const rawPayload = JSON.parse(
      event.body || "{}"
    );

    const payload =
      normalizePayload(rawPayload);

    /*
     * Honeypot anti-spam.
     * Los usuarios reales no llenan este campo.
     */
    if (payload.website) {
      return jsonResponse(200, {
        success: true,
      });
    }

    const validationErrors =
      validatePayload(payload);

    if (
      validationErrors.length > 0
    ) {
      return jsonResponse(400, {
        error:
          validationErrors[0],

        errors:
          validationErrors,
      });
    }

    const apiKey =
      process.env.RESEND_API_KEY;

    const from =
      process.env.LEADS_FROM_EMAIL;

    const notificationEmail =
      process.env.LEADS_NOTIFICATION_EMAIL;

    if (
      !apiKey ||
      !from ||
      !notificationEmail
    ) {
      return jsonResponse(500, {
        error:
          "El sistema de notificaciones todavía no está configurado.",
      });
    }

    /*
     * El formulario no envía downloadUrl
     * actualmente por seguridad.
     *
     * Esta variable permite enviar al usuario
     * el enlace del recurso cuando se agregue al
     * payload o cuando quieras habilitarlo.
     */
    const downloadUrl =
      sanitizeText(
        rawPayload.downloadUrl || "",
        500
      );

    const submittedAt =
      new Intl.DateTimeFormat(
        "es-MX",
        {
          dateStyle: "full",
          timeStyle: "medium",
          timeZone:
            "America/Mexico_City",
        }
      ).format(new Date());

    const clientIp =
      getClientIp(event);

    await sendEmail({
      apiKey,

      from,

      to:
        notificationEmail
          .split(",")
          .map((email) =>
            email.trim()
          )
          .filter(Boolean),

      replyTo:
        payload.email,

      subject:
        `Nuevo prospecto: ${payload.resourceTitle}`,

      html:
        buildAdminEmail({
          payload,
          submittedAt,
          clientIp,
        }),
    });

    /*
     * El correo para el usuario es opcional.
     * Solo se envía cuando el frontend incluye
     * downloadUrl.
     */
    if (downloadUrl) {
      try {
        await sendEmail({
          apiKey,

          from,

          to:
            payload.email,

          subject:
            `Tu recurso: ${payload.resourceTitle}`,

          html:
            buildUserEmail({
              payload,
              downloadUrl,
            }),
        });
      } catch (emailError) {
        console.error(
          "User confirmation email error:",
          emailError
        );

        /*
         * No bloqueamos la descarga:
         * el aviso interno ya fue enviado.
         */
      }
    }

    return jsonResponse(200, {
      success: true,

      message:
        "Solicitud registrada correctamente.",

      resourceSlug:
        payload.resourceSlug,

      campaign:
        payload.campaign,
    });
  } catch (error) {
    console.error(
      "capture-lead error:",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "No fue posible registrar la solicitud.",
    });
  }
}