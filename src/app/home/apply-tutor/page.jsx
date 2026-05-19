"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, GraduationCap, Clock, Users, BookOpen, ChevronRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/SecureAuthContext";
import { TutorApplicationService } from "../../services/core/TutorApplicationService";
import { useI18n } from "../../../lib/i18n";
import routes from "../../../routes";
import {
  PHONE_COUNTRY_CODES,
  DEFAULT_PHONE_COUNTRY_CODE,
  splitPhone,
  joinPhone,
} from "../../../lib/utils/phone";
import {
  sanitizePhoneDigits,
  isValidPhoneLocal,
  PHONE_MAX_DIGITS,
} from "../../../lib/utils/validation";
import "./ApplyTutor.css";

// ─── Custom hook: form logic + API call ──────────────────────────────────────

function useTutorApplicationForm({ initialPhone, onSuccess }) {
  const initialSplit = splitPhone(initialPhone);
  const [form, setForm] = useState({
    reasonsToTeach: "",
    subjects: [],
    phoneCountryCode: initialSplit.code,
    phoneLocal: initialSplit.local,
    llave: "",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  // If the user object resolves after the form mounted, hydrate the phone
  // fields once with the saved value (don't override later edits).
  useEffect(() => {
    if (!initialPhone) return;
    setForm((prev) => {
      if (prev.phoneLocal) return prev;
      const { code, local } = splitPhone(initialPhone);
      return { ...prev, phoneCountryCode: code, phoneLocal: local };
    });
  }, [initialPhone]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
  }, []);

  const toggleSubject = useCallback((courseId) => {
    setForm((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(courseId)
        ? prev.subjects.filter((s) => s !== courseId)
        : [...prev.subjects, courseId],
    }));
    setErrors((prev) => ({ ...prev, subjects: null }));
  }, []);

  const validate = () => {
    const next = {};
    if (form.reasonsToTeach.trim().length < 20) {
      next.reasonsToTeach = "Describe tu motivación con al menos 20 caracteres.";
    }
    if (form.subjects.length === 0) {
      next.subjects = "Selecciona al menos una materia.";
    }
    if (!isValidPhoneLocal(form.phoneLocal)) {
      next.phone = "Ingresa un número de WhatsApp válido (7 a 15 dígitos).";
    }
    if (form.llave.trim().length === 0) {
      next.llave = "Ingresa tu llave de pago (Nequi, Daviplata, etc.).";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    setServerError(null);
    try {
      const result = await TutorApplicationService.submit({
        reasonsToTeach: form.reasonsToTeach.trim(),
        subjects: form.subjects,
        contactInfo: {
          phone: joinPhone(form.phoneCountryCode, form.phoneLocal),
          preferredMethod: "WA",
          llave: form.llave.trim(),
        },
      });
      if (result.success) {
        onSuccess();
      } else if (result.ok === false && result.status === 0) {
        // authFetch couldn't reach the server (offline / CORS / timeout).
        setServerError("No pudimos conectarnos al servidor. Revisa tu conexión y vuelve a intentarlo.");
      } else {
        setServerError(result.error || "Ocurrió un error. Intenta de nuevo.");
      }
    } catch (err) {
      console.error("[ApplyTutor] submit failed:", err);
      setServerError(err?.message || "Ocurrió un error inesperado. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return { form, errors, isLoading, serverError, setField, toggleSubject, submit };
}

// ─── Intro screen ────────────────────────────────────────────────────────────

const RESPONSIBILITIES = [
  {
    icon: Clock,
    title: "Compromiso real de tiempo",
    description: "Debes responder solicitudes de tutoría en menos de 24 h y cumplir los horarios acordados.",
  },
  {
    icon: BookOpen,
    title: "Dominio del tema",
    description: "Solo podrás ofrecer materias en las que tengas un sólido conocimiento verificable.",
  },
  {
    icon: Users,
    title: "Trato respetuoso",
    description: "Toda interacción con estudiantes debe ser profesional y dentro de las políticas de Calico.",
  },
  {
    icon: GraduationCap,
    title: "Proceso de aprobación",
    description: "Tu solicitud será revisada por el equipo de Calico. Si es aprobada, recibirás un correo o mensaje de WhatsApp con los siguientes pasos.",
  },
];

function TutorIntroScreen({ onProceed }) {
  const router = useRouter();

  return (
    <div className="apply-tutor-page">
      <div className="apply-tutor-container">
        <div className="apply-tutor-header">
          <h1>¿Quieres ser tutor en Calico?</h1>
          <p>Antes de continuar, lee con atención lo que implica ser parte de nuestra red de tutores.</p>
        </div>

        <div className="apply-tutor-card">
          <div className="intro-responsibilities">
            {RESPONSIBILITIES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="intro-responsibility-item">
                <div className="intro-responsibility-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="intro-responsibility-title">{title}</p>
                  <p className="intro-responsibility-desc">{description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="intro-note">
            <strong>Ten en cuenta:</strong> ser tutor no es para todos, y está bien. Es una decisión que requiere disposición, paciencia y amor por enseñar. Si no estás seguro, ¡puedes volver cuando te sientas listo!
          </div>

          <div className="intro-actions">
            <button className="apply-submit-btn" onClick={onProceed}>
              Sí, quiero aplicar <ChevronRight size={16} style={{ display: "inline", marginLeft: 4 }} />
            </button>
            <button
              className="intro-back-btn"
              onClick={() => router.push(routes.PROFILE)}
            >
              <ArrowLeft size={15} /> Volver a mi perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ApplyTutorPage() {
  const router = useRouter();
  const { user, refreshUserData } = useAuth();
  const { t } = useI18n();

  const [step, setStep] = useState("intro"); // 'intro' | 'form' | 'success'
  const [courses, setCourses] = useState([]);

  // Guard: redirect if already a tutor or already pending
  useEffect(() => {
    if (!user.isLoggedIn) return;
    if (user.isTutorApproved) {
      router.replace(routes.TUTOR_INICIO);
    }
    if (user.tutorApplicationStatus === "Pending") {
      router.replace(routes.HOME);
    }
  }, [user, router]);

  // Load courses for the subject selector
  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCourses(data.courses);
      })
      .catch(() => {});
  }, []);

  const handleSuccess = useCallback(async () => {
    setStep("success");
    // Refresh auth context so Header updates immediately to "Solicitud en revisión"
    await refreshUserData();
  }, [refreshUserData]);

  const { form, errors, isLoading, serverError, setField, toggleSubject, submit } =
    useTutorApplicationForm({ initialPhone: user?.phone || "", onSuccess: handleSuccess });

  if (step === "intro") {
    return <TutorIntroScreen onProceed={() => setStep("form")} />;
  }

  return (
    <div className="apply-tutor-page">
      <div className="apply-tutor-container">
        <div className="apply-tutor-header">
          <h1>Solicitud de tutor</h1>
          <p>Cuéntanos sobre ti. Revisaremos tu solicitud y te contactaremos pronto.</p>
        </div>

        <div className="apply-tutor-card">
          {step === "success" ? (
            <div className="apply-success">
              <div className="apply-success-icon">
                <CheckCircle size={36} />
              </div>
              <h2>¡Solicitud enviada!</h2>
              <p>
                Hemos recibido tu solicitud. Próximamente te contactaremos vía WA o email.
              </p>
            </div>
          ) : (
            <>
              {/* Reasons */}
              <div className="form-field">
                <label htmlFor="reasons">¿Por qué quieres ser tutor?</label>
                <textarea
                  id="reasons"
                  rows={4}
                  placeholder="Cuéntanos tu motivación, experiencia enseñando o qué te hace un buen candidato…"
                  value={form.reasonsToTeach}
                  onChange={(e) => setField("reasonsToTeach", e.target.value)}
                />
                {errors.reasonsToTeach && (
                  <span className="field-error">{errors.reasonsToTeach}</span>
                )}
              </div>

              {/* Subjects */}
              <div className="form-field">
                <label>Materias que puedes enseñar</label>
                {courses.length > 0 ? (
                  <div className="subjects-grid">
                    {courses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        className={`subject-chip ${form.subjects.includes(course.id) ? "selected" : ""}`}
                        onClick={() => toggleSubject(course.id)}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={form.subjects.includes(course.id)}
                          tabIndex={-1}
                        />
                        {course.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="field-hint">Cargando materias…</span>
                )}
                {errors.subjects && (
                  <span className="field-error">{errors.subjects}</span>
                )}
              </div>

              {/* WhatsApp — prellena con el teléfono ya registrado del usuario.
                  Si lo cambia aquí, sobrescribe users.phone_number en el backend
                  (no guardamos un número de WhatsApp aparte). */}
              <div className="form-field">
                <label htmlFor="phone">Número de WhatsApp</label>
                <div className="contact-row">
                  <select
                    value={form.phoneCountryCode}
                    onChange={(e) => setField("phoneCountryCode", e.target.value)}
                    aria-label="Código de país"
                  >
                    {PHONE_COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code} title={c.label}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="300 123 4567"
                    value={form.phoneLocal}
                    maxLength={PHONE_MAX_DIGITS}
                    onChange={(e) => setField("phoneLocal", sanitizePhoneDigits(e.target.value).slice(0, PHONE_MAX_DIGITS))}
                  />
                </div>
                {errors.phone && <span className="field-error">{errors.phone}</span>}
                <span className="field-hint">
                  {user?.phone
                    ? "Este es el número que registraste. Puedes actualizarlo aquí si quieres y se guardará en tu perfil."
                    : "Te contactaremos por WhatsApp a este número si tu solicitud avanza."}
                </span>
              </div>

              {/* Llave de pago */}
              <div className="form-field">
                <label htmlFor="llave">Llave de pago</label>
                <input
                  id="llave"
                  type="text"
                  placeholder="ej. @felipe-rueda · 3001234567 · cc 1023456789"
                  value={form.llave}
                  onChange={(e) => setField("llave", e.target.value)}
                />
                {errors.llave && <span className="field-error">{errors.llave}</span>}
                <span className="field-hint">
                  Ingresa tu llave (Nequi, Daviplata u otra) para recibir el pago de tus
                  tutorías. Escríbela exactamente como aparece en tu app, incluyendo el
                  &quot;@&quot; si aplica, para evitar confusiones en las transferencias.
                </span>
              </div>

              {serverError && (
                <span className="field-error" style={{ textAlign: "center" }}>
                  {serverError}
                </span>
              )}

              {/* If validation fails after a click, surface a single line
                  pointing the user to the inline errors above — easy to miss
                  on a long form. */}
              {!serverError && Object.keys(errors).length > 0 && (
                <span className="field-error" style={{ textAlign: "center" }}>
                  Revisa los campos marcados arriba antes de enviar.
                </span>
              )}

              <button
                type="button"
                className="apply-submit-btn"
                onClick={submit}
                disabled={isLoading}
              >
                {isLoading && <span className="apply-submit-spinner" aria-hidden="true" />}
                {isLoading ? "Enviando…" : "Enviar solicitud"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
