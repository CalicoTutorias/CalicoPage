"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../../lib/i18n";
import { X, Plus, Trash2, Clock, CheckCircle, XCircle, Info } from "lucide-react";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";
import { authFetch } from "@/app/services/authFetch";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getPrice(tc) {
  return tc.course?.coursePrice?.price ?? tc.course?.basePrice ?? null;
}

function formatPrice(val) {
  if (val == null) return "—";
  return `$${Number(val).toLocaleString("es-CO")}`;
}

const STATUS_CONFIG = {
  Approved: {
    color: "bg-emerald-100 text-emerald-800",
    icon: CheckCircle,
    cardBorder: "border-emerald-100",
  },
  Pending: {
    color: "bg-amber-100 text-amber-800",
    icon: Clock,
    cardBorder: "border-amber-100",
  },
  Rejected: {
    color: "bg-red-100 text-red-800",
    icon: XCircle,
    cardBorder: "border-red-100",
  },
};

const EMPTY_ROW = () => ({ id: Date.now() + Math.random(), courseId: "", experience: "", workSampleUrl: "" });

// ─── component ────────────────────────────────────────────────────────────────

export default function TutorMaterias() {
  const { t } = useI18n();

  const [tutorCourses, setTutorCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  // request modal
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState([EMPTY_ROW()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // remove
  const [removingId, setRemovingId] = useState(null);

  // ── data ─────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tutorRes, allRes] = await Promise.all([
        authFetch("/api/tutor/courses"),
        authFetch("/api/courses"),
      ]);
      if (tutorRes.data?.success) setTutorCourses(tutorRes.data.courses);
      if (allRes.data?.success) setAllCourses(allRes.data.courses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── derived ───────────────────────────────────────────────────────────────────

  const approved = tutorCourses.filter((tc) => tc.status === "Approved");
  const pending = tutorCourses.filter((tc) => tc.status === "Pending");
  const rejected = tutorCourses.filter((tc) => tc.status === "Rejected");

  const linkedIds = new Set(tutorCourses.map((tc) => tc.courseId));
  const availableCourses = allCourses.filter((c) => !linkedIds.has(c.id));

  const filteredCourses =
    activeTab === "approved" ? approved
    : activeTab === "pending" ? pending
    : activeTab === "rejected" ? rejected
    : tutorCourses;

  const tabs = [
    { key: "all", label: t("tutorCourses.tabs.all"), count: tutorCourses.length },
    { key: "approved", label: t("tutorCourses.tabs.approved"), count: approved.length },
    { key: "pending", label: t("tutorCourses.tabs.pending"), count: pending.length },
    ...(rejected.length > 0
      ? [{ key: "rejected", label: t("tutorCourses.tabs.rejected"), count: rejected.length }]
      : []),
  ];

  // ── modal ─────────────────────────────────────────────────────────────────────

  function openModal() {
    setRows([EMPTY_ROW()]);
    setSubmitError("");
    setSubmitSuccess(false);
    setShowModal(true);
  }

  function addRow() {
    setRows((prev) => [...prev, EMPTY_ROW()]);
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function chosenIdsExcept(rowId) {
    return new Set(rows.filter((r) => r.id !== rowId && r.courseId).map((r) => r.courseId));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (rows.some((r) => !r.courseId)) {
      setSubmitError(t("tutorCourses.request.errorSelectCourse"));
      return;
    }
    const uniqueIds = new Set(rows.map((r) => r.courseId));
    if (uniqueIds.size !== rows.length) {
      setSubmitError(t("tutorCourses.request.errorDuplicate"));
      return;
    }

    setSubmitting(true);
    const { ok, data } = await authFetch("/api/tutor/courses", {
      method: "POST",
      body: JSON.stringify({
        courses: rows.map(({ courseId, experience, workSampleUrl }) => ({
          courseId,
          ...(experience.trim() ? { experience: experience.trim() } : {}),
          ...(workSampleUrl.trim() ? { workSampleUrl: workSampleUrl.trim() } : {}),
        })),
      }),
    });
    setSubmitting(false);

    if (ok) {
      setSubmitSuccess(true);
      await fetchData();
      setTimeout(() => setShowModal(false), 1800);
      return;
    }

    if (data?.error === "COURSE_ALREADY_ADDED") {
      setSubmitError(t("tutorCourses.request.alreadyAdded"));
    } else {
      setSubmitError(data?.error || t("tutorCourses.request.errorGeneric"));
    }
  }

  async function handleRemove(courseId) {
    setRemovingId(courseId);
    await authFetch(`/api/tutor/courses/${courseId}`, { method: "DELETE" });
    await fetchData();
    setRemovingId(null);
  }

  function emptyLabel() {
    if (activeTab === "approved") return t("tutorCourses.noApproved");
    if (activeTab === "pending") return t("tutorCourses.noPending");
    if (activeTab === "rejected") return t("tutorCourses.noRejected");
    return t("tutorCourses.noCourses");
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageSectionHeader
        title={t("tutorCourses.title")}
        subtitle={t("tutorCourses.subtitle")}
        actions={
          <button
            type="button"
            onClick={openModal}
            disabled={availableCourses.length === 0}
            className="page-section-header__btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("tutorCourses.request.button")}
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center border border-emerald-100">
          <p className="text-2xl font-bold text-emerald-600">{approved.length}</p>
          <p className="text-xs text-gray-500 mt-1">{t("tutorCourses.stats.approvedCourses")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center border border-amber-100">
          <p className="text-2xl font-bold text-amber-500">{pending.length}</p>
          <p className="text-xs text-gray-500 mt-1">{t("tutorCourses.stats.pendingCourses")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center border border-sky-100">
          <p className="text-2xl font-bold text-blue-600">{availableCourses.length}</p>
          <p className="text-xs text-gray-500 mt-1">{t("tutorCourses.stats.availableCourses")}</p>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 text-xs rounded-full px-1.5 ${
                activeTab === tab.key ? "bg-white/20" : "bg-gray-100"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Course grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 text-sm">
          {t("tutorCourses.loading")}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-base">{emptyLabel()}</p>
          {activeTab === "all" && availableCourses.length > 0 && (
            <button onClick={openModal} className="mt-3 text-blue-600 underline text-sm">
              {t("tutorCourses.request.button")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredCourses.map((tc) => {
            const cfg = STATUS_CONFIG[tc.status] ?? STATUS_CONFIG.Pending;
            const StatusIcon = cfg.icon;
            const price = getPrice(tc);

            return (
              <div
                key={tc.courseId}
                className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-5 border ${cfg.cardBorder}`}
              >
                {/* Course header */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-800 leading-snug break-words">
                      {tc.course?.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{tc.course?.code}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${cfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {t(`tutorCourses.status.${tc.status.toLowerCase()}`)}
                  </span>
                </div>

                {/* Centralized price (approved only) */}
                {tc.status === "Approved" && (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-3">
                    <span className="text-xs text-gray-500">{t("tutorCourses.card.calicoPriceLabel")}</span>
                    <span className="text-sm font-semibold text-gray-800">{formatPrice(price)}/h</span>
                  </div>
                )}

                {/* Status info banners */}
                {tc.status === "Pending" && (
                  <div className="flex items-start gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                    <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{t("tutorCourses.pendingInfo")}</p>
                  </div>
                )}
                {tc.status === "Rejected" && (
                  <div className="flex items-start gap-1.5 bg-red-50 rounded-lg px-3 py-2 mb-3">
                    <Info className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{t("tutorCourses.rejectedInfo")}</p>
                  </div>
                )}

                {/* Experience snippet */}
                {tc.experience && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{tc.experience}</p>
                )}

                {/* Evidence link */}
                {tc.workSampleUrl && (
                  <a
                    href={tc.workSampleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline truncate block mb-3"
                  >
                    Ver evidencia →
                  </a>
                )}

                {/* Remove button (only pending/rejected) */}
                {tc.status !== "Approved" && (
                  <button
                    onClick={() => handleRemove(tc.courseId)}
                    disabled={removingId === tc.courseId}
                    className="w-full text-xs text-gray-300 hover:text-red-400 transition-colors py-1 disabled:opacity-50"
                  >
                    {removingId === tc.courseId ? "…" : t("tutorCourses.card.remove")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start p-6 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {t("tutorCourses.request.modalTitle")}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {t("tutorCourses.request.modalSubtitle")}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitSuccess ? (
              /* Success screen */
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                <CheckCircle className="w-12 h-12 text-emerald-500" />
                <p className="text-gray-700 font-medium">{t("tutorCourses.request.successMessage")}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
                {/* Scrollable content */}
                <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4 flex-1">
                  {availableCourses.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">
                      {t("tutorCourses.request.noCourses")}
                    </p>
                  ) : (
                    <>
                      {rows.map((row, idx) => {
                        const alreadyChosen = chosenIdsExcept(row.id);
                        const options = availableCourses.filter((c) => !alreadyChosen.has(c.id));

                        return (
                          <div key={row.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-medium text-gray-500">Materia {idx + 1}</span>
                              {rows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRow(row.id)}
                                  className="text-gray-300 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="mb-3">
                              <label className="block text-xs text-gray-600 mb-1">
                                {t("tutorCourses.request.selectCourse")} *
                              </label>
                              <select
                                value={row.courseId}
                                onChange={(e) => updateRow(row.id, "courseId", e.target.value)}
                                className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                              >
                                <option value="">{t("tutorCourses.request.selectCoursePlaceholder")}</option>
                                {options.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.code} — {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mb-3">
                              <label className="block text-xs text-gray-600 mb-1">
                                {t("tutorCourses.request.experience")}
                              </label>
                              <textarea
                                rows={2}
                                value={row.experience}
                                onChange={(e) => updateRow(row.id, "experience", e.target.value)}
                                placeholder={t("tutorCourses.request.experiencePlaceholder")}
                                className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                {t("tutorCourses.request.workSample")}
                              </label>
                              <input
                                type="url"
                                value={row.workSampleUrl}
                                onChange={(e) => updateRow(row.id, "workSampleUrl", e.target.value)}
                                placeholder={t("tutorCourses.request.workSamplePlaceholder")}
                                className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                              />
                            </div>
                          </div>
                        );
                      })}

                      {availableCourses.length > rows.length && (
                        <button
                          type="button"
                          onClick={addRow}
                          className="flex items-center justify-center gap-2 text-sm text-blue-600 border border-blue-200 border-dashed rounded-xl py-3 hover:bg-blue-50 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          {t("tutorCourses.request.addRow")}
                        </button>
                      )}
                    </>
                  )}

                  {submitError && (
                    <p className="text-sm text-red-500 text-center">{submitError}</p>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex gap-3 p-6 pt-4 border-t border-gray-100 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    {t("tutorCourses.request.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || availableCourses.length === 0}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    {submitting
                      ? t("tutorCourses.request.submitting")
                      : t("tutorCourses.request.submit")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
