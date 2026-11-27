const routes = {
    LANDING:"/",
    HOME:"/home",
    EXPLORE:"/home/explore",
    SEARCH_TUTORS:"/home/buscar-tutores",
    FIND_TUTOR:"/home/find-tutor",

    // Tutor detail page (perfil completo + materias + reseñas + disponibilidad).
    // Optional `courseId` deep-links to a pre-selected subject.
    TUTOR_DETAIL: (tutorId, opts = {}) => {
        const base = `/home/buscar-tutores/tutor/${encodeURIComponent(tutorId)}`;
        if (opts.courseId) {
            const params = new URLSearchParams({ courseId: String(opts.courseId) });
            return `${base}?${params.toString()}`;
        }
        return base;
    },
    LOGIN:"/auth/login",
    REGISTER:"/auth/register",
    VERIFY_EMAIL: "/auth/verify-email",
    CONFIRM_EMAIL: "/auth/confirm-email",
    CONFIRM_UNIVERSITY_EMAIL: "/auth/confirmar-universidad",
    EMAIL_VERIFIED: "/auth/email-verified",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
    PROFILE: "/home/profile",
    // id of the university-email card on the profile (nudge and notification link here)
    UNIVERSITY_EMAIL_ANCHOR: "correo-universitario",
    // Lightweight one-screen flow to fill the fields Google sign-up skips
    // (phone + career). Reachable via the soft banner and the post-login
    // redirect for users whose profile is incomplete.
    COMPLETE_PROFILE: "/home/completar-perfil",

    HISTORY: "/home/history",
    // Invitation to a group tutoring session. `key` is the token of the
    // invitation email or, for the invited account, the invitation id.
    INVITATION: (key) => `/invitacion/${encodeURIComponent(key)}`,
    PRIVACY_POLICY: "/privacy-policy",
    // Public news/announcements archive. Not linked from the landing body on
    // purpose (conversion surface) — only from the footer and the home widget.
    NEWS: "/noticias",
    TERMS_AND_CONDITIONS: "/terms-and-conditions",

    // Booking page (replaces SessionConfirmationModal). Builder receives the
    // slot snapshot and serializes it to URL search params (refresh-safe).
    BOOK_SESSION: ({
        tutorId, courseId, start, end, slotId, parentAvailabilityId,
        slotIndex, price, tutorName, tutorEmail, course, location,
    } = {}) => {
        const params = new URLSearchParams();
        if (tutorId) params.set('tutorId', String(tutorId));
        if (courseId) params.set('courseId', String(courseId));
        if (start) params.set('start', start instanceof Date ? start.toISOString() : start);
        if (end) params.set('end', end instanceof Date ? end.toISOString() : end);
        if (slotId) params.set('slotId', String(slotId));
        if (parentAvailabilityId) params.set('parentAvailabilityId', String(parentAvailabilityId));
        if (slotIndex !== undefined && slotIndex !== null) params.set('slotIndex', String(slotIndex));
        if (price) params.set('price', String(price));
        if (tutorName) params.set('tutorName', tutorName);
        if (tutorEmail) params.set('tutorEmail', tutorEmail);
        if (course) params.set('course', course);
        if (location) params.set('location', location);
        return `/home/agendar?${params.toString()}`;
    },
    
    // Disponibilidad individual y conjunta
    INDIVIDUAL_AVAILABILITY: "/availability/individual",
    JOINT_AVAILABILITY: "/availability/joint",
    
    // Rutas específicas para tutores
    TUTOR_INICIO: '/tutor/inicio',
    TUTOR_MIS_TUTORIAS: '/tutor/mis-tutorias',
    // Page lives at app/tutor/materias → URL /tutor/materias
    TUTOR_MATERIAS: '/tutor/materias',
    TUTOR_COURSES: '/tutor/materias',
    TUTOR_COURSE_DETAIL: (id) => `/tutor/materias/${id}`,
    TUTOR_DISPONIBILIDAD: '/tutor/disponibilidad',
    TUTOR_STATISTICS: '/tutor/statistics',
    // Section of the statistics page where tutors read the reviews they received.
    TUTOR_REVIEWS_ANCHOR: 'resenas',
    TUTOR_STATISTICS_REVIEWS: '/tutor/statistics#resenas',
    TUTOR_PAGOS: '/tutor/pagos',

    // Tutor onboarding
    APPLY_TUTOR: '/home/apply-tutor',

    // Admin dashboard
    ADMIN: '/home/admin',
    ADMIN_METRICS: '/home/admin/dashboard',
    ADMIN_PAYOUTS: '/home/admin/payouts',
    ADMIN_FINANCE: '/home/admin/finanzas',
    ADMIN_AUDIT: '/home/admin/audit',
    ADMIN_GROWTH: '/home/admin/growth',
    ADMIN_USERS: '/home/admin/users',
    ADMIN_USER_DETAIL: (userId) => `/home/admin/users/${userId}`,
    // Events (public, admin, tutor)
    EVENTS: '/eventos',
    // The history tab of the same page (past events with their results).
    EVENTS_PAST: '/eventos?tab=pasados',
    // Same listing as EVENTS; the URL printed on posters (and their QR codes).
    REPASOS: '/repasos',
    EVENT_DETAIL: (slug, params = {}) => {
        const qs = new URLSearchParams();
        for (const key of ['inscribir', 'encuesta', 'ref', 'asistencia']) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== false) {
                qs.set(key, String(params[key]));
            }
        }
        const query = qs.toString();
        return `/eventos/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
    },
    ADMIN_EVENTS: '/home/admin/eventos',
    ADMIN_EVENT_NEW: '/home/admin/eventos/nuevo',
    ADMIN_EVENT_DETAIL: (id) => `/home/admin/eventos/${id}`,
    TUTOR_EVENTOS: '/tutor/eventos',

    ADMIN_TUTORS: '/home/admin/tutors',
    ADMIN_TUTOR_DETAIL: (userId) => `/home/admin/tutors/${userId}`,
    // Operations view of every session + payments that booked nothing.
    ADMIN_SESSIONS: '/home/admin/tutorias',
    // Sub-pestañas (?tab=) — ver docs/admin/ADMIN-REORG-FUNCTIONAL.md §3.
    ADMIN_SESSIONS_TAB: (tab) => `/home/admin/tutorias?tab=${tab}`,
    ADMIN_TUTORS_TAB: (tab) => `/home/admin/tutors?tab=${tab}`,
    ADMIN_COURSES_TAB: (tab) => `/home/admin/courses?tab=${tab}`,
    // Rutas viejas: redirigen (next.config.mjs) a su sub-pestaña.
    ADMIN_MANUAL_SESSIONS: '/home/admin/tutorias?tab=manual',
    ADMIN_COURSES: '/home/admin/courses',
    ADMIN_COURSE_NOTIFY: '/home/admin/tutors?tab=recruitment',
    ADMIN_NEWS: '/home/admin/news',
    ADMIN_COUPONS: '/home/admin/coupons',
    ADMIN_POSTS: '/home/admin/posts',
    ADMIN_POST_DETAIL: (slug) => `/home/admin/posts/${slug}`,
};

export default routes;
