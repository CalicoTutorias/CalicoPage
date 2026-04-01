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
        <p className={styles.lastUpdated}>Última actualización: Enero 12, 2026</p>

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
          <h2 className={styles.sectionTitle}>9. Servicios de Terceros</h2>
          <p className={styles.text}>
            Nuestra plataforma integra servicios de terceros como:
          </p>
          <ul className={styles.list}>
            <li><strong>PostgreSQL/Neon:</strong> Base de datos y almacenamiento</li>
            <li><strong>Google Calendar:</strong> Gestión de calendario y disponibilidad</li>
            <li><strong>Procesadores de pago:</strong> Para transacciones seguras</li>
          </ul>
          <p className={styles.text}>
            Estos servicios tienen sus propias políticas de privacidad y le recomendamos revisarlas.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Privacidad de Menores</h2>
          <p className={styles.text}>
            Nuestros servicios están dirigidos a estudiantes universitarios. No recopilamos intencionalmente información de menores de 13 años. Si descubrimos que hemos recopilado información de un menor sin el consentimiento parental adecuado, eliminaremos esa información de inmediato.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Cambios a esta Política</h2>
          <p className={styles.text}>
            Podemos actualizar esta política de privacidad periódicamente para reflejar cambios en nuestras prácticas o por razones legales. Le notificaremos sobre cambios significativos mediante un aviso prominente en la plataforma o por correo electrónico. La fecha de "Última actualización" en la parte superior indica cuándo se revisó por última vez esta política.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Transferencias Internacionales</h2>
          <p className={styles.text}>
            Sus datos pueden ser transferidos y procesados en servidores ubicados fuera de su país de residencia. Cuando transfiramos datos internacionalmente, implementamos medidas de seguridad adecuadas para proteger su información conforme a esta política y las leyes aplicables.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. Contacto</h2>
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
          <h2 className={styles.sectionTitle}>14. Consentimiento</h2>
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

