/**
 * Emails of a reschedule by agreement: subject + HTML sent through Brevo
 * without a dashboard template (email.service → sendSessionRescheduleEmail).
 *
 *   requested → to whoever must answer: "X te propone cambiar el horario"
 *   accepted  → to whoever proposed:    "X aceptó el cambio de horario"
 *   declined  → to whoever proposed:    "X no aceptó el cambio de horario"
 *
 * Same look as src/lib/emails/session-invitation.js: all CSS inline, Calico
 * orange header and CTA. Every value is escaped: names, the course and the
 * note come from the database or from the other person.
 */

import { escapeHtml } from './session-invitation';

function row(label, value, { strike = false } = {}) {
  const style = strike
    ? 'padding:6px 0; font-size:15px; color:#64748b; text-decoration:line-through;'
    : 'padding:6px 0; font-size:15px; color:#0f172a; font-weight:600;';
  return `<tr>
                  <td style="padding:6px 0; font-size:13px; color:#64748b; width:110px; vertical-align:top;">${label}</td>
                  <td style="${style}">${value}</td>
                </tr>`;
}

const COPY = {
  requested: ({ actor, course }) => ({
    subject: `${actor} te propone cambiar el horario de tu tutoría de ${course}`,
    title: `${escapeHtml(actor)} te propone cambiar el horario`,
    preheader: 'Responde desde Calico: la tutoría solo se mueve si aceptas.',
    body: `La tutoría <strong>solo cambia si aceptas</strong>. Si no te sirve el nuevo horario, recházalo y
                la tutoría se queda como está.`,
    cta: 'Responder',
    fromLabel: 'Horario actual',
    toLabel: 'Nuevo horario',
    strikeFrom: false,
  }),
  accepted: ({ actor, course }) => ({
    subject: `Tu tutoría de ${course} cambió de horario`,
    title: `${escapeHtml(actor)} aceptó el cambio de horario`,
    preheader: 'La tutoría ya quedó en el nuevo horario.',
    body: `La tutoría ya quedó en el nuevo horario. El link de la reunión es el mismo y el evento de tu
                calendario se actualizó.`,
    cta: 'Ver tutoría',
    fromLabel: 'Antes',
    toLabel: 'Ahora',
    strikeFrom: true,
  }),
  declined: ({ actor, course }) => ({
    subject: `Tu tutoría de ${course} sigue en su horario`,
    title: `${escapeHtml(actor)} no aceptó el cambio de horario`,
    preheader: 'La tutoría se queda en su horario original.',
    body: `La tutoría <strong>se queda en su horario original</strong>. Si quieres, puedes proponer otro
                horario desde Calico.`,
    cta: 'Ver tutoría',
    fromLabel: 'Se mantiene',
    toLabel: 'Propuesto',
    strikeFrom: false,
    strikeTo: true,
  }),
};

/**
 * @param {'requested'|'accepted'|'declined'} kind
 * @param {{ actorName: string, courseName: string, fromTime: string, toTime: string,
 *   message?: string|null, sessionLink: string }} params `actorName`: who
 *   proposed (requested) or who answered (accepted / declined).
 * @returns {{ subject: string, htmlContent: string }}
 */
export function sessionRescheduleEmail(kind, { actorName, courseName, fromTime, toTime, message = null, sessionLink }) {
  const actor = actorName || 'La otra persona';
  const course = courseName || 'Calico';
  const copy = (COPY[kind] || COPY.requested)({ actor, course });
  const link = escapeHtml(sessionLink);
  const note = kind === 'requested' && message
    ? `<p style="margin:0 0 16px 0; padding:12px 16px; background-color:#fff7ed; border-left:4px solid #ff9505; border-radius:8px; font-size:15px; color:#334155;">
                <span style="display:block; font-size:12px; color:#64748b; margin-bottom:4px;">Mensaje de ${escapeHtml(actor)}</span>
                ${escapeHtml(message)}
              </p>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1f2937;">
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f4f6f8; opacity:0;">
    ${copy.preheader}
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
                ${copy.title}
              </p>
              <p style="margin:0 0 16px 0;">
                ${copy.body}
              </p>
              ${note}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin:0 0 8px 0;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${row('Materia', escapeHtml(course))}
                ${row(copy.fromLabel, escapeHtml(fromTime), { strike: copy.strikeFrom })}
                ${row(copy.toLabel, escapeHtml(toTime), { strike: Boolean(copy.strikeTo) })}
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
                      ${copy.cta}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px; font-size:13px; line-height:1.6; color:#64748b;">
              <p style="margin:0 0 8px 0;">Los horarios están en hora de Colombia.</p>
              <p style="margin:0; word-break:break-all;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${link}" style="color:#b45309;">${link}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: copy.subject, htmlContent };
}
