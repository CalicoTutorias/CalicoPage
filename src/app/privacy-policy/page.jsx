"use client";

import Link from "next/link";
import styles from "./privacy-policy.module.css";

export default function PrivacyPolicy() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backButton}>
          ← Volver al inicio
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Política de Privacidad</h1>
        <p className={styles.lastUpdated}>Última actualización: Abril 11, 2026</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Introducción</h2>
          <p className={styles.text}>
            En Calico ("nosotros", "nuestro" o "la plataforma"), respetamos su privacidad y nos comprometemos a proteger sus datos personales. Esta política de privacidad explica cómo recopilamos, usamos, compartimos y protegemos su información cuando utiliza nuestros servicios de tutoría en línea.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Información que Recopilamos</h2>
          <p className={styles.text}>Recopilamos diferentes tipos de información para proporcionar y mejorar nuestros servicios:</p>
          
          <h3 className={styles.subsectionTitle}>2.1 Información que usted nos proporciona</h3>
          <ul className={styles.list}>
            <li><strong>Datos de registro:</strong> nombre, correo electrónico, contraseña, rol (estudiante o tutor)</li>
            <li><strong>Información de perfil:</strong> foto de perfil, biografía, materias de interés, nivel académico</li>
            <li><strong>Información de pago:</strong> datos necesarios para procesar transacciones (procesados de forma segura por terceros)</li>
            <li><strong>Comunicaciones:</strong> mensajes enviados a través de la plataforma, calificaciones y reseñas</li>
          </ul>

          <h3 className={styles.subsectionTitle}>2.2 Información recopilada automáticamente</h3>
          <ul className={styles.list}>
            <li><strong>Datos de uso:</strong> páginas visitadas, funciones utilizadas, tiempo en la plataforma</li>
            <li><strong>Información del dispositivo:</strong> tipo de dispositivo, sistema operativo, navegador, dirección IP</li>
            <li><strong>Cookies y tecnologías similares:</strong> para mejorar la experiencia del usuario</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Cómo Usamos su Información</h2>
          <p className={styles.text}>Utilizamos la información recopilada para:</p>
          <ul className={styles.list}>
            <li>Proporcionar, mantener y mejorar nuestros servicios de tutoría</li>
            <li>Facilitar la conexión entre estudiantes y tutores</li>
            <li>Procesar pagos y mantener registros de transacciones</li>
            <li>Comunicarnos con usted sobre actualizaciones, recordatorios de sesiones y notificaciones importantes</li>
            <li>Personalizar su experiencia en la plataforma</li>
            <li>Proteger la seguridad e integridad de la plataforma</li>
            <li>Cumplir con obligaciones legales y resolver disputas</li>
            <li>Analizar el uso de la plataforma para mejorar nuestros servicios</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Compartir Información</h2>
          <p className={styles.text}>Podemos compartir su información en las siguientes circunstancias:</p>
          <ul className={styles.list}>
            <li><strong>Entre usuarios:</strong> Su perfil y disponibilidad son visibles para otros usuarios según la configuración de la plataforma</li>
            <li><strong>Proveedores de servicios:</strong> Compartimos datos con terceros que nos ayudan a operar la plataforma (procesamiento de pagos, servicios de calendario, almacenamiento en la nube)</li>
            <li><strong>Cumplimiento legal:</strong> Cuando sea requerido por ley o para proteger nuestros derechos</li>
            <li><strong>Con su consentimiento:</strong> En cualquier otra circunstancia con su autorización expresa</li>
          </ul>
          <p className={styles.text}>
            <strong>No vendemos</strong> su información personal a terceros.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Seguridad de Datos</h2>
          <p className={styles.text}>
            Implementamos medidas de seguridad técnicas y organizativas para proteger su información personal contra acceso no autorizado, alteración, divulgación o destrucción. Esto incluye:
          </p>
          <ul className={styles.list}>
            <li>Cifrado de datos en tránsito y en reposo</li>
            <li>Autenticación segura con tokens JWT</li>
            <li>Controles de acceso estrictos</li>
            <li>Monitoreo regular de seguridad</li>
          </ul>
          <p className={styles.text}>
            Sin embargo, ningún método de transmisión por Internet o almacenamiento electrónico es 100% seguro. Aunque nos esforzamos por proteger su información, no podemos garantizar su seguridad absoluta.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Sus Derechos</h2>
          <p className={styles.text}>Usted tiene derecho a:</p>
          <ul className={styles.list}>
            <li><strong>Acceder:</strong> Solicitar una copia de sus datos personales</li>
            <li><strong>Rectificar:</strong> Corregir información inexacta o incompleta</li>
            <li><strong>Eliminar:</strong> Solicitar la eliminación de sus datos personales</li>
            <li><strong>Restringir:</strong> Limitar el procesamiento de sus datos</li>
            <li><strong>Portabilidad:</strong> Recibir sus datos en un formato estructurado</li>
            <li><strong>Oponerse:</strong> Oponerse al procesamiento de sus datos en ciertas circunstancias</li>
            <li><strong>Retirar consentimiento:</strong> En cualquier momento, cuando el procesamiento se base en su consentimiento</li>
          </ul>
          <p className={styles.text}>
            Para ejercer estos derechos, contáctenos a través de los medios indicados en la sección de contacto.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Retención de Datos</h2>
          <p className={styles.text}>
            Conservamos su información personal solo durante el tiempo necesario para cumplir con los fines descritos en esta política, a menos que la ley requiera o permita un período de retención más largo. Los datos de sesiones y transacciones se conservan conforme a requisitos legales y contables.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Cookies y Tecnologías Similares</h2>
          <p className={styles.text}>
            Utilizamos cookies y tecnologías similares para mejorar su experiencia, analizar el uso de la plataforma y proporcionar funciones personalizadas. Puede controlar las cookies a través de la configuración de su navegador, aunque esto puede afectar algunas funcionalidades de la plataforma.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Uso de Datos de Google Calendar</h2>
          <p className={styles.text}>
            Calico se integra opcionalmente con Google Calendar para que los tutores puedan sincronizar su disponibilidad. Esta sección describe de manera específica cómo accedemos, usamos, almacenamos y protegemos los datos obtenidos a través de la API de Google Calendar.
          </p>

          <h3 className={styles.subsectionTitle}>9.1 Datos a los que accedemos</h3>
          <p className={styles.text}>
            Cuando un tutor conecta voluntariamente su cuenta de Google, Calico solicita acceso de <strong>solo lectura</strong> a los eventos de Google Calendar del tutor mediante el scope <code>https://www.googleapis.com/auth/calendar.events.readonly</code>. Específicamente, la aplicación:
          </p>
          <ul className={styles.list}>
            <li>Lista los calendarios del tutor para identificar el calendario de disponibilidad designado.</li>
            <li>Lee los títulos, fechas y horarios de los eventos de ese calendario para los próximos 60 días.</li>
            <li><strong>No accede</strong> a correos electrónicos, contactos, archivos de Drive, ni ningún otro dato de Google fuera de los eventos del calendario de disponibilidad.</li>
          </ul>

          <h3 className={styles.subsectionTitle}>9.2 Cómo usamos los datos</h3>
          <p className={styles.text}>
            Los datos de Google Calendar se utilizan <strong>exclusivamente</strong> para:
          </p>
          <ul className={styles.list}>
            <li>Importar los bloques horarios del tutor como franjas de disponibilidad en la plataforma Calico, para que los estudiantes puedan ver y reservar sesiones.</li>
            <li>Mantener la disponibilidad del tutor actualizada cuando este ejecuta la sincronización manualmente.</li>
          </ul>
          <p className={styles.text}>
            Los datos de Google Calendar <strong>no se usan</strong> para publicidad, perfilamiento, análisis de comportamiento, ni para ningún propósito distinto al descrito anteriormente.
          </p>

          <h3 className={styles.subsectionTitle}>9.3 Almacenamiento y retención</h3>
          <p className={styles.text}>
            Los datos crudos de Google Calendar (títulos, descripciones, ID de eventos) <strong>no se almacenan</strong> en nuestra base de datos. Solo se persisten los bloques de disponibilidad derivados (día de la semana, hora de inicio, hora de fin). Los tokens de acceso y actualización de Google se almacenan en cookies httpOnly seguras en el navegador del tutor y no en nuestra base de datos.
          </p>

          <h3 className={styles.subsectionTitle}>9.4 Compartir datos de Google</h3>
          <p className={styles.text}>
            Los datos obtenidos a través de la API de Google Calendar <strong>no se comparten, venden ni transfieren</strong> a ningún tercero, plataforma publicitaria, intermediario de datos ni ninguna otra parte, excepto cuando sea requerido por ley.
          </p>

          <h3 className={styles.subsectionTitle}>9.5 Declaración de uso limitado (Google API Limited Use)</h3>
          <p className={styles.text}>
            El uso que Calico hace de la información recibida de las APIs de Google se adhiere a la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className={styles.link} target="_blank" rel="noopener noreferrer">
              Política de Datos de Usuario de los Servicios de API de Google
            </a>
            , incluyendo los requisitos de uso limitado. En particular:
          </p>
          <ul className={styles.list}>
            <li>El uso de los datos está limitado a proveer y mejorar las funciones visibles para el usuario en la interfaz de Calico.</li>
            <li>No se transfieren datos a terceros salvo para cumplir con la funcionalidad descrita, con el consentimiento del usuario, o por motivos legales.</li>
            <li>Ningún empleado ni contratista de Calico lee los datos de Google Calendar del usuario, a menos que el usuario lo autorice explícitamente o sea necesario por razones de seguridad o cumplimiento legal.</li>
            <li>No se usa el acceso a datos de Google para desarrollar, mejorar o entrenar modelos de inteligencia artificial o aprendizaje automático.</li>
          </ul>

          <h3 className={styles.subsectionTitle}>9.6 Revocar el acceso</h3>
          <p className={styles.text}>
            El tutor puede desconectar su Google Calendar en cualquier momento desde la sección de disponibilidad en Calico. Adicionalmente, puede revocar el acceso directamente desde su{' '}
            <a href="https://myaccount.google.com/permissions" className={styles.link} target="_blank" rel="noopener noreferrer">
              cuenta de Google → Seguridad → Aplicaciones de terceros con acceso a la cuenta
            </a>
            . Al revocar el acceso, Calico dejará de poder sincronizar la disponibilidad pero los bloques ya importados permanecerán hasta que el tutor los elimine.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Servicios de Terceros</h2>
          <p className={styles.text}>
            Nuestra plataforma integra los siguientes servicios de terceros:
          </p>
          <ul className={styles.list}>
            <li><strong>PostgreSQL / Neon:</strong> Base de datos relacional para almacenar perfiles, sesiones y disponibilidad.</li>
            <li><strong>Google Calendar API:</strong> Sincronización opcional de disponibilidad del tutor (ver sección 9).</li>
            <li><strong>AWS S3:</strong> Almacenamiento seguro de comprobantes de pago e imágenes de perfil.</li>
            <li><strong>Brevo (ex-Sendinblue):</strong> Envío de correos transaccionales (verificación de cuenta, recordatorios de sesión).</li>
            <li><strong>Google Meet:</strong> Generación de enlaces de videollamada para sesiones virtuales, a través del calendario central de Calico.</li>
          </ul>
          <p className={styles.text}>
            Cada uno de estos servicios tiene sus propias políticas de privacidad. Le recomendamos revisarlas.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Privacidad de Menores</h2>
          <p className={styles.text}>
            Nuestros servicios están dirigidos a estudiantes universitarios. No recopilamos intencionalmente información de menores de 13 años. Si descubrimos que hemos recopilado información de un menor sin el consentimiento parental adecuado, eliminaremos esa información de inmediato.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Cambios a esta Política</h2>
          <p className={styles.text}>
            Podemos actualizar esta política de privacidad periódicamente para reflejar cambios en nuestras prácticas o por razones legales. Le notificaremos sobre cambios significativos mediante un aviso prominente en la plataforma o por correo electrónico. La fecha de "Última actualización" en la parte superior indica cuándo se revisó por última vez esta política.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. Transferencias Internacionales</h2>
          <p className={styles.text}>
            Sus datos pueden ser transferidos y procesados en servidores ubicados fuera de su país de residencia. Cuando transfiramos datos internacionalmente, implementamos medidas de seguridad adecuadas para proteger su información conforme a esta política y las leyes aplicables.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>14. Contacto</h2>
          <p className={styles.text}>
            Si tiene preguntas, inquietudes o desea ejercer sus derechos respecto a su información personal, contáctenos:
          </p>
          <ul className={styles.list}>
            <li><strong>Correo electrónico:</strong> privacy@calico-tutorias.com</li>
            <li><strong>Sitio web:</strong> <a href="https://calico-tutorias.com" className={styles.link}>https://calico-tutorias.com</a></li>
          </ul>
          <p className={styles.text}>
            Responderemos a su solicitud dentro de un plazo razonable conforme a las leyes aplicables.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>15. Consentimiento</h2>
          <p className={styles.text}>
            Al utilizar nuestra plataforma, usted acepta los términos de esta política de privacidad y consiente al procesamiento de su información personal como se describe aquí. Si no está de acuerdo con esta política, por favor no utilice nuestros servicios.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>© 2026 Calico Tutorías. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

