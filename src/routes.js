const routes = {
    LANDING:"/",
    HOME:"/home",
    EXPLORE:"/home/explore",
    SEARCH_TUTORS:"/home/buscar-tutores",
    FIND_TUTOR:"/home/find-tutor",
    LOGIN:"/auth/login",
    REGISTER:"/auth/register",
    VERIFY_EMAIL: "/auth/verify-email",
    EMAIL_VERIFIED: "/auth/email-verified",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
    PROFILE: "/home/profile",

    HISTORY: "/home/history",
    PRIVACY_POLICY: "/privacy-policy",
    TERMS_AND_CONDITIONS: "/terms-and-conditions",
    
    // Disponibilidad individual y conjunta
    INDIVIDUAL_AVAILABILITY: "/availability/individual",
    JOINT_AVAILABILITY: "/availability/joint",
    
    // Rutas específicas para tutores
    TUTOR_INICIO: '/tutor/inicio',
    TUTOR_MIS_TUTORIAS: '/tutor/mis-tutorias',
    // Page lives at app/tutor/materias → URL /tutor/materias
    TUTOR_MATERIAS: '/tutor/materias',
    TUTOR_COURSES: '/tutor/materias',
    TUTOR_DISPONIBILIDAD: '/tutor/disponibilidad',
    TUTOR_STATISTICS: '/tutor/statistics',
    TUTOR_PAGOS: '/tutor/pagos',

    // Tutor onboarding
    APPLY_TUTOR: '/home/apply-tutor',
};

export default routes;