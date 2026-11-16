"use client";

import { useMemo, useState } from "react";
import { X, CheckCircle, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { authFetch } from "@/app/services/authFetch";
import { tutorPayout, TUTOR_SHARE_PCT } from "@/lib/payments/fees";

const NS = "tutorCourses.request";

function formatPrice(val) {
  if (val == null || Number(val) <= 0) return null;
  return `$${Math.round(Number(val)).toLocaleString("es-CO")}`;
}

const priceOf = (course) => Number(course.basePrice) || 0;

const SORTS = {
  code: (a, b) => String(a.code).localeCompare(String(b.code)),
  priceDesc: (a, b) => priceOf(b) - priceOf(a) || String(a.code).localeCompare(String(b.code)),
  priceAsc: (a, b) => priceOf(a) - priceOf(b) || String(a.code).localeCompare(String(b.code)),
};

const INPUT =
  "w-full rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] bg-white px-3 py-2 text-sm text-[var(--calico-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--calico-blue-tutor-soft)]";

/**
 * Solicitar materias en dos pasos:
 *   1. Explorar el catálogo (materias que el tutor todavía no tiene): código,
 *      nombre, carrera, nivel, precio por hora y lo que recibe el tutor por
 *      hora. Búsqueda, filtro por carrera y orden por precio. El tutor no ve
 *      cuántos tutores dictan cada materia.
 *   2. Para cada materia elegida, experiencia y evidencia (opcionales), y
 *      enviar. Calico aprueba cada una por separado.
 */
export default function RequestCoursesModal({ availableCourses, onClose, onSubmitted }) {
  const { t } = useI18n();
  const [step, setStep] = useState("choose");
  const [search, setSearch] = useState("");
  const [careerId, setCareerId] = useState("");
  const [sort, setSort] = useState("code");
  const [selected, setSelected] = useState([]); // courseIds, in selection order
  const [details, setDetails] = useState({}); // courseId → { experience, workSampleUrl }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const careers = useMemo(() => {
    const byId = new Map();
    for (const c of availableCourses) if (c.career?.id) byId.set(c.career.id, c.career);
    return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [availableCourses]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableCourses
      .filter((c) => !careerId || c.career?.id === careerId)
      .filter((c) => !q
        || String(c.code).toLowerCase().includes(q)
        || String(c.name).toLowerCase().includes(q)
        || (Array.isArray(c.aliases) && c.aliases.some((a) => String(a).toLowerCase().includes(q))))
      .sort(SORTS[sort]);
  }, [availableCourses, search, careerId, sort]);

  const byId = useMemo(() => new Map(availableCourses.map((c) => [c.id, c])), [availableCourses]);
  const isSelected = (id) => selected.includes(id);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const updateDetail = (id, field, value) =>
    setDetails((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (selected.length === 0) {
      setSubmitError(t(`${NS}.errorSelectCourse`));
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    const { ok, data } = await authFetch("/api/tutor/courses", {
      method: "POST",
      body: JSON.stringify({
        courses: selected.map((courseId) => {
          const experience = details[courseId]?.experience?.trim() ?? "";
          const workSampleUrl = details[courseId]?.workSampleUrl?.trim() ?? "";
          return {
            courseId,
            ...(experience ? { experience } : {}),
            ...(workSampleUrl ? { workSampleUrl } : {}),
          };
        }),
      }),
    });
    setSubmitting(false);

    if (ok) {
      setSubmitSuccess(true);
      await onSubmitted?.();
      setTimeout(onClose, 1800);
      return;
    }
    setSubmitError(
      data?.error === "COURSE_ALREADY_ADDED"
        ? t(`${NS}.alreadyAdded`)
        : data?.error || t(`${NS}.errorGeneric`),
    );
  }

  const complexityLabel = (c) => (c.complexity ? t(`courseCard.complexity.${c.complexity}`) : "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-courses-title"
        className="bg-white rounded-[var(--radius-xl)] shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 pb-4 border-b border-[var(--calico-slate-100)] flex-shrink-0">
          <div>
            <h2 id="request-courses-title" className="text-lg font-bold text-[var(--calico-ink)]">
              {t(`${NS}.modalTitle`)}
            </h2>
            <p className="text-xs text-[var(--calico-body-muted)] mt-1">
              {step === "choose" ? t(`${NS}.catalog.subtitle`, { share: TUTOR_SHARE_PCT }) : t(`${NS}.modalSubtitle`)}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t(`${NS}.cancel`)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {submitSuccess ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
            <CheckCircle className="w-12 h-12 text-[var(--calico-green-success)]" />
            <p className="text-[var(--calico-ink)] font-medium">{t(`${NS}.successMessage`)}</p>
          </div>
        ) : availableCourses.length === 0 ? (
          <p className="text-sm text-[var(--calico-body-muted)] text-center py-10 px-6">{t(`${NS}.noCourses`)}</p>
        ) : step === "choose" ? (
          <>
            {/* Filtros */}
            <div className="px-6 pt-4 flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--calico-slate-400)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t(`${NS}.catalog.searchPlaceholder`)}
                  aria-label={t(`${NS}.catalog.searchPlaceholder`)}
                  className={`${INPUT} pl-9`}
                />
              </div>
              <select
                value={careerId}
                onChange={(e) => setCareerId(e.target.value)}
                aria-label={t(`${NS}.catalog.careerFilter`)}
                className={`${INPUT} sm:w-56`}
              >
                <option value="">{t(`${NS}.catalog.allCareers`)}</option>
                {careers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label={t(`${NS}.catalog.sortLabel`)}
                className={`${INPUT} sm:w-48`}
              >
                {Object.keys(SORTS).map((key) => (
                  <option key={key} value={key}>{t(`${NS}.catalog.sort.${key}`)}</option>
                ))}
              </select>
            </div>

            {/* Catálogo */}
            <div className="overflow-y-auto px-6 py-4 flex-1">
              {visible.length === 0 ? (
                <p className="text-sm text-[var(--calico-body-muted)] text-center py-8">{t(`${NS}.catalog.empty`)}</p>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-[var(--calico-slate-200)] overflow-hidden">
                  {/* Encabezado solo en pantallas medianas en adelante */}
                  <div className="hidden md:grid grid-cols-[2rem_6.5rem_minmax(0,1fr)_9rem_7rem_7rem_7rem] gap-3 px-4 py-2 bg-[var(--calico-slate-50)] text-[11px] font-semibold uppercase tracking-wider text-[var(--calico-slate-500)]">
                    <span />
                    <span>{t(`${NS}.catalog.columns.code`)}</span>
                    <span>{t(`${NS}.catalog.columns.course`)}</span>
                    <span>{t(`${NS}.catalog.columns.career`)}</span>
                    <span>{t(`${NS}.catalog.columns.level`)}</span>
                    <span className="text-right">{t(`${NS}.catalog.columns.price`)}</span>
                    <span className="text-right">{t(`${NS}.catalog.columns.youEarn`)}</span>
                  </div>
                  <ul className="divide-y divide-[var(--calico-slate-100)]">
                    {visible.map((c) => {
                      const checked = isSelected(c.id);
                      const price = formatPrice(c.basePrice);
                      const earn = price ? formatPrice(tutorPayout(c.basePrice)) : null;
                      return (
                        <li key={c.id}>
                          <label
                            className={`grid grid-cols-[2rem_minmax(0,1fr)] md:grid-cols-[2rem_6.5rem_minmax(0,1fr)_9rem_7rem_7rem_7rem] gap-x-3 gap-y-1 items-center px-4 py-3 cursor-pointer transition ${
                              checked ? "bg-[var(--calico-blue-tutor-soft)]" : "hover:bg-[var(--calico-slate-50)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(c.id)}
                              aria-label={t(`${NS}.catalog.selectAria`, { code: c.code })}
                              className="h-4 w-4 accent-[var(--calico-blue-tutor)] row-span-4 self-start mt-0.5 md:row-span-1 md:self-center md:mt-0"
                            />
                            <span className="font-mono text-xs font-semibold text-[var(--calico-ink)]">{c.code}</span>
                            <span className="text-sm text-[var(--calico-ink)] md:col-auto col-start-2">{c.name}</span>
                            <span className="text-xs text-[var(--calico-body-muted)] col-start-2 md:col-auto" title={c.career?.name}>
                              {c.career?.name || "—"}
                              <span className="md:hidden"> · {complexityLabel(c)}</span>
                            </span>
                            <span className="hidden md:block text-xs text-[var(--calico-body-muted)]">{complexityLabel(c)}</span>
                            <span className="text-sm md:text-right text-[var(--calico-ink)] col-start-2 md:col-auto">
                              {price
                                ? <>{price}<span className="text-xs text-[var(--calico-body-muted)]">{t(`${NS}.catalog.perHour`)}</span></>
                                : <span className="text-xs text-[var(--calico-body-muted)]">{t(`${NS}.catalog.noPrice`)}</span>}
                              {earn && (
                                <span className="md:hidden text-xs text-[var(--calico-blue-tutor)]">
                                  {" · "}{t(`${NS}.catalog.youEarnInline`, { amount: earn })}
                                </span>
                              )}
                            </span>
                            <span className="hidden md:block text-right text-sm font-semibold text-[var(--calico-blue-tutor)]">
                              {earn ?? "—"}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 p-6 pt-4 border-t border-[var(--calico-slate-100)] flex-shrink-0">
              <p className="text-xs text-[var(--calico-body-muted)] sm:mr-auto">
                {t(`${NS}.catalog.selectedCount`, { count: selected.length })}
              </p>
              <Button type="button" variant="outline" onClick={onClose}>{t(`${NS}.cancel`)}</Button>
              <Button type="button" variant="tutor" disabled={selected.length === 0} onClick={() => setStep("details")}>
                {t(`${NS}.catalog.continue`, { count: selected.length })}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
            <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4 flex-1">
              {selected.map((id) => {
                const c = byId.get(id);
                if (!c) return null;
                const price = formatPrice(c.basePrice);
                return (
                  <div key={id} className="rounded-[var(--radius-xl)] border border-[var(--calico-slate-100)] p-4 bg-[var(--calico-slate-50)]">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--calico-ink)]">
                          <span className="font-mono text-xs mr-1.5">{c.code}</span>{c.name}
                        </p>
                        <p className="text-xs text-[var(--calico-body-muted)]">
                          {[c.career?.name, price && `${price}${t(`${NS}.catalog.perHour`)}`].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => toggle(id)}>
                        {t(`${NS}.removeRow`)}
                      </Button>
                    </div>
                    <label className="block text-xs text-[var(--calico-slate-700)] mb-1">
                      {t(`${NS}.experience`)}
                      <textarea
                        rows={2}
                        value={details[id]?.experience ?? ""}
                        onChange={(e) => updateDetail(id, "experience", e.target.value)}
                        placeholder={t(`${NS}.experiencePlaceholder`)}
                        className={`${INPUT} mt-1 resize-none`}
                      />
                    </label>
                    <label className="block text-xs text-[var(--calico-slate-700)] mt-2">
                      {t(`${NS}.workSample`)}
                      <input
                        type="url"
                        value={details[id]?.workSampleUrl ?? ""}
                        onChange={(e) => updateDetail(id, "workSampleUrl", e.target.value)}
                        placeholder={t(`${NS}.workSamplePlaceholder`)}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                );
              })}
              {submitError && <p className="text-sm text-[var(--calico-danger-strong)] text-center">{submitError}</p>}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 p-6 pt-4 border-t border-[var(--calico-slate-100)] flex-shrink-0">
              <Button type="button" variant="outline" className="sm:mr-auto" onClick={() => setStep("choose")}>
                <ArrowLeft />
                {t(`${NS}.catalog.back`)}
              </Button>
              <Button type="submit" variant="tutor" disabled={submitting || selected.length === 0}>
                {submitting ? t(`${NS}.submitting`) : t(`${NS}.submit`)}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
