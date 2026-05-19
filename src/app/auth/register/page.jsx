// app/auth/register/page.jsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import CalicoLogo from "../../../../public/CalicoLogo.png";
import Image from "next/image";
import './register.css';
import { AuthService } from '../../services/utils/AuthService';
import TermsModal from '../../components/TermsModal/TermsModal';
import { Eye, EyeOff, Check, X, ShieldCheck, GraduationCap, Calendar, Star } from 'lucide-react';
import {
  PHONE_COUNTRY_CODES,
  DEFAULT_PHONE_COUNTRY_CODE,
  joinPhone,
} from '../../../lib/utils/phone';
import {
  sanitizePhoneDigits,
  isValidPhoneLocal,
  isValidEmail,
  normalizeEmail,
  stripWhitespace,
  isValidPassword,
  sanitizeName,
  PHONE_MAX_DIGITS,
  NAME_MAX_LENGTH,
} from '../../../lib/utils/validation';

const FORM_STORAGE_KEY = 'register_form_data';

// ============================================================================
// COMPONENTES AUXILIARES - DEFINIDOS PRIMERO
// ============================================================================

function Section({ number, title, children }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        {number}. {title}
      </h3>
      {children}
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div style={{ marginTop: '0.8rem' }}>
      <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.3rem' }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

// ============================================================================
// CONTENIDO DE TÉRMINOS Y CONDICIONES
// ============================================================================

function TermsContent() {
  return (
    <div>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Términos y Condiciones de Uso
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
        Última actualización: Enero 12, 2026
      </p>

      <p style={{ marginBottom: '1rem' }}>
        Por favor, lee detenidamente estos Términos y Condiciones antes de utilizar la plataforma Calico. 
        Al acceder o usar nuestros servicios, aceptas quedar vinculado por estos términos. Si no estás de 
        acuerdo con alguna parte de los mismos, no utilices la plataforma.
      </p>

      <Section number="1" title="Aceptación de los Términos">
        <p>
          Al registrarte o utilizar Calico Monitorias (en adelante, "la Plataforma"), aceptas estos 
          Términos y Condiciones en su totalidad. Estos términos constituyen un acuerdo legal entre tú 
          y Calico. Si actúas en nombre de una organización, confirmas que tienes autoridad para vincularla 
          a estos términos.
        </p>
      </Section>

      <Section number="2" title="Descripción del Servicio">
        <p>Calico es una plataforma de intermediación académica que conecta estudiantes con tutores 
        (tutores) de la Universidad de los Andes. A través de la Plataforma puedes:</p>
        <ul>
          <li>Buscar y reservar sesiones de monitoría individuales o grupales.</li>
          <li>Gestionar disponibilidad y calendario de sesiones.</li>
          <li>Realizar y recibir pagos por sesiones completadas.</li>
          <li>Dejar y consultar reseñas sobre tutores y sesiones.</li>
        </ul>
        <p>Calico actúa como intermediario y no es parte directa en la relación académica entre estudiante y tutor.</p>
      </Section>

      <Section number="3" title="Registro y Cuenta de Usuario">
        <p>Para acceder a las funciones de la Plataforma debes crear una cuenta. Al hacerlo, te comprometes a:</p>
        <ul>
          <li>Proporcionar información verídica, precisa y actualizada.</li>
          <li>Mantener la confidencialidad de tus credenciales de acceso.</li>
          <li>Notificar de inmediato cualquier uso no autorizado de tu cuenta.</li>
          <li>No transferir ni ceder tu cuenta a terceros.</li>
        </ul>
      </Section>

      <Section number="4" title="Obligaciones de los Usuarios">
        <p>Al utilizar la Plataforma, te comprometes a no:</p>
        <ul>
          <li>Publicar contenido falso, engañoso, difamatorio o ilegal.</li>
          <li>Realizar pagos fuera de la Plataforma para eludir comisiones.</li>
          <li>Acosar, amenazar o discriminar a otros usuarios.</li>
          <li>Intentar vulnerar la seguridad o integridad de la Plataforma.</li>
          <li>Usar la Plataforma con fines distintos a la mediación académica.</li>
        </ul>
        <p>El incumplimiento de estas obligaciones puede derivar en la suspensión o cancelación permanente de tu cuenta.</p>
      </Section>

      <Section number="5" title="Política de Pagos">
        <p>Los pagos por sesiones de monitoría se gestionan a través de la Plataforma. Al reservar una sesión:</p>
        <ul>
          <li>El estudiante debe cargar el comprobante de pago antes de confirmar la reserva.</li>
          <li>El tutor recibirá el pago una vez que la sesión sea marcada como completada.</li>
          <li>Calico aplica una comisión de servicio sobre cada transacción.</li>
          <li>Los precios por sesión son establecidos por cada tutor y visibles antes de confirmar la reserva.</li>
        </ul>
      </Section>

      <Section number="6" title="Cancelaciones y Reembolsos">
        <p>La política de cancelaciones de Calico establece lo siguiente:</p>
        <ul>
          <li>Las cancelaciones deben realizarse con al menos 6 horas de anticipación a la sesión programada.</li>
          <li>Las cancelaciones con menos de 6 horas de anticipación no son elegibles para reembolso automático.</li>
          <li>El tutor puede rechazar una solicitud antes de aceptarla sin penalización.</li>
          <li>Los casos especiales de reembolso serán evaluados por el equipo de Calico.</li>
        </ul>
      </Section>

      <Section number="7" title="Integración con Google Calendar">
        <p>
          Calico se integra con Google Calendar para facilitar la gestión de disponibilidad y la creación 
          de eventos de sesión. Al conectar tu cuenta de Google, autorizas a Calico a crear, modificar y 
          eliminar eventos en tu calendario asociados exclusivamente a tus sesiones de monitoría. Puedes 
          revocar este acceso en cualquier momento desde tu cuenta de Google. Los datos de tu calendario 
          son tratados conforme a nuestra Política de Privacidad y a los Términos de Servicio de Google.
        </p>
      </Section>

      <Section number="8" title="Propiedad Intelectual">
        <p>Todos los contenidos, marcas, logotipos, software y materiales disponibles en la Plataforma 
        son propiedad de Calico o de sus respectivos titulares. Queda prohibido:</p>
        <ul>
          <li>Reproducir, distribuir o modificar cualquier contenido sin autorización expresa.</li>
          <li>Usar el nombre o logotipo de Calico con fines comerciales sin permiso.</li>
          <li>Realizar ingeniería inversa o descompilar el software de la Plataforma.</li>
        </ul>
      </Section>

      <Section number="9" title="Limitación de Responsabilidad">
        <p>Calico no será responsable por:</p>
        <ul>
          <li>La calidad, exactitud o idoneidad del contenido académico impartido por los tutores.</li>
          <li>Pérdidas o daños derivados del incumplimiento de obligaciones por parte de los usuarios.</li>
          <li>Interrupciones del servicio causadas por factores fuera de nuestro control.</li>
          <li>Daños indirectos, incidentales o consecuentes que surjan del uso de la Plataforma.</li>
        </ul>
      </Section>

      <Section number="10" title="Privacidad y Protección de Datos">
        <p>
          El uso de tus datos personales se rige por nuestra Política de Privacidad, la cual forma parte 
          integral de estos Términos. Al aceptar estos Términos, también aceptas nuestra Política de Privacidad. 
          Te recomendamos leerla detenidamente.
        </p>
      </Section>

      <Section number="11" title="Modificaciones a los Términos">
        <p>
          Calico se reserva el derecho de modificar estos Términos en cualquier momento. Los cambios entrarán 
          en vigor a partir de su publicación en la Plataforma. Te notificaremos sobre cambios significativos 
          mediante correo electrónico o un aviso visible en la aplicación. El uso continuado de la Plataforma 
          tras la publicación de los cambios constituye tu aceptación de los nuevos términos.
        </p>
      </Section>

      <Section number="12" title="Ley Aplicable y Jurisdicción">
        <p>
          Estos Términos se rigen por las leyes de la República de Colombia. Cualquier disputa derivada del 
          uso de la Plataforma será sometida a la jurisdicción de los tribunales competentes de Bogotá, D.C., 
          Colombia, salvo que la normativa aplicable establezca otra jurisdicción de manera imperativa.
        </p>
      </Section>

      <Section number="13" title="Contacto">
        <p>
          Si tienes preguntas, sugerencias o inquietudes sobre estos Términos y Condiciones, puedes 
          comunicarte con nosotros a través de:
        </p>
        <ul>
          <li>Correo electrónico: calico-tutorias@gmail.com</li>
        </ul>
      </Section>
    </div>
  );
}

// ============================================================================
// CONTENIDO DE POLÍTICA DE PRIVACIDAD
// ============================================================================

function PrivacyContent() {
  return (
    <div>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Política de Privacidad
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
        Última actualización: Abril 11, 2026
      </p>

      <Section number="1" title="Introducción">
        <p>
          En Calico ("nosotros", "nuestro" o "la plataforma"), respetamos su privacidad y nos comprometemos 
          a proteger sus datos personales. Esta política de privacidad explica cómo recopilamos, usamos, 
          compartimos y protegemos su información cuando utiliza nuestros servicios de tutoría en línea.
        </p>
      </Section>

      <Section number="2" title="Información que Recopilamos">
        <p>Recopilamos diferentes tipos de información para proporcionar y mejorar nuestros servicios:</p>
        
        <SubSection title="2.1 Información que usted nos proporciona">
          <ul>
            <li>Datos de registro: nombre, correo electrónico, contraseña, rol (estudiante o tutor)</li>
            <li>Información de perfil: foto de perfil, biografía, materias de interés, nivel académico</li>
            <li>Información de pago: datos necesarios para procesar transacciones (procesados de forma segura por terceros)</li>
            <li>Comunicaciones: mensajes enviados a través de la plataforma, calificaciones y reseñas</li>
          </ul>
        </SubSection>

        <SubSection title="2.2 Información recopilada automáticamente">
          <ul>
            <li>Datos de uso: páginas visitadas, funciones utilizadas, tiempo en la plataforma</li>
            <li>Información del dispositivo: tipo de dispositivo, sistema operativo, navegador, dirección IP</li>
            <li>Cookies y tecnologías similares: para mejorar la experiencia del usuario</li>
          </ul>
        </SubSection>
      </Section>

      <Section number="3" title="Cómo Usamos su Información">
        <p>Utilizamos la información recopilada para:</p>
        <ul>
          <li>Proporcionar, mantener y mejorar nuestros servicios de tutoría</li>
          <li>Facilitar la conexión entre estudiantes y tutores</li>
          <li>Procesar pagos y mantener registros de transacciones</li>
          <li>Comunicarnos con usted sobre actualizaciones, recordatorios de sesiones y notificaciones importantes</li>
          <li>Personalizar su experiencia en la plataforma</li>
          <li>Proteger la seguridad e integridad de la plataforma</li>
          <li>Cumplir con obligaciones legales y resolver disputas</li>
          <li>Analizar el uso de la plataforma para mejorar nuestros servicios</li>
        </ul>
      </Section>

      <Section number="4" title="Compartir Información">
        <p>Podemos compartir su información en las siguientes circunstancias:</p>
        <ul>
          <li><strong>Entre usuarios:</strong> Su perfil y disponibilidad son visibles para otros usuarios según la configuración de la plataforma</li>
          <li><strong>Proveedores de servicios:</strong> Compartimos datos con terceros que nos ayudan a operar la plataforma (procesamiento de pagos, servicios de calendario, almacenamiento en la nube)</li>
          <li><strong>Cumplimiento legal:</strong> Cuando sea requerido por ley o para proteger nuestros derechos</li>
          <li><strong>Con su consentimiento:</strong> En cualquier otra circunstancia con su autorización expresa</li>
        </ul>
        <p>No vendemos su información personal a terceros.</p>
      </Section>

      <Section number="5" title="Seguridad de Datos">
        <p>
          Implementamos medidas de seguridad técnicas y organizativas para proteger su información personal 
          contra acceso no autorizado, alteración, divulgación o destrucción. Esto incluye:
        </p>
        <ul>
          <li>Cifrado de datos en tránsito y en reposo</li>
          <li>Autenticación segura con tokens JWT</li>
          <li>Controles de acceso estrictos</li>
          <li>Monitoreo regular de seguridad</li>
        </ul>
        <p>
          Sin embargo, ningún método de transmisión por Internet o almacenamiento electrónico es 100% seguro. 
          Aunque nos esforzamos por proteger su información, no podemos garantizar su seguridad absoluta.
        </p>
      </Section>

      <Section number="6" title="Sus Derechos">
        <p>Usted tiene derecho a:</p>
        <ul>
          <li><strong>Acceder:</strong> Solicitar una copia de sus datos personales</li>
          <li><strong>Rectificar:</strong> Corregir información inexacta o incompleta</li>
          <li><strong>Eliminar:</strong> Solicitar la eliminación de sus datos personales</li>
          <li><strong>Restringir:</strong> Limitar el procesamiento de sus datos</li>
          <li><strong>Portabilidad:</strong> Recibir sus datos en un formato estructurado</li>
          <li><strong>Oponerse:</strong> Oponerse al procesamiento de sus datos en ciertas circunstancias</li>
          <li><strong>Retirar consentimiento:</strong> En cualquier momento, cuando el procesamiento se base en su consentimiento</li>
        </ul>
        <p>Para ejercer estos derechos, contáctenos a través de los medios indicados en la sección de contacto.</p>
      </Section>

      <Section number="7" title="Retención de Datos">
        <p>
          Conservamos su información personal solo durante el tiempo necesario para cumplir con los fines 
          descritos en esta política, a menos que la ley requiera o permita un período de retención más largo. 
          Los datos de sesiones y transacciones se conservan conforme a requisitos legales y contables.
        </p>
      </Section>

      <Section number="8" title="Cookies y Tecnologías Similares">
        <p>
          Utilizamos cookies y tecnologías similares para mejorar su experiencia, analizar el uso de la 
          plataforma y proporcionar funciones personalizadas. Puede controlar las cookies a través de la 
          configuración de su navegador, aunque esto puede afectar algunas funcionalidades de la plataforma.
        </p>
      </Section>

      <Section number="9" title="Uso de Datos de Google Calendar">
        <p>
          Calico se integra opcionalmente con Google Calendar para que los tutores puedan sincronizar su 
          disponibilidad. Esta sección describe de manera específica cómo accedemos, usamos, almacenamos 
          y protegemos los datos obtenidos a través de la API de Google Calendar.
        </p>

        <SubSection title="9.1 Datos a los que accedemos">
          <p>
            Cuando un tutor conecta voluntariamente su cuenta de Google, Calico solicita acceso de solo 
            lectura a los eventos de Google Calendar del tutor. Específicamente, la aplicación:
          </p>
          <ul>
            <li>Lista los calendarios del tutor para identificar el calendario de disponibilidad designado.</li>
            <li>Lee los títulos, fechas y horarios de los eventos de ese calendario para los próximos 60 días.</li>
            <li>No accede a correos electrónicos, contactos, archivos de Drive, ni ningún otro dato de Google fuera de los eventos del calendario de disponibilidad.</li>
          </ul>
        </SubSection>

        <SubSection title="9.2 Cómo usamos los datos">
          <p>Los datos de Google Calendar se utilizan exclusivamente para:</p>
          <ul>
            <li>Importar los bloques horarios del tutor como franjas de disponibilidad en la plataforma Calico, para que los estudiantes puedan ver y reservar sesiones.</li>
            <li>Mantener la disponibilidad del tutor actualizada cuando este ejecuta la sincronización manualmente.</li>
          </ul>
          <p>
            Los datos de Google Calendar no se usan para publicidad, perfilamiento, análisis de comportamiento, 
            ni para ningún propósito distinto al descrito anteriormente.
          </p>
        </SubSection>

        <SubSection title="9.3 Almacenamiento y retención">
          <p>
            Los datos crudos de Google Calendar (títulos, descripciones, ID de eventos) no se almacenan en 
            nuestra base de datos. Solo se persisten los bloques de disponibilidad derivados (día de la semana, 
            hora de inicio, hora de fin). Los tokens de acceso y actualización de Google se almacenan en 
            cookies httpOnly seguras en el navegador del tutor y no en nuestra base de datos.
          </p>
        </SubSection>

        <SubSection title="9.4 Compartir datos de Google">
          <p>
            Los datos obtenidos a través de la API de Google Calendar no se comparten, venden ni transfieren 
            a ningún tercero, plataforma publicitaria, intermediario de datos ni ninguna otra parte, excepto 
            cuando sea requerido por ley.
          </p>
        </SubSection>

        <SubSection title="9.5 Declaración de uso limitado (Google API Limited Use)">
          <p>
            El uso que Calico hace de la información recibida de las APIs de Google se adhiere a la Política 
            de Datos de Usuario de los Servicios de API de Google, incluyendo los requisitos de uso limitado. 
            En particular:
          </p>
          <ul>
            <li>El uso de los datos está limitado a proveer y mejorar las funciones visibles para el usuario en la interfaz de Calico.</li>
            <li>No se transfieren datos a terceros salvo para cumplir con la funcionalidad descrita, con el consentimiento del usuario, o por motivos legales.</li>
            <li>Ningún empleado ni contratista de Calico lee los datos de Google Calendar del usuario, a menos que el usuario lo autorice explícitamente o sea necesario por razones de seguridad o cumplimiento legal.</li>
            <li>No se usa el acceso a datos de Google para desarrollar, mejorar o entrenar modelos de inteligencia artificial o aprendizaje automático.</li>
          </ul>
        </SubSection>

        <SubSection title="9.6 Revocar el acceso">
          <p>
            El tutor puede desconectar su Google Calendar en cualquier momento desde la sección de disponibilidad 
            en Calico. Adicionalmente, puede revocar el acceso directamente desde su cuenta de Google → Seguridad 
            → Aplicaciones de terceros con acceso a la cuenta. Al revocar el acceso, Calico dejará de poder 
            sincronizar la disponibilidad pero los bloques ya importados permanecerán hasta que el tutor los elimine.
          </p>
        </SubSection>
      </Section>

      <Section number="10" title="Servicios de Terceros">
        <p>Nuestra plataforma integra los siguientes servicios de terceros:</p>
        <ul>
          <li><strong>PostgreSQL / Neon:</strong> Base de datos relacional para almacenar perfiles, sesiones y disponibilidad.</li>
          <li><strong>Google Calendar API:</strong> Sincronización opcional de disponibilidad del tutor (ver sección 9).</li>
          <li><strong>AWS S3:</strong> Almacenamiento seguro de comprobantes de pago e imágenes de perfil.</li>
          <li><strong>Brevo (ex-Sendinblue):</strong> Envío de correos transaccionales (verificación de cuenta, recordatorios de sesión).</li>
          <li><strong>Google Meet:</strong> Generación de enlaces de videollamada para sesiones virtuales, a través del calendario central de Calico.</li>
        </ul>
        <p>Cada uno de estos servicios tiene sus propias políticas de privacidad. Le recomendamos revisarlas.</p>
      </Section>

      <Section number="11" title="Privacidad de Menores">
        <p>
          Nuestros servicios están dirigidos a estudiantes universitarios. No recopilamos intencionalmente 
          información de menores de 13 años. Si descubrimos que hemos recopilado información de un menor sin 
          el consentimiento parental adecuado, eliminaremos esa información de inmediato.
        </p>
      </Section>

      <Section number="12" title="Cambios a esta Política">
        <p>
          Podemos actualizar esta política de privacidad periódicamente para reflejar cambios en nuestras 
          prácticas o por razones legales. Le notificaremos sobre cambios significativos mediante un aviso 
          prominente en la plataforma o por correo electrónico. La fecha de "Última actualización" en la 
          parte superior indica cuándo se revisó por última vez esta política.
        </p>
      </Section>

      <Section number="13" title="Transferencias Internacionales">
        <p>
          Sus datos pueden ser transferidos y procesados en servidores ubicados fuera de su país de residencia. 
          Cuando transfiramos datos internacionalmente, implementamos medidas de seguridad adecuadas para 
          proteger su información conforme a esta política y las leyes aplicables.
        </p>
      </Section>

      <Section number="14" title="Contacto">
        <p>
          Si tiene preguntas, inquietudes o desea ejercer sus derechos respecto a su información personal, 
          contáctenos:
        </p>
        <ul>
          <li>Correo electrónico: calico-tutorias@gmail.com</li>
          <li>Sitio web: https://calico-tutorias.com</li>
        </ul>
        <p>Responderemos a su solicitud dentro de un plazo razonable conforme a las leyes aplicables.</p>
      </Section>

      <Section number="15" title="Consentimiento">
        <p>
          Al utilizar nuestra plataforma, usted acepta los términos de esta política de privacidad y consiente 
          al procesamiento de su información personal como se describe aquí. Si no está de acuerdo con esta 
          política, por favor no utilice nuestros servicios.
        </p>
      </Section>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL - REGISTER
// ============================================================================

const Register = () => {
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [selectedCareerId, setSelectedCareerId] = useState("");
  const [careers, setCareers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordRules = [
    { key: 'minLength', test: (p) => p.length >= 6, label: t('auth.resetPassword.ruleMinLength') },
    { key: 'uppercase', test: (p) => /[A-Z]/.test(p), label: t('auth.resetPassword.ruleUppercase') },
    { key: 'special', test: (p) => /[^A-Za-z0-9]/.test(p), label: t('auth.resetPassword.ruleSpecial') },
    { key: 'noSpaces', test: (p) => p.length > 0 && !/\s/.test(p), label: t('auth.resetPassword.ruleNoSpaces') },
  ];

  useEffect(() => {
    fetch('/api/majors')
      .then((r) => r.json())
      .then((data) => { if (data.success) setCareers(data.majors); })
      .catch(() => {});

    // Cargar datos guardados del localStorage
    const savedFormData = localStorage.getItem(FORM_STORAGE_KEY);
    if (savedFormData) {
      try {
        const { name: savedName, phoneNumber: savedPhone, phoneCountryCode: savedCC, selectedCareerId: savedCareer, email: savedEmail, password: savedPassword, confirmPassword: savedConfirmPassword, termsAccepted: savedTerms } = JSON.parse(savedFormData);
        if (savedName) setName(savedName);
        if (savedPhone) setPhoneNumber(savedPhone);
        if (savedCC) setPhoneCountryCode(savedCC);
        if (savedCareer) setSelectedCareerId(savedCareer);
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
        if (savedConfirmPassword) setConfirmPassword(savedConfirmPassword);
        setTermsAccepted(savedTerms || false);
      } catch (e) {
        console.error('Error loading form data:', e);
      }
    }
  }, []);

  // Guardar datos del formulario en localStorage cuando cambian
  useEffect(() => {
    const formData = {
      name,
      phoneNumber,
      phoneCountryCode,
      selectedCareerId,
      email,
      password,
      confirmPassword,
      termsAccepted,
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
  }, [name, phoneNumber, phoneCountryCode, selectedCareerId, email, password, confirmPassword, termsAccepted]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword || !selectedCareerId) {
      setError(t('auth.register.errors.allFieldsRequired'));
      return;
    }

    if (!termsAccepted) {
      setError(t('auth.register.errors.termsNotAccepted'));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t('auth.register.errors.invalidEmail'));
      return;
    }

    // Phone is optional, but if the user typed one it must be a valid
    // 7–15 digit local number.
    if (phoneNumber && !isValidPhoneLocal(phoneNumber)) {
      setError(t('auth.register.errors.invalidPhone'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.register.errors.passwordsDontMatch'));
      return;
    }

    // Full policy: min 6, uppercase, special char, no whitespace.
    if (!isValidPassword(password)) {
      setError(t('auth.register.errors.weakPassword'));
      return;
    }

    setLoading(true);
    try {
      const fullPhone = joinPhone(phoneCountryCode, phoneNumber);

      const result = await AuthService.register({
        name: sanitizeName(name),
        email: normalizeEmail(email),
        password,
        phone: fullPhone,
        careerId: selectedCareerId,
        terms: termsAccepted,
      });

      if (result.success) {
        localStorage.removeItem(FORM_STORAGE_KEY);
        // Do NOT call refreshUserData() here — the user is not authenticated
        // until they verify their email. Redirect straight to the verify page.
        router.push(`${routes.VERIFY_EMAIL}?email=${encodeURIComponent(email)}`);
      } else {
        throw new Error('Registration failed');
      }
    } catch (err) {
      console.error('Registration error:', err);

      let errorMessage = err.message || 'Error en registro';

      if (errorMessage.includes('EMAIL_EXISTS') || errorMessage.includes('email-already-in-use')) {
        errorMessage = t('auth.register.errors.emailAlreadyExists');
      } else if (errorMessage.includes('WEAK_PASSWORD') || errorMessage.includes('weak-password')) {
        errorMessage = t('auth.register.errors.weakPassword');
      } else if (errorMessage.includes('invalid-email')) {
        errorMessage = t('auth.register.errors.invalidEmail');
      } else {
        errorMessage = t('auth.register.errors.registrationFailed');
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (type) => {
    setActiveModal(type);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row register-bg">

      {/* ── BRANDING (izquierda en desktop, arriba en móvil) ── */}
      <aside className="relative SecondaryBackground overflow-hidden flex flex-col items-center justify-center text-center px-6 pt-10 pb-10 lg:w-1/2 lg:py-16 lg:px-16">
        {/* Formas decorativas */}
        <div aria-hidden="true" className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-white/10 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-40 -right-32 w-[26rem] h-[26rem] rounded-full bg-white/10 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start text-left max-w-md w-full">
          <Image
            src={CalicoLogo}
            alt="Calico"
            className="w-56 md:w-72 lg:w-80 xl:w-96 h-auto"
            priority
          />
          <h3 className="text-3xl md:text-4xl font-bold mt-6 text-white leading-tight">
            {t('auth.brand.tagline')}
          </h3>
          <p className="hidden md:block text-white/90 mt-4 text-base">
            {t('auth.brand.pitch')}
          </p>
          <ul className="hidden md:flex flex-col gap-4 mt-8 text-base text-white w-full">
            <li className="flex items-center gap-3">
              <span className="flex items-center justify-center w-11 h-11 rounded-full bg-white flex-shrink-0">
                <GraduationCap className="w-5 h-5" style={{ color: 'var(--calico-orange)' }} />
              </span>
              <span>{t('auth.brand.benefit1')}</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex items-center justify-center w-11 h-11 rounded-full bg-white flex-shrink-0">
                <Calendar className="w-5 h-5" style={{ color: 'var(--calico-orange)' }} />
              </span>
              <span>{t('auth.brand.benefit2')}</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex items-center justify-center w-11 h-11 rounded-full bg-white flex-shrink-0">
                <Star className="w-5 h-5" style={{ color: 'var(--calico-orange)' }} />
              </span>
              <span>{t('auth.brand.benefit3')}</span>
            </li>
          </ul>
        </div>
      </aside>

      {/* ── FORMULARIO (derecha en desktop, abajo en móvil) ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-8 lg:py-12 lg:w-1/2 lg:px-8">
        <div className="w-full max-w-xl flex flex-col items-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-700 text-center">
            {t('auth.register.title')}
          </h2>
          <p className="text-gray-600 mt-1 mb-5 text-center">
            {t('auth.register.subtitle')}
          </p>
        </div>
        <form
          onSubmit={handleRegister}
          className="flex flex-col items-center w-full max-w-xl"
        >
          {/* Inputs en dos sub-columnas en md+ */}
          <div className="flex flex-col gap-3 w-full md:flex-row">

            {/* Sub-columna izquierda */}
            <div className="flex flex-col flex-1 min-w-0">
              <label className="mb-1 text-sm text-slate-500">{t('auth.register.name')}</label>
              <input
                type="text"
                className="w-full mb-3 p-2 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
                placeholder={t('auth.register.namePlaceholder')}
                value={name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="mb-1 text-sm text-slate-500">{t('auth.register.phone')}</label>
              <div className="flex gap-2 mb-1">
                <select
                  className="p-2 border rounded-lg text-sm bg-white max-w-[6.5rem] flex-shrink-0"
                  value={phoneCountryCode}
                  onChange={(e) => setPhoneCountryCode(e.target.value)}
                  aria-label="Código de país"
                >
                  {PHONE_COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code} title={c.label}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  className="flex-1 min-w-0 p-2 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
                  placeholder={t('auth.register.phonePlaceholder')}
                  value={phoneNumber}
                  maxLength={PHONE_MAX_DIGITS}
                  onChange={(e) => setPhoneNumber(sanitizePhoneDigits(e.target.value).slice(0, PHONE_MAX_DIGITS))}
                />
              </div>
              <p className="text-xs text-gray-500 mb-3 leading-snug">
                {t('auth.register.phoneHelp')}
              </p>

              <label className="mb-1 text-sm text-slate-500">{t('auth.register.major')}</label>
              <select
                className="w-full mb-0 p-2 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
                value={selectedCareerId}
                onChange={(e) => setSelectedCareerId(e.target.value)}
              >
                <option value="">{t('auth.register.majorPlaceholder')}</option>
                {careers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Sub-columna derecha */}
            <div className="flex flex-col flex-1 min-w-0">
              <label className="mb-1 text-sm text-slate-500">{t('auth.register.email')}</label>
              <input
                type="email"
                className="w-full mb-3 p-2 border rounded-lg placeholder:text-gray-300 text-sm bg-white"
                placeholder={t('auth.register.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className="mb-1 text-sm text-slate-500">{t('auth.register.password')}</label>
              <div className="relative mb-3 w-full">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full p-2 pr-10 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
                  placeholder={t('auth.register.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(stripWhitespace(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <label className="mb-1 text-sm text-slate-500">{t('auth.register.confirmPassword')}</label>
              <div className="relative w-full">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="w-full p-2 pr-10 border rounded-lg placeholder:text-gray-400 text-sm bg-white"
                  placeholder={t('auth.register.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(stripWhitespace(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Reglas de contraseña — centradas, debajo de todos los inputs */}
          {password && (
            <div className="flex flex-col items-center gap-1 text-xs mt-4">
              {passwordRules.map((rule) => {
                const passed = rule.test(password);
                return (
                  <div key={rule.key} className="flex items-center gap-1.5">
                    {passed ? (
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    )}
                    <span className={passed ? 'text-green-600' : 'text-red-500'}>
                      {rule.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm mt-3 text-center max-w-xs">{error}</p>
          )}

          {/* Términos y condiciones */}
          <div className="flex items-start gap-3 mt-5 mb-2 max-w-md w-full">
            <input
              type="checkbox"
              id="termsCheckbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-5 h-5 cursor-pointer accent-orange-600 flex-shrink-0 mt-0.5"
            />
            <label htmlFor="termsCheckbox" className="text-sm text-gray-700 leading-relaxed cursor-pointer font-medium">
              {t('auth.register.termsCheckbox')}
              <button
                type="button"
                onClick={() => handleOpenModal('terms')}
                className="text-orange-600 underline hover:text-orange-700 font-semibold"
              >
                {t('auth.register.termsAndConditions')}
              </button>
              {t('auth.register.termsAnd')}
              <button
                type="button"
                onClick={() => handleOpenModal('privacy')}
                className="text-orange-600 underline hover:text-orange-700 font-semibold"
              >
                {t('auth.register.dataProcessing')}
              </button>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="SecondaryBackground text-gray-700 py-2 px-4 rounded-lg w-1/2 md:w-56 mt-3 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4 text-gray-700" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {loading ? t('auth.login.loading') : t('auth.register.registerButton')}
          </button>

          <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
            <span>Tu información viaja cifrada y nunca se comparte con terceros.</span>
          </div>
        </form>

        <div className="flex gap-1 pt-3 text-sm">
          <p className="text-gray-500">{t('auth.register.alreadyHaveAccount')}</p>
          <Link href={routes.LOGIN} className="text-orange-600 underline hover:cursor-pointer">
            {t('auth.register.signIn')}
          </Link>
        </div>

        <TermsModal
          isOpen={activeModal === 'terms'}
          onClose={handleCloseModal}
          title="Términos y Condiciones"
          content={<TermsContent />}
        />
        <TermsModal
          isOpen={activeModal === 'privacy'}
          onClose={handleCloseModal}
          title="Política de Privacidad"
          content={<PrivacyContent />}
        />
      </section>

    </div>
  );
};

export default Register;
