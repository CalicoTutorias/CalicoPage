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
    EMAIL_VERIFIED: "/auth/email-verified",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
    PROFILE: "/home/profile",
    // Lightweight one-screen flow to fill the fields Google sign-up skips
    // (phone + career). Reachable via the soft banner and the post-login
    // redirect for users whose profile is incomplete.
    COMPLETE_PROFILE: "/home/completar-perfil",

    HISTORY: "/home/history",
    PRIVACY_POLICY: "/privacy-policy",
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
    TUTOR_PAGOS: '/tutor/pagos',

    // Tutor onboarding
    APPLY_TUTOR: '/home/apply-tutor',

    // Admin dashboard
    ADMIN: '/home/admin',
    ADMIN_GROWTH: '/home/admin/growth',
    ADMIN_USERS: '/home/admin/users',
    ADMIN_USER_DETAIL: (userId) => `/home/admin/users/${userId}`,
    ADMIN_TUTORS: '/home/admin/tutors',
    ADMIN_TUTOR_DETAIL: (userId) => `/home/admin/tutors/${userId}`,
    ADMIN_MANUAL_SESSIONS: '/home/admin/manual-sessions',
    ADMIN_COURSES: '/home/admin/courses',
    ADMIN_COURSE_NOTIFY: '/home/admin/course-notify',
    ADMIN_NEWS: '/home/admin/news',
};

export default routes;
