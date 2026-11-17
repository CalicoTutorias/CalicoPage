/**
 * Calico - Google Calendar admin-token monitor.
 * Hourly health check against the CalicoPage health endpoint; emails the team
 * when the central calendar goes down, and again when it recovers.
 */
var CONFIG = {
  STATUS_URL: 'https://calico-tutorias.com/api/health/calendar',
  ALERT_RECIPIENTS: 'calico.tutorias@gmail.com'
};

function checkCalendarToken() {
  var props = PropertiesService.getScriptProperties();
  var previous = props.getProperty('lastState'); // 'ok' | 'down' | 'unknown' | null

  var result = probeStatus();
  console.log('Estado: ' + result.state + ' - ' + result.detail);

  // Mail only on a state CHANGE, so a persistent failure alerts once.
  if (result.state !== previous) {
    if (result.state === 'ok') {
      notify(
        'Calendario de Calico restablecido',
        'El monitor volvio a ver el calendario central conectado.'
      );
    } else if (result.state === 'down') {
      notify(
        'Calendario central de Calico caido',
        'Las tutorias nuevas se agendaran sin link de Meet.\n\n' +
          'Motivo: ' + result.detail + '\n\n' + explain(result.reason)
      );
    } else {
      notify(
        'El monitor no pudo consultar la app',
        'No se pudo determinar el estado del calendario. Revisa que la app este ' +
          'arriba y que la ruta siga existiendo.\n\nDetalle: ' + result.detail
      );
    }
  }

  props.setProperty('lastState', result.state);
}

/**
 * Returns { state: 'ok' | 'down' | 'unknown', reason: string, detail: string }
 *   'ok'      - calendar connected
 *   'down'    - app answered, calendar NOT connected (the real alert)
 *   'unknown' - no usable answer; calendar state undetermined
 */
function probeStatus() {
  var res;
  try {
    res = UrlFetchApp.fetch(CONFIG.STATUS_URL, { muteHttpExceptions: true });
  } catch (err) {
    return { state: 'unknown', reason: '', detail: 'Excepcion al conectar: ' + err };
  }

  var code = res.getResponseCode();
  var body = res.getContentText();

  // The endpoint answers 200 {ok:true} when healthy and 503 {ok:false} when not.
  // Any other code means the monitor did not reach it (deploy, 404, 5xx proxy).
  if (code !== 200 && code !== 503) {
    return { state: 'unknown', reason: '', detail: 'HTTP ' + code + ': ' + body.slice(0, 300) };
  }

  var data;
  try {
    data = JSON.parse(body);
  } catch (err2) {
    return { state: 'unknown', reason: '', detail: 'Respuesta no es JSON: ' + body.slice(0, 300) };
  }

  var reason = data.reason || 'sin reason';

  return {
    state: data.ok === true ? 'ok' : 'down',
    reason: reason,
    detail: 'HTTP ' + code + ', reason=' + reason
  };
}

/** Turns the endpoint's reason label into the action to take. */
function explain(reason) {
  if (reason === 'CALENDAR_REAUTH_REQUIRED') {
    return 'El refresh token murio o fue revocado. Hay que regenerar ' +
      'GOOGLE_ADMIN_REFRESH_TOKEN, actualizarlo en Vercel (Production) y redesplegar.';
  }
  if (reason === 'CALENDAR_PERMISSION_DENIED') {
    return 'Google devolvio 403. Revisa que la Google Calendar API este habilitada ' +
      'en el proyecto de GCP y que el token tenga el scope calendar.events.';
  }
  if (reason === 'CALENDAR_NOT_FOUND') {
    return 'Google devolvio 404: CALICO_CALENDAR_ID no existe o la cuenta del token ' +
      'no tiene acceso a ese calendario.';
  }
  if (reason === 'not_configured') {
    return 'Faltan variables de entorno en produccion: GOOGLE_CLIENT_ID, ' +
      'GOOGLE_CLIENT_SECRET, GOOGLE_ADMIN_REFRESH_TOKEN o CALICO_CALENDAR_ID.';
  }
  return 'Motivo no clasificado. Revisa los logs de Vercel o Sentry.';
}

function notify(subject, body) {
  MailApp.sendEmail({ to: CONFIG.ALERT_RECIPIENTS, subject: subject, body: body });
  console.log('Correo enviado: ' + subject);
}
