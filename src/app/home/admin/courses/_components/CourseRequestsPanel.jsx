'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';
import {
  CARD, CHIP, ERROR_BOX, INK, MUTED, SUCCESS_BOX, TONE,
} from '../../eventos/_components/ui';

const NS = 'admin.courses.courseRequests';

/**
 * Materias → Solicitudes de materia: materias que tutores ya aprobados piden
 * dictar, de revisión semanal. Es el lugar donde se aprueban: usa
 * PUT /api/admin/tutors/[userId]/courses/[courseId], que audita y, al
 * aprobar, avisa al tutor y a los estudiantes de «Avísame» de la materia.
 * Primero las que cubren demanda (estudiantes esperando).
 */
export default function CourseRequestsPanel() {
  const { t } = useI18n();
  const [state, setState] = useState({ loaded: false, items: [], error: false });
  const [acting, setActing] = useState(null); // `${tutorId}:${courseId}`
  const [notice, setNotice] = useState(null); // { tone, text }

  useEffect(() => {
    let ignore = false;
    AdminService.listPendingCourseRequests().then((res) => {
      if (ignore) return;
      setState(res.success
        ? { loaded: true, items: res.requests || [], error: false }
        : { loaded: true, items: [], error: true });
    });
    return () => { ignore = true; };
  }, []);

  const decide = async (req, status) => {
    const id = `${req.tutorId}:${req.courseId}`;
    setActing(id);
    setNotice(null);
    const res = await AdminService.setTutorCourseStatus(req.tutorId, req.courseId, status);
    setActing(null);
    if (!res.success) {
      setNotice({ tone: 'error', text: t(`${NS}.errors.decide`) });
      return;
    }
    setState((s) => ({ ...s, items: s.items.filter((r) => `${r.tutorId}:${r.courseId}` !== id) }));
    setNotice({
      tone: 'success',
      text: t(status === 'Approved' ? `${NS}.flash.approved` : `${NS}.flash.rejected`, {
        course: req.courseCode, tutor: req.tutorName || req.tutorEmail,
      }),
    });
  };

  if (!state.loaded) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  return (
    <section className="flex flex-col gap-3">
      <div className="min-w-0">
        <h3 className={`text-sm font-bold ${INK}`}>{t(`${NS}.title`)}</h3>
        <p className={`text-xs max-w-2xl ${MUTED}`}>{t(`${NS}.subtitle`)}</p>
      </div>

      {notice && <p role="status" className={notice.tone === 'error' ? ERROR_BOX : SUCCESS_BOX}>{notice.text}</p>}

      {state.error ? (
        <p className={ERROR_BOX}>{t(`${NS}.errors.load`)}</p>
      ) : state.items.length === 0 ? (
        <p className={SUCCESS_BOX}>{t(`${NS}.empty`)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.items.map((req) => {
            const id = `${req.tutorId}:${req.courseId}`;
            return (
              <li key={id} className={`${CARD} p-4 flex flex-col lg:flex-row lg:items-center gap-3`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-xs font-semibold ${INK}`}>{req.courseCode}</span>
                    <span className={INK}>{req.courseName}</span>
                    {req.waitingStudents > 0 && (
                      <span className={`${CHIP} ${req.courseNeedsTutor ? TONE.danger : TONE.info}`}>
                        {t(`${NS}.waiting`, { count: req.waitingStudents })}
                      </span>
                    )}
                    {!req.tutorActive && <span className={`${CHIP} ${TONE.neutral}`}>{t(`${NS}.suspended`)}</span>}
                  </div>
                  <p className={`text-xs mt-1 ${MUTED}`}>
                    <Link href={routes.ADMIN_TUTOR_DETAIL(req.tutorId)} className="hover:underline">
                      {req.tutorName || req.tutorEmail}
                    </Link>
                    {req.tutorName && req.tutorEmail ? ` · ${req.tutorEmail}` : ''}
                  </p>
                  {req.experience && <p className={`text-xs mt-2 ${INK}`}>{req.experience}</p>}
                  {req.workSampleUrl && (
                    <a
                      href={req.workSampleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--calico-orange-text)] hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t(`${NS}.workSample`)}
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" disabled={acting === id} onClick={() => decide(req, 'Approved')}>
                    <CheckCircle2 />
                    {t(`${NS}.approve`)}
                  </Button>
                  <Button size="sm" variant="outline" disabled={acting === id} onClick={() => decide(req, 'Rejected')}>
                    <XCircle />
                    {t(`${NS}.reject`)}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
