/**
 * "Te invitaron a una tutoría grupal": subject + HTML sent through Brevo
 * without a dashboard template (email.service → sendSessionInvitationEmail).
 *
 * Same look as the Brevo templates in docs/emails/: all CSS inline (Gmail and
 * Outlook drop most of <style>), Calico orange #ff9505 header and CTA, slate
 * greys. Every value is escaped: the inviter's name and the course name come
 * from the database, the rest from the server.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function row(label, value) {
  return `<tr>
                  <td style="padding:6px 0; font-size:13px; color:#64748b; width:90px; vertical-align:top;">${label}</td>
                  <td style="padding:6px 0; font-size:15px; color:#0f172a; font-weight:600;">${value}</td>
                </tr>`;
}

/**
 * @param {{ inviterName: string, courseName: string, tutorName: string,
 *   startTime: string, endTime: string, invitationLink: string }} params
 * @returns {{ subject: string, htmlContent: string }}
 */
export function sessionInvitationEmail({ inviterName, courseName, tutorName, startTime, endTime, invitationLink }) {
  const inviter = escapeHtml(inviterName || 'Un estudiante');
  const course = escapeHtml(courseName || 'Tutoría');
  const tutor = escapeHtml(tutorName || '');
  const link = escapeHtml(invitationLink);
  const subject = `${inviterName || 'Un estudiante'} te invitó a una tutoría de ${courseName || 'Calico'}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1f2937;">
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f4f6f8; opacity:0;">
    Tu cupo ya está pago. Acepta la invitación para que te llegue el link de la tutoría.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:#ff9505; background-image:linear-gradient(135deg,#fdae1e 0%,#ff9505 100%); padding:28px 32px; text-align:left;">
              <span style="font-size:26px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">Calico</span>
              <span style="display:block; margin-top:4px; font-size:13px; color:#fff7ed;">Tutorías entre estudiantes</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px; font-size:16px; line-height:1.6; color:#334155;">
              <p style="margin:0 0 16px 0; font-size:20px; font-weight:700; line-height:1.35; color:#0f172a;">
                ${inviter} te invitó a una tutoría grupal
              </p>
              <p style="margin:0 0 16px 0;">
                Tu cupo <strong>ya está pago</strong>. Solo tienes que aceptar la invitación para que la
                tutoría quede en tu calendario y te llegue el link de Google Meet.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin:0 0 8px 0;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${row('Materia', course)}
                ${tutor ? row('Tutor', tutor) : ''}
                ${row('Empieza', escapeHtml(startTime))}
                ${row('Termina', escapeHtml(endTime))}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 32px 24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:12px; background-color:#ff9505;">
                    <a href="${link}" target="_blank" style="display:inline-block; padding:14px 28px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:12px;">
                      Ver invitación
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px; font-size:13px; line-height:1.6; color:#64748b;">
              <p style="margin:0 0 8px 0;">
                Si todavía no tienes cuenta en Calico, puedes crearla gratis desde ese mismo link.
              </p>
              <p style="margin:0 0 8px 0; word-break:break-all;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${link}" style="color:#b45309;">${link}</a>
              </p>
              <p style="margin:0;">Si no conoces a ${inviter}, puedes ignorar este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, htmlContent };
}
