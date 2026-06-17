'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, Plus, XCircle } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';

const emptyForm = {
  code: '',
  name: '',
  complexity: 'Introductory',
  basePrice: '',
};

export default function AdminCoursesPage() {
  const { t, formatCurrency } = useI18n();
  const [form, setForm] = useState(emptyForm);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const suggestionsRes = await AdminService.listCourseSuggestions({ status: 'Pending' });
      if (!suggestionsRes.success) throw new Error(suggestionsRes.error || t('admin.courses.errors.load'));

      setSuggestions(suggestionsRes.suggestions || []);
    } catch (err) {
      setError(err.message || t('admin.courses.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFlash('');
    try {
      const res = await AdminService.createCourse(form);
      if (!res.success) throw new Error(res.error || t('admin.courses.errors.create'));
      setFlash(t('admin.courses.flash.created'));
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || t('admin.courses.errors.create'));
    } finally {
      setSaving(false);
    }
  };

  const approve = async (suggestion) => {
    setActingId(suggestion.id);
    setError('');
    setFlash('');
    try {
      const res = await AdminService.approveCourseSuggestion(suggestion.id, {
        code: suggestion.code,
        name: suggestion.name,
        complexity: form.complexity || 'Introductory',
        basePrice: Number(form.basePrice || 0),
      });
      if (!res.success) throw new Error(res.error || t('admin.courses.errors.approve'));
      setFlash(t('admin.courses.flash.approved'));
      await load();
    } catch (err) {
      setError(err.message || t('admin.courses.errors.approve'));
    } finally {
      setActingId(null);
    }
  };

  const reject = async (suggestion) => {
    setActingId(suggestion.id);
    setError('');
    setFlash('');
    try {
      const res = await AdminService.rejectCourseSuggestion(suggestion.id);
      if (!res.success) throw new Error(res.error || t('admin.courses.errors.reject'));
      setFlash(t('admin.courses.flash.rejected'));
      await load();
    } catch (err) {
      setError(err.message || t('admin.courses.errors.reject'));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-orange-100 rounded-xl">
          <BookOpen className="w-5 h-5 text-orange-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800">{t('admin.courses.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl leading-relaxed">
            {t('admin.courses.subtitle')}
          </p>
        </div>
      </div>

      {flash && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">{flash}</div>}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm font-medium text-gray-700">
          {t('admin.courses.fields.code')}
          <input required value={form.code} onChange={update('code')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm uppercase" />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t('admin.courses.fields.name')}
          <input required value={form.name} onChange={update('name')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t('admin.courses.fields.complexity')}
          <select value={form.complexity} onChange={update('complexity')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <option value="Introductory">{t('admin.courses.complexity.Introductory')}</option>
            <option value="Foundational">{t('admin.courses.complexity.Foundational')}</option>
            <option value="Challenging">{t('admin.courses.complexity.Challenging')}</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t('admin.courses.fields.basePrice')}
          <input required type="number" min="0" step="1000" value={form.basePrice} onChange={update('basePrice')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-orange-300">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('admin.courses.create')}
          </button>
        </div>
      </form>

      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">{t('admin.courses.suggestions.title')}</h3>
            <p className="text-xs text-gray-500">{t('admin.courses.suggestions.subtitle')}</p>
          </div>
          <span className="text-xs font-semibold text-orange-600 bg-orange-50 rounded-full px-2 py-1">
            {suggestions.length}
          </span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">{t('admin.courses.suggestions.empty')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="py-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">{suggestion.code}</p>
                    <p className="text-sm text-gray-700 truncate">{suggestion.name}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {suggestion.requester?.name || suggestion.requester?.email || t('admin.courses.suggestions.unknownRequester')}
                  </p>
                  {suggestion.notes && <p className="text-xs text-gray-600 mt-2">{suggestion.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => approve(suggestion)} disabled={actingId === suggestion.id} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('admin.courses.suggestions.approve', { price: formatCurrency(Number(form.basePrice || 0), 'COP') })}
                  </button>
                  <button type="button" onClick={() => reject(suggestion)} disabled={actingId === suggestion.id} className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    {t('admin.courses.suggestions.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
