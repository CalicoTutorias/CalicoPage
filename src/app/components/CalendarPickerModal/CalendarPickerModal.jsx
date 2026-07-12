'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, CalendarDays, Check } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import CalendarService from '../../services/integrations/CalendarService';
import { Button } from '../../../components/ui/button';
import './CalendarPickerModal.css';

const RECURRING_SWATCHES = [
  { color: '#c3e8d0', label: 'Verde' },
  { color: '#bfdbfe', label: 'Azul' },
  { color: '#fde68a', label: 'Amarillo' },
  { color: '#fca5a5', label: 'Rojo' },
  { color: '#d9f99d', label: 'Lima' },
  { color: '#f9a8d4', label: 'Rosa' },
  { color: '#a5b4fc', label: 'Índigo' },
  { color: '#99f6e4', label: 'Turquesa' },
];

const ONETIME_SWATCHES = [
  { color: '#c4b5fd', label: 'Morado' },
  { color: '#6ee7b7', label: 'Esmeralda' },
  { color: '#fdba74', label: 'Naranja' },
  { color: '#7dd3fc', label: 'Celeste' },
  { color: '#f0abfc', label: 'Fucsia' },
  { color: '#fda4af', label: 'Coral' },
  { color: '#86efac', label: 'Verde claro' },
  { color: '#93c5fd', label: 'Azul claro' },
];

