"use client";

import { useEffect, useState } from "react";
import { BookPlus, CheckCircle2, Loader2, X } from "lucide-react";
import { authFetch } from "../../services/authFetch";
import { useI18n } from "../../../lib/i18n";

const emptyForm = { code: "", name: "", notes: "" };

export default function SuggestCourseModal({ open, onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setError("");
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const { ok, data } = await authFetch("/api/course-suggestions", {
      method: "POST",
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        notes: form.notes,
      }),
    });

    setSubmitting(false);
    if (ok) {
      setSuccess(true);
      setTimeout(onClose, 1400);
      return;
    }

    setError(
      data?.error === "COURSE_EXISTS"
        ? t("courseSuggestion.errors.exists")
        : data?.error || t("courseSuggestion.errors.generic"),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-orange-100 p-2">
              <BookPlus className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">{t("courseSuggestion.title")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{t("courseSuggestion.subtitle")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-sm font-medium text-gray-700">{t("courseSuggestion.success")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 p-5">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <label className="text-sm font-medium text-gray-700">
              {t("courseSuggestion.fields.code")}
              <input
                required
                value={form.code}
                onChange={update("code")}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm uppercase"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              {t("courseSuggestion.fields.name")}
              <input
                required
                value={form.name}
                onChange={update("name")}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              {t("courseSuggestion.fields.notes")}
              <textarea
                value={form.notes}
                onChange={update("notes")}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:bg-orange-300">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("courseSuggestion.submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
