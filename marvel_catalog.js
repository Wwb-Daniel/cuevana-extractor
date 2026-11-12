// ============================================================
// CATÁLOGO MAESTRO MARVEL — marvel_catalog.js
// Universo Cinematográfico de Marvel (MCU), Sagas y Series
// Verificado contra endpoints activos de Cuevana3w.pro
// ============================================================

const MARVEL_CATALOG = [
    // ------------------------------------------------------------
    // MCU - FASE 1: Los Inicios (2008 - 2012)
    // ------------------------------------------------------------
    {
        slug: 'iron-man',
        canonicalTitle: 'Iron Man (El hombre de hierro)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/iron-man',
        year: 2008,
        rating: '7.9 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: false
    },
    {
        slug: 'el-increible-hulk',
        canonicalTitle: 'El increíble Hulk',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/el-increible-hulk',
        year: 2008,
        rating: '6.6 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: false
    },
    {
        slug: 'iron-man-2',
        canonicalTitle: 'Iron Man 2',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/iron-man-2',
        year: 2010,
        rating: '7.0 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: false
    },
    {
        slug: 'thor',
        canonicalTitle: 'Thor',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/thor',
        year: 2011,
        rating: '7.0 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: false
    },
    {
        slug: 'capitan-america-el-primer-vengador',
        canonicalTitle: 'Capitán América: El primer vengador',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/capitan-america-el-primer-vengador',
        year: 2011,
        rating: '6.9 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: false
    },
    {
        slug: 'the-avengers',
        canonicalTitle: 'The Avengers (Los Vengadores)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/los-vengadores',
        year: 2012,
        rating: '8.0 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '1',
        is_featured: true
    },

    // ------------------------------------------------------------
    // MCU - FASE 2: Expansión y Era de Ultrón (2013 - 2015)
    // ------------------------------------------------------------
    {
        slug: 'iron-man-3',
        canonicalTitle: 'Iron Man 3',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/iron-man-3',
        year: 2013,
        rating: '7.1 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: false
    },
    {
        slug: 'thor-un-mundo-oscuro',
        canonicalTitle: 'Thor: Un mundo oscuro',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/thor-2',
        year: 2013,
        rating: '6.8 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: false
    },
    {
        slug: 'capitan-america-el-soldado-del-invierno',
        canonicalTitle: 'Capitán América: El soldado del invierno',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/capitan-america-el-soldado-del-invierno',
        year: 2014,
        rating: '7.8 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: true
    },
    {
        slug: 'guardianes-de-la-galaxia',
        canonicalTitle: 'Guardianes de la Galaxia',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/guardianes-de-la-galaxia',
        year: 2014,
        rating: '8.0 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: true
    },
    {
        slug: 'vengadores-la-era-de-ultron',
        canonicalTitle: 'Vengadores: La era de Ultrón',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/los-vengadores-2',
        year: 2015,
        rating: '7.3 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: false
    },
    {
        slug: 'ant-man',
        canonicalTitle: 'Ant-Man: El hombre hormiga',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/ant-man-el-hombre-hormiga',
        year: 2015,
        rating: '7.3 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '2',
        is_featured: false
    },

    // ------------------------------------------------------------
    // MCU - FASE 3: Guerra Civil e Infinito (2016 - 2019)
    // ------------------------------------------------------------
    {
        slug: 'capitan-america-civil-war',
        canonicalTitle: 'Capitán América: Civil War',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/capitan-america-3',
        year: 2016,
        rating: '7.8 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'doctor-strange',
        canonicalTitle: 'Doctor Strange: Hechicero Supremo',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/doctor-extrano-el-hechicero-supremo',
        year: 2016,
        rating: '7.5 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: false
    },
    {
        slug: 'guardianes-de-la-galaxia-vol-2',
        canonicalTitle: 'Guardianes de la Galaxia Vol. 2',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/guardianes-de-la-galaxia-2',
        year: 2017,
        rating: '7.6 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: false
    },
    {
        slug: 'spider-man-de-regreso-a-casa',
        canonicalTitle: 'Spider-Man: De regreso a casa',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man-de-regreso-a-casa',
        year: 2017,
        rating: '7.4 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'thor-ragnarok',
        canonicalTitle: 'Thor: Ragnarok',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/thor-3-ragnarok',
        year: 2017,
        rating: '7.9 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'pantera-negra',
        canonicalTitle: 'Pantera Negra (Black Panther)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/pantera-negra',
        year: 2018,
        rating: '7.3 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'vengadores-infinity-war',
        canonicalTitle: 'Vengadores: Infinity War',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/vengadores-infinity-war',
        year: 2018,
        rating: '8.4 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'ant-man-y-la-avispa',
        canonicalTitle: 'Ant-Man y la Avispa',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/ant-man-y-la-avispa',
        year: 2018,
        rating: '7.0 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: false
    },
    {
        slug: 'capitana-marvel',
        canonicalTitle: 'Capitana Marvel',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/capitana-marvel',
        year: 2019,
        rating: '6.8 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: false
    },
    {
        slug: 'vengadores-endgame',
        canonicalTitle: 'Vengadores: Endgame',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/vengadores-endgame',
        year: 2019,
        rating: '8.4 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: true
    },
    {
        slug: 'spider-man-lejos-de-casa',
        canonicalTitle: 'Spider-Man: Lejos de casa',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man-lejos-de-casa',
        year: 2019,
        rating: '7.4 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '3',
        is_featured: false
    },

    // ------------------------------------------------------------
    // MCU - FASE 4: El Multiverso Comienza (2021 - 2022)
    // ------------------------------------------------------------
    {
        slug: 'viuda-negra',
        canonicalTitle: 'Viuda Negra (Black Widow)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/viuda-negra',
        year: 2021,
        rating: '6.7 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: false
    },
    {
        slug: 'shang-chi-y-la-leyenda-de-los-diez-anillos',
        canonicalTitle: 'Shang-Chi y la leyenda de los Diez Anillos',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/shang-chi-y-la-leyenda-de-los-diez-anillos',
        year: 2021,
        rating: '7.4 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: true
    },
    {
        slug: 'eternals',
        canonicalTitle: 'Eternals (Eternos)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/eternals',
        year: 2021,
        rating: '6.3 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: false
    },
    {
        slug: 'spider-man-no-way-home',
        canonicalTitle: 'Spider-Man: Sin camino a casa',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man-no-way-home',
        year: 2021,
        rating: '8.2 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: true
    },
    {
        slug: 'doctor-strange-en-el-multiverso-de-la-locura',
        canonicalTitle: 'Doctor Strange en el multiverso de la locura',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/doctor-strange-en-el-multiverso-de-la-locura',
        year: 2022,
        rating: '6.9 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: true
    },
    {
        slug: 'thor-amor-y-trueno',
        canonicalTitle: 'Thor: Amor y trueno',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/thor-love-and-thunder',
        year: 2022,
        rating: '6.2 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: false
    },
    {
        slug: 'pantera-negra-wakanda-forever',
        canonicalTitle: 'Pantera Negra: Wakanda por siempre',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/black-panther-wakanda-forever',
        year: 2022,
        rating: '6.7 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '4',
        is_featured: false
    },

    // ------------------------------------------------------------
    // MCU - FASE 5: Nuevas Guerras Multiversales (2023 - 2025)
    // ------------------------------------------------------------
    {
        slug: 'ant-man-y-la-avispa-quantumania',
        canonicalTitle: 'Ant-Man y la Avispa: Quantumanía',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/ant-man-y-la-avispa-quantumania',
        year: 2023,
        rating: '6.1 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '5',
        is_featured: false
    },
    {
        slug: 'guardianes-de-la-galaxia-vol-3',
        canonicalTitle: 'Guardianes de la Galaxia Vol. 3',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/guardianes-de-la-galaxia-volumen-3',
        year: 2023,
        rating: '7.9 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '5',
        is_featured: true
    },
    {
        slug: 'the-marvels',
        canonicalTitle: 'The Marvels',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/the-marvels',
        year: 2023,
        rating: '5.6 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '5',
        is_featured: false
    },
    {
        slug: 'deadpool-y-lobezno',
        canonicalTitle: 'Deadpool & Wolverine',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/deadpool-y-lobezno',
        year: 2024,
        rating: '7.8 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '5',
        is_featured: true
    },
    {
        slug: 'capitan-america-brave-new-world',
        canonicalTitle: 'Capitán América: Un nuevo mundo',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/capitan-america-brave-new-world',
        year: 2025,
        rating: '7.2 IMDb',
        type: 'movie',
        saga: 'mcu',
        phase: '5',
        is_featured: true
    },

    // ------------------------------------------------------------
    // SAGA SPIDER-MAN (Tobey Maguire, Andrew Garfield, Spider-Verse)
    // ------------------------------------------------------------
    {
        slug: 'spider-man-1',
        canonicalTitle: 'Spider-Man (El hombre araña)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man',
        year: 2002,
        rating: '7.4 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: false
    },
    {
        slug: 'spider-man-2',
        canonicalTitle: 'Spider-Man 2',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/el-hombre-arana-2',
        year: 2004,
        rating: '7.5 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: false
    },
    {
        slug: 'spider-man-3',
        canonicalTitle: 'Spider-Man 3',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/el-hombre-arana-3',
        year: 2007,
        rating: '6.3 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: false
    },
    {
        slug: 'el-sorprendente-hombre-arana',
        canonicalTitle: 'El sorprendente Hombre Araña',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/el-sorprendente-hombre-arana',
        year: 2012,
        rating: '6.9 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: false
    },
    {
        slug: 'el-sorprendente-hombre-arana-2',
        canonicalTitle: 'El sorprendente Hombre Araña 2: La amenaza de Electro',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/el-sorprendente-hombre-arana-2',
        year: 2014,
        rating: '6.6 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: false
    },
    {
        slug: 'spider-man-un-nuevo-universo',
        canonicalTitle: 'Spider-Man: Un nuevo universo',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man-un-nuevo-universo',
        year: 2018,
        rating: '8.4 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: true
    },
    {
        slug: 'spider-man-cruzando-el-multiverso',
        canonicalTitle: 'Spider-Man: A través del Spider-Verso',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/spider-man-cruzando-el-multiverso',
        year: 2023,
        rating: '8.7 IMDb',
        type: 'movie',
        saga: 'spiderman',
        is_featured: true
    },

    // ------------------------------------------------------------
    // SAGA DEADPOOL & VENOM
    // ------------------------------------------------------------
    {
        slug: 'deadpool',
        canonicalTitle: 'Deadpool',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/deadpool',
        year: 2016,
        rating: '8.0 IMDb',
        type: 'movie',
        saga: 'deadpool',
        is_featured: true
    },
    {
        slug: 'deadpool-2',
        canonicalTitle: 'Deadpool 2',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/deadpool-2',
        year: 2018,
        rating: '7.7 IMDb',
        type: 'movie',
        saga: 'deadpool',
        is_featured: false
    },
    {
        slug: 'venom-1',
        canonicalTitle: 'Venom',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/venom-1',
        year: 2018,
        rating: '6.6 IMDb',
        type: 'movie',
        saga: 'venom',
        is_featured: false
    },
    {
        slug: 'venom-habra-matanza',
        canonicalTitle: 'Venom: Carnage liberado',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/venom-habra-matanza',
        year: 2021,
        rating: '5.9 IMDb',
        type: 'movie',
        saga: 'venom',
        is_featured: false
    },
    {
        slug: 'venom-el-ultimo-baile',
        canonicalTitle: 'Venom: El último baile',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/venom-el-ultimo-baile',
        year: 2024,
        rating: '6.2 IMDb',
        type: 'movie',
        saga: 'venom',
        is_featured: true
    },

    // ------------------------------------------------------------
    // SAGA X-MEN & WOLVERINE (LOBEZNO)
    // ------------------------------------------------------------
    {
        slug: 'x-men',
        canonicalTitle: 'X-Men',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men',
        year: 2000,
        rating: '7.3 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'x-men-2',
        canonicalTitle: 'X-Men 2',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-2',
        year: 2003,
        rating: '7.4 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'x-men-3-la-decision-final',
        canonicalTitle: 'X-Men 3: La decisión final',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-3-la-decision-final',
        year: 2006,
        rating: '6.6 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'x-men-origenes-lobezno',
        canonicalTitle: 'X-Men Orígenes: Lobezno',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-origenes-lobezno',
        year: 2009,
        rating: '6.5 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'x-men-primera-generacion',
        canonicalTitle: 'X-Men: Primera generación',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-primera-generacion',
        year: 2011,
        rating: '7.7 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'wolverine-inmortal',
        canonicalTitle: 'Wolverine: Inmortal',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/wolverine-inmortal',
        year: 2013,
        rating: '6.7 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'x-men-dias-del-futuro-pasado',
        canonicalTitle: 'X-Men: Días del futuro pasado',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-dias-del-futuro-pasado',
        year: 2014,
        rating: '7.9 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: true
    },
    {
        slug: 'x-men-apocalipsis',
        canonicalTitle: 'X-Men: Apocalipsis',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-apocalipsis',
        year: 2016,
        rating: '6.9 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },
    {
        slug: 'logan',
        canonicalTitle: 'Logan',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/logan',
        year: 2017,
        rating: '8.1 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: true
    },
    {
        slug: 'x-men-fenix-oscura',
        canonicalTitle: 'X-Men: Fénix Oscura',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/x-men-fenix-oscura',
        year: 2019,
        rating: '5.7 IMDb',
        type: 'movie',
        saga: 'xmen',
        is_featured: false
    },

    // ------------------------------------------------------------
    // SERIES MARVEL (Disney+ / UCM / Netflix)
    // ------------------------------------------------------------
    {
        slug: 'loki',
        canonicalTitle: 'Loki',
        cuevanaUrl: 'https://cuevana3w.pro/serie/loki',
        year: 2021,
        rating: '8.2 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: true
    },
    {
        slug: 'wandavision',
        canonicalTitle: 'WandaVision (Bruja Escarlata y Visión)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/wandavision',
        year: 2021,
        rating: '7.9 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: true
    },
    {
        slug: 'the-falcon-and-the-winter-soldier',
        canonicalTitle: 'Falcon y el Soldado del Invierno',
        cuevanaUrl: 'https://cuevana3w.pro/serie/the-falcon-and-the-winter-soldier',
        year: 2021,
        rating: '7.1 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'moon-knight',
        canonicalTitle: 'Caballero Luna (Moon Knight)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/moon-knight',
        year: 2022,
        rating: '7.3 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: true
    },
    {
        slug: 'hawkeye',
        canonicalTitle: 'Ojo de Halcón (Hawkeye)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/hawkeye',
        year: 2021,
        rating: '7.5 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'what-if',
        canonicalTitle: '¿Qué pasaría si...? (What If...?)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/what-if',
        year: 2021,
        rating: '7.4 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'she-hulk-defensora-de-heroes',
        canonicalTitle: 'She-Hulk: Defensora de héroes',
        cuevanaUrl: 'https://cuevana3w.pro/serie/she-hulk-defensora-de-heroes',
        year: 2022,
        rating: '5.3 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'invasion-secreta',
        canonicalTitle: 'Invasión Secreta (Secret Invasion)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/invasion-secreta',
        year: 2023,
        rating: '6.0 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'echo',
        canonicalTitle: 'Echo',
        cuevanaUrl: 'https://cuevana3w.pro/serie/echo',
        year: 2024,
        rating: '6.1 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: false
    },
    {
        slug: 'agatha-quien-si-no',
        canonicalTitle: 'Agatha: ¿Quién si no? (Agatha All Along)',
        cuevanaUrl: 'https://cuevana3w.pro/serie/agatha-quien-si-no',
        year: 2024,
        rating: '7.2 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: true
    },
    {
        slug: 'marvel-daredevil',
        canonicalTitle: 'Marvel Daredevil',
        cuevanaUrl: 'https://cuevana3w.pro/serie/marvel-daredevil',
        year: 2015,
        rating: '8.6 IMDb',
        type: 'series',
        saga: 'mcu-series',
        is_featured: true
    },
    {
        slug: 'x-men-97',
        canonicalTitle: 'X-Men \'97',
        cuevanaUrl: 'https://cuevana3w.pro/serie/x-men-97',
        year: 2024,
        rating: '8.8 IMDb',
        type: 'series',
        saga: 'xmen',
        is_featured: true
    }
];

module.exports = {
    MARVEL_CATALOG
};
