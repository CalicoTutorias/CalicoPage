const routes = {
    LANDING:"/",
    HOME:"/home",
    EXPLORE:"/home/explore",
    SEARCH_TUTORS:"/home/buscar-tutores",
    FIND_TUTOR:"/home/find-tutor",
    LOGIN:"/auth/login",
    REGISTER:"/auth/register",
    PROFILE: "/home/profile",

    HISTORY: "/home/history",
    PRIVACY_POLICY: "/privacy-policy",
    
    // Disponibilidad individual y conjunta
    INDIVIDUAL_AVAILABILITY: "/availability/individual",
    JOINT_AVAILABILITY: "/availability/joint",
    
    // Rutas específicas para tutores
    TUTOR_INICIO: '/tutor/inicio',
    TUTOR_MIS_TUTORIAS: '/tutor/mis-tutorias',
    // kept for backwards compatibility: use TUTOR_COURSES
    TUTOR_MATERIAS: '/tutor/courses',
    TUTOR_COURSES: '/tutor/courses',
    TUTOR_DISPONIBILIDAD: '/tutor/disponibilidad',
    TUTOR_STATISTICS: '/tutor/statistics',
    TUTOR_PAGOS: '/tutor/pagos'
};

export default routes;