
// Este archivo ya no es necesario para la configuración de la API_URL en Next.js.
// La configuración se ha movido al archivo .env en la raíz del proyecto.
// Puedes eliminar este archivo si lo deseas, o mantenerlo si tiene otras configuraciones.

export const environment = {
    production: true,
    nombreAplicacion: "APP_COSTOS_NO_CALIDAD",

    aplicaciones: ["APP_COSTOS_NO_CALIDAD"],

    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

    ////////////////////////////////////////Api de Seguridades
    //apiURL : '/seguridades/api',
    //apiURL : 'http://localhost:5400',
    apiURL : 'https://apps.chaide.com/seguridadesGuard',
    

    ///////////////////////////////////////Api de reconocimiento Facial
    apiAuthFacial: 'https://apps.chaide.com/AServiceUth2',



    /////////////////////////////////////Api Propia de la Aplicación
    // Producción (next build): API publicada detrás de Traefik.
    // Desarrollo (next dev): proxy /api-costos de next.config.ts hacia el API local (mismo origen, sin CORS ni contenido mixto).
    // NEXT_PUBLIC_API_COSTOS_URL, si se define, tiene prioridad sobre ambos.
    apiCostosURL:
        process.env.NEXT_PUBLIC_API_COSTOS_URL ||
        (process.env.NODE_ENV === 'production'
            ? 'https://apps.chaide.com/costosNCBA'
            : `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api-costos`),


    tituloSistema: 'SISTEMA INTEGRADO DE PRODUCTIVIDAD OPERACIONAL (SIPO)',
};