function ColorSwatchRow({ label, value, onChange, swatches, defaultColor }) {
  const active = value || defaultColor;
  return (
    <div className="cal-picker-color-row">
      <span className="cal-picker-color-row__label">{label}</span>
      <div className="cal-picker-color-row__swatches">
        {swatches.map((s) => (
          <button
            key={s.color}
            type="button"
            title={s.label}
            aria-label={s.label}
            aria-pressed={active === s.color}
            className={`cal-picker-swatch${active === s.color ? ' cal-picker-swatch--active' : ''}`}
            style={{ background: s.color }}
            onClick={() => onChange(s.color === active && value ? '' : s.color)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * CalendarPickerModal
 *
 * Shown after OAuth connect (or when the tutor clicks "Change calendar").
 * Lets the tutor pick which Google Calendar to sync from and choose the
 * event interpretation mode (available vs busy).
 *
 * Props:
 *   isOpen        – boolean
 *   onClose       – () => void
 *   currentId     – string|null  (currently saved calendarSyncId)
 *   currentMode   – 'available'|'busy'
 *   onSaved       – ({ calendarId, calendarName, mode }) => void
 */
export default function CalendarPickerModal({
  isOpen,
  onClose,
  currentId = null,
  currentMode = 'available',
  onSaved,
}) {
  const { t } = useI18n();
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(currentId);
  const [mode, setMode] = useState(currentMode);
  const [error, setError] = useState('');
  const [recurringColor, setRecurringColor] = useState('');
  const [onetimeColor, setOnetimeColor] = useState('');

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await CalendarService.listCalendars();
      setCalendars(list);
      // Default selection: keep currentId if still in list, else pick primary
      if (!currentId) {
        const primary = list.find((c) => c.primary) ?? list[0];
        if (primary) setSelectedId(primary.id);
      }
    } catch {
      setError(t('calendarPicker.loadError'));
    } finally {
      setLoading(false);
    }
  }, [currentId, t]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentId);
      setMode(currentMode);
      setRecurringColor(localStorage.getItem('calico_block_recurring_color') || '');
      setOnetimeColor(localStorage.getItem('calico_block_onetime_color') || '');
      loadCalendars();
    }
  }, [isOpen, currentId, currentMode, loadCalendars]);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const chosen = calendars.find((c) => c.id === selectedId);

      // Persist colors to localStorage and notify grid
      if (recurringColor) localStorage.setItem('calico_block_recurring_color', recurringColor);
      else localStorage.removeItem('calico_block_recurring_color');
      if (onetimeColor) localStorage.setItem('calico_block_onetime_color', onetimeColor);
      else localStorage.removeItem('calico_block_onetime_color');
      window.dispatchEvent(new CustomEvent('calico-color-update'));

      await Promise.all([
        CalendarService.selectCalendar(selectedId, chosen?.summary ?? selectedId),
        CalendarService.setSyncMode(mode),
      ]);
      onSaved?.({ calendarId: selectedId, calendarName: chosen?.summary ?? selectedId, mode });
      onClose();
    } catch {
      setError(t('calendarPicker.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cal-picker-backdrop" role="dialog" aria-modal="true" aria-label={t('calendarPicker.title')}>
      <div className="cal-picker-modal">
        {/* Header */}
        <div className="cal-picker-header">
          <div className="cal-picker-header__title">
            <CalendarDays size={18} aria-hidden="true" />
            <span>{t('calendarPicker.title')}</span>
          </div>
          <button
            type="button"
            className="cal-picker-close"
            onClick={onClose}
            aria-label={t('calendarPicker.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="cal-picker-body">
          <p className="cal-picker-desc">{t('calendarPicker.desc')}</p>

          {/* Calendar list */}
          <div className="cal-picker-section-label">{t('calendarPicker.whichCalendar')}</div>
          {loading ? (
            <p className="cal-picker-loading">{t('calendarPicker.loading')}</p>
          ) : (
            <ul className="cal-picker-list" role="listbox">
              {calendars.map((cal) => (
                <li
                  key={cal.id}
                  role="option"
                  aria-selected={selectedId === cal.id}
                  className={`cal-picker-item${selectedId === cal.id ? ' cal-picker-item--selected' : ''}`}
                  onClick={() => setSelectedId(cal.id)}
                >
                  <span
                    className="cal-picker-item__dot"
                    style={{ background: cal.backgroundColor ?? '#1a73e8' }}
                    aria-hidden="true"
                  />
                  <span className="cal-picker-item__name">
                    {cal.summary}
                    {cal.primary && (
                      <span className="cal-picker-item__badge">{t('calendarPicker.primaryBadge')}</span>
                    )}
                  </span>
                  {selectedId === cal.id && (
                    <Check size={14} className="cal-picker-item__check" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Mode toggle */}
          <div className="cal-picker-section-label cal-picker-section-label--spaced">
            {t('calendarPicker.modeTitle')}
          </div>
          <div className="cal-picker-modes">
            <label className={`cal-picker-mode${mode === 'available' ? ' cal-picker-mode--active' : ''}`}>
              <input
                type="radio"
                name="syncMode"
                value="available"
                checked={mode === 'available'}
                onChange={() => setMode('available')}
              />
              <div>
                <span className="cal-picker-mode__label">{t('calendarPicker.modeAvailableLabel')}</span>
                <span className="cal-picker-mode__desc">{t('calendarPicker.modeAvailableDesc')}</span>
              </div>
            </label>
            <label className={`cal-picker-mode${mode === 'busy' ? ' cal-picker-mode--active' : ''}`}>
              <input
                type="radio"
                name="syncMode"
                value="busy"
                checked={mode === 'busy'}
                onChange={() => setMode('busy')}
              />
              <div>
                <span className="cal-picker-mode__label">{t('calendarPicker.modeBusyLabel')}</span>
                <span className="cal-picker-mode__desc">{t('calendarPicker.modeBusyDesc')}</span>
              </div>
            </label>
          </div>

          {/* Block color pickers */}
          <div className="cal-picker-section-label cal-picker-section-label--spaced">
            {t('calendarPicker.colorsTitle')}
          </div>
          <p className="cal-picker-colors-desc">{t('calendarPicker.colorsDesc')}</p>
          <div className="cal-picker-color-rows">
            <ColorSwatchRow
              label={t('calendarPicker.colorRecurringLabel')}
              defaultColor="#c3e8d0"
              value={recurringColor}
              onChange={setRecurringColor}
              swatches={RECURRING_SWATCHES}
            />
            <ColorSwatchRow
              label={t('calendarPicker.colorOnetimeLabel')}
              defaultColor="#a855f7"
              value={onetimeColor}
              onChange={setOnetimeColor}
              swatches={ONETIME_SWATCHES}
            />
          </div>

          {error && <p className="cal-picker-error" role="alert">{error}</p>}
        </div>

        {/* Footer */}
        <div className="cal-picker-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t('calendarPicker.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !selectedId}
          >
            {saving ? t('calendarPicker.saving') : t('calendarPicker.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
