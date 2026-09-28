export const ordenanzaData = {
  clasificaciones: ['Residencial', 'Comercial/Institucional', 'Industrial', 'Otros'],
  tiposResidenciales: [
    { label: 'Tipo I: Viviendas en zonas populares', factor: 0.50 },
    { label: 'Tipo II: Casas', factor: 0.80 },
    { label: 'Tipo III: Apartamentos', factor: 0.91 },
    { label: 'Tipo IV: Penthouse, Town House, Quintas, Villas', factor: 1.06 }
  ],
  zonasResidenciales: [
    { label: 'ZONA A', factor: 1.0 },
    { label: 'ZONA B', factor: 0.8 },
    { label: 'ZONA C', factor: 0.6 },
    { label: 'ZONA D', factor: 0.4 }
  ],
  nivelesMetraje: [
    'Generacion Baja',
    'Generacion Media',
    'Generacion Alta'
  ],
  actividadesComerciales: [
    {
        "label": "INMUEBLES DESOCUPADOS",
        "factores": [
            1.98,
            1.98,
            1.98
        ]
    },
    {
        "label": "ABASTOS",
        "factores": [
            2.39,
            5.8,
            9
        ]
    },
    {
        "label": "BODEGAS",
        "factores": [
            1.54,
            4.23,
            6.61
        ]
    },
    {
        "label": "MINIMARKET",
        "factores": [
            10.2,
            15.3,
            30.6
        ]
    },
    {
        "label": "FRUTERIAS",
        "factores": [
            2.83,
            7.32,
            11.31
        ]
    },
    {
        "label": "CARNICERIAS",
        "factores": [
            4.28,
            7.98,
            12.05
        ]
    },
    {
        "label": "CHARCUTERIAS",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "FRIGORIFICO",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "PESCADERIAS",
        "factores": [
            3.77,
            8.01,
            12.05
        ]
    },
    {
        "label": "PANADERIAS, PASTELERIAS, DULCERIAS",
        "factores": [
            7.54,
            11.9,
            16.03
        ]
    },
    {
        "label": "CONFITERIAS",
        "factores": [
            7.54,
            11.9,
            16.03
        ]
    },
    {
        "label": "REPOSTERIAS",
        "factores": [
            7.54,
            11.9,
            16.03
        ]
    },
    {
        "label": "AUTOMERCADOS",
        "factores": [
            28.28,
            48.95,
            70.69
        ]
    },
    {
        "label": "SUPERMERCADOS",
        "factores": [
            28.28,
            48.95,
            70.69
        ]
    },
    {
        "label": "PENSIONES/RESIDENCIAS ESTUDIANTILES",
        "factores": [
            7.54,
            15.08,
            22.62
        ]
    },
    {
        "label": "MERCADOS MAYORISTAS Y POPULARES",
        "factores": [
            50.12,
            66.7,
            84.41
        ]
    },
    {
        "label": "AREPERAS",
        "factores": [
            3.77,
            11.82,
            19.8
        ]
    },
    {
        "label": "CAFETERIAS",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "FUENTES DE SODA",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "HELADERIAS",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "LONCHERIAS",
        "factores": [
            3.77,
            9.29,
            16.03
        ]
    },
    {
        "label": "LICORERIAS",
        "factores": [
            3.95,
            11.43,
            19.76
        ]
    },
    {
        "label": "KIOSCOS",
        "factores": [
            1.45,
            4.72,
            8.09
        ]
    },
    {
        "label": "VENTA AMBULANTE DE ALIMENTOS Y BEBIDAS",
        "factores": [
            1.69,
            5.45,
            9.31
        ]
    },
    {
        "label": "ACADEMIAS VARIAS",
        "factores": [
            2.85,
            7.68,
            13.49
        ]
    },
    {
        "label": "GUARDERIAS INFANTILES",
        "factores": [
            2.85,
            7.68,
            13.49
        ]
    },
    {
        "label": "PREESCOLARES",
        "factores": [
            2.85,
            7.68,
            13.49
        ]
    },
    {
        "label": "COLEGIOS, ESCUELAS Y LICEOS",
        "factores": [
            11.5,
            26.13,
            40.57
        ]
    },
    {
        "label": "INSTITUTOS UNIVERSITARIOS",
        "factores": [
            11.5,
            26.13,
            40.57
        ]
    },
    {
        "label": "UNIVERSIDADES",
        "factores": [
            24.64,
            53.56,
            80.34
        ]
    },
    {
        "label": "AREAS TURISTICAS RECREACIONALES PUBLICAS",
        "factores": [
            2.02,
            4.02,
            4.32
        ]
    },
    {
        "label": "AREAS TURISTICAS Y RECREACIONALES",
        "factores": [
            64.27,
            83.77,
            96.41
        ]
    },
    {
        "label": "BIBLIOTECAS",
        "factores": [
            2.83,
            5.98,
            9
        ]
    },
    {
        "label": "IGLESIAS",
        "factores": [
            1.89,
            0,
            0
        ]
    },
    {
        "label": "CASA PARROQUIAL",
        "factores": [
            2.18,
            0,
            0
        ]
    },
    {
        "label": "TEATROS",
        "factores": [
            5.97,
            12.76,
            21.3
        ]
    },
    {
        "label": "CINES",
        "factores": [
            26.41,
            33.75,
            42.58
        ]
    },
    {
        "label": "ESTUDIOS DE GRABACION Y FOTOGRAFIA",
        "factores": [
            2.83,
            5.98,
            9
        ]
    },
    {
        "label": "EMISORAS DE RADIO",
        "factores": [
            2.83,
            5.98,
            9
        ]
    },
    {
        "label": "SALAS DE BILLAR Y JUEGOS",
        "factores": [
            3.74,
            11,
            18.04
        ]
    },
    {
        "label": "PARQUES DE ATRACCIONES Y RECREATIVOS PRIVADOS",
        "factores": [
            18.85,
            42.84,
            75.4
        ]
    },
    {
        "label": "SALAS ESPECTACULOS, EXPOSICIONES, REUNIONES, CONFERENCIAS",
        "factores": [
            3.77,
            7.8,
            12.05
        ]
    },
    {
        "label": "AGENCIAS DE FESTEJOS CON SALA",
        "factores": [
            9.43,
            22.49,
            37.7
        ]
    },
    {
        "label": "AGENCIAS DE FESTEJOS",
        "factores": [
            2.39,
            7.03,
            12.05
        ]
    },
    {
        "label": "ASOCIACIONES CULTURALES Y DEPORTIVOS",
        "factores": [
            1.29,
            4.68,
            8.05
        ]
    },
    {
        "label": "CLUB DEPORTIVO",
        "factores": [
            9.89,
            23.63,
            39.52
        ]
    },
    {
        "label": "CLUB SOCIAL",
        "factores": [
            56.55,
            72.84,
            84.83
        ]
    },
    {
        "label": "BARES",
        "factores": [
            3.77,
            8.3,
            12.05
        ]
    },
    {
        "label": "CERVECERIAS",
        "factores": [
            3.77,
            8.3,
            12.05
        ]
    },
    {
        "label": "POLLERAS",
        "factores": [
            7.91,
            20.47,
            33.18
        ]
    },
    {
        "label": "RESTAURANTES",
        "factores": [
            13.53,
            32.73,
            54.08
        ]
    },
    {
        "label": "COMEDORES",
        "factores": [
            3.42,
            6.87,
            11.25
        ]
    },
    {
        "label": "VENTA DE COMIDA RAPIDA Y PIZZERIA",
        "factores": [
            17.03,
            52.69,
            89.42
        ]
    },
    {
        "label": "BOÎTES",
        "factores": [
            9.89,
            20.11,
            31.61
        ]
    },
    {
        "label": "DISCOTECAS",
        "factores": [
            9.89,
            20.11,
            31.61
        ]
    },
    {
        "label": "NIGHT CLUBS",
        "factores": [
            9.89,
            20.11,
            31.61
        ]
    },
    {
        "label": "POSADAS",
        "factores": [
            29.65,
            43.39,
            59.28
        ]
    },
    {
        "label": "HOTELES DE 3, 4, 5 ESTRELLAS",
        "factores": [
            29.65,
            54.83,
            82.99
        ]
    },
    {
        "label": "HOTELES CON MENOS DE 3 ESTRELLAS",
        "factores": [
            29.65,
            43.39,
            59.28
        ]
    },
    {
        "label": "MOTELES",
        "factores": [
            29.65,
            43.39,
            59.28
        ]
    },
    {
        "label": "BANCOS Y ENTIDADES BANCARIAS",
        "factores": [
            20.67,
            30.58,
            41.34
        ]
    },
    {
        "label": "COMPANIAS DE SEGUROS",
        "factores": [
            19.76,
            29.22,
            39.52
        ]
    },
    {
        "label": "ADMINISTRADORAS",
        "factores": [
            3.07,
            6.91,
            10.12
        ]
    },
    {
        "label": "AGENCIAS DE LOTERIAS",
        "factores": [
            3.07,
            6.91,
            10.12
        ]
    },
    {
        "label": "AGENCIAS ADUANALES",
        "factores": [
            3.07,
            6.91,
            10.22
        ]
    },
    {
        "label": "AGENCIAS DE NOTICIAS",
        "factores": [
            3.07,
            6.91,
            10.12
        ]
    },
    {
        "label": "AGENCIAS DE VIAJES Y TURISMO",
        "factores": [
            3.07,
            6.91,
            10.12
        ]
    },
    {
        "label": "AGENCIAS DE PUBLICIDAD",
        "factores": [
            3.07,
            6.91,
            10.12
        ]
    },
    {
        "label": "GESTORIAS",
        "factores": [
            2.57,
            6.05,
            10.12
        ]
    },
    {
        "label": "OFICINAS DE CONDOMINIO",
        "factores": [
            2.57,
            6.4,
            10.05
        ]
    },
    {
        "label": "OFICINAS",
        "factores": [
            2.57,
            6.21,
            9.65
        ]
    },
    {
        "label": "OFICINAS Y DEPARTAMENTOS MUNICIPALES",
        "factores": [
            2.38,
            4.48,
            8.29
        ]
    },
    {
        "label": "OFICINAS DE SERVICIO DE TELEVISION",
        "factores": [
            2.57,
            6.4,
            10.05
        ]
    },
    {
        "label": "CENTROS DE COMUNICACION TELEFONICA",
        "factores": [
            5.17,
            8.81,
            14.85
        ]
    },
    {
        "label": "CENTROS DE INTERNET",
        "factores": [
            5.17,
            8.81,
            14.85
        ]
    },
    {
        "label": "CLINICAS CON HOSPITALIZACION",
        "factores": [
            57.56,
            72.02,
            93.78
        ]
    },
    {
        "label": "HOSPITALES",
        "factores": [
            57.56,
            72.02,
            93.78
        ]
    },
    {
        "label": "CLINICAS SIN HOSPITALIZACION",
        "factores": [
            46.67,
            59.35,
            79.17
        ]
    },
    {
        "label": "CONSULTORIOS MEDICOS Y ODONTOLOGICOS",
        "factores": [
            2.98,
            6.46,
            9.89
        ]
    },
    {
        "label": "CONSULTORIOS VETERINARIOS",
        "factores": [
            2.98,
            6.35,
            9.89
        ]
    },
    {
        "label": "LABORATORIOS CLINICOS Y DENTALES",
        "factores": [
            2.98,
            6.35,
            9.89
        ]
    },
    {
        "label": "CENTROS DE ESTETICA",
        "factores": [
            5.58,
            9.06,
            15.09
        ]
    },
    {
        "label": "SERVICIO DE AMBULANCIA",
        "factores": [
            3.95,
            8.23,
            12.64
        ]
    },
    {
        "label": "DROGUERIAS",
        "factores": [
            3.95,
            7.8,
            12.64
        ]
    },
    {
        "label": "FARMACIAS",
        "factores": [
            3.95,
            7.8,
            12.64
        ]
    },
    {
        "label": "TIENDA NATURISTA",
        "factores": [
            3.95,
            7.8,
            12.64
        ]
    },
    {
        "label": "FUNERARIAS",
        "factores": [
            3.95,
            8.23,
            12.64
        ]
    },
    {
        "label": "CEMENTERIOS PUBLICOS",
        "factores": [
            12.98,
            27.38,
            41.43
        ]
    },
    {
        "label": "CEMENTERIOS PRIVADOS",
        "factores": [
            22.98,
            37.41,
            51.45
        ]
    },
    {
        "label": "VENTA DE ARTICULOS ORTOPEDICOS",
        "factores": [
            3.95,
            6.85,
            9.89
        ]
    },
    {
        "label": "VENTA DE EQUIPOS Y ARTICULOS MEDICOS",
        "factores": [
            3.95,
            6.85,
            9.89
        ]
    },
    {
        "label": "AMBULATORIOS SEGURO SOCIAL",
        "factores": [
            3.95,
            6.71,
            9.89
        ]
    },
    {
        "label": "ASILOS MEDICO ASISTENCIALES",
        "factores": [
            3.95,
            6.71,
            9.89
        ]
    },
    {
        "label": "ASOCIACIONES BENEFICAS",
        "factores": [
            3.95,
            6.71,
            9.89
        ]
    },
    {
        "label": "CASAS Y CENTROS DE REHABILITACION",
        "factores": [
            3.95,
            6.71,
            9.89
        ]
    },
    {
        "label": "ALMACENES Y DEPARTAMENTOS MERCANCIA SECA",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "BARBERIAS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "PELUQUERIAS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "FERRETERIAS Y SIMILARES",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "PERFUMERIAS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "LAVANDERIAS Y TINTORERIAS",
        "factores": [
            2.75,
            6.41,
            10.89
        ]
    },
    {
        "label": "TIENDA PARA ALQUIER DE PRENDAS",
        "factores": [
            2.75,
            6.07,
            9.45
        ]
    },
    {
        "label": "CERRAJERIAS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "MERCERIAS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "BAZARES",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "SERVICIOS TECNICOS",
        "factores": [
            2.51,
            6.07,
            9.45
        ]
    },
    {
        "label": "TIENDA DE ROPA Y ACCESORIOS",
        "factores": [
            2.51,
            6.07,
            9.45
        ]
    },
    {
        "label": "ZAPATERIAS",
        "factores": [
            2.51,
            7.32,
            11.85
        ]
    },
    {
        "label": "DEPARTAMENTOS",
        "factores": [
            17.94,
            46.12,
            80.74
        ]
    },
    {
        "label": "TIENDA DE LENCERIA",
        "factores": [
            2.51,
            6.07,
            9.45
        ]
    },
    {
        "label": "TIENDA DE TELAS",
        "factores": [
            2.51,
            7.32,
            11.85
        ]
    },
    {
        "label": "TAPICERIA",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "TIENDA DE ARTICULOS DE CUERO",
        "factores": [
            2.51,
            6.07,
            9.45
        ]
    },
    {
        "label": "ACCESORIOS MUSICALES",
        "factores": [
            2.51,
            6.07,
            9.45
        ]
    },
    {
        "label": "SIMILARES",
        "factores": [
            2.53,
            4.77,
            8.15
        ]
    },
    {
        "label": "TIENDA DE ARTICULOS DE CERAMICA",
        "factores": [
            2.53,
            4.77,
            8.15
        ]
    },
    {
        "label": "TIENDA DE ARTESANIA TIPICA Y FOLKLORICA",
        "factores": [
            2.53,
            4.77,
            8.15
        ]
    },
    {
        "label": "TIENDA DE ARTICULOS RELIGIOSOS",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "PELUQUERIA",
        "factores": [
            2.53,
            6.07,
            9.45
        ]
    },
    {
        "label": "REPARACION DE CALZADOS",
        "factores": [
            2.51,
            4.77,
            8.15
        ]
    },
    {
        "label": "REPARACION DE ARTICULOS DE CUERO",
        "factores": [
            2.51,
            4.77,
            8.15
        ]
    },
    {
        "label": "REPARACION DE JOYAS Y RELOJES",
        "factores": [
            2.51,
            4.77,
            8.15
        ]
    },
    {
        "label": "CRISTALERIAS",
        "factores": [
            2.39,
            5.8,
            9
        ]
    },
    {
        "label": "MARQUETERIAS",
        "factores": [
            2.39,
            5.8,
            9
        ]
    },
    {
        "label": "VENTA DE ESPEJOS",
        "factores": [
            2.39,
            5.8,
            9
        ]
    },
    {
        "label": "LITOGRAFIA",
        "factores": [
            2.57,
            6.21,
            9.65
        ]
    },
    {
        "label": "TIPOGRAFIA Y TARJETERIA",
        "factores": [
            1.89,
            5.62,
            9
        ]
    },
    {
        "label": "AUTOTAPICERIAS",
        "factores": [
            2.53,
            7.73,
            12.86
        ]
    },
    {
        "label": "ALQUILER DE VEHICULOS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "CHIVERAS",
        "factores": [
            2.98,
            7.54,
            11.85
        ]
    },
    {
        "label": "REENCAUCHADORAS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "SERVICIOS DE CAMBIO DE ACEITE, FILTROS Y SIMILARES",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "VENTA DE MAQUINARIA",
        "factores": [
            3.95,
            8.69,
            13.83
        ]
    },
    {
        "label": "ALQUILER DE MAQUINARIA",
        "factores": [
            3.95,
            8.69,
            13.83
        ]
    },
    {
        "label": "VENTA DE REPUESTOS Y ACCESORIOS DE VEHICULOS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "VENTA DE VEHICULOS",
        "factores": [
            13.05,
            17.79,
            24.23
        ]
    },
    {
        "label": "VENTA DE MOTOCICLETAS",
        "factores": [
            3.95,
            8.69,
            13.83
        ]
    },
    {
        "label": "VENTA DE BICICLETAS",
        "factores": [
            2.65,
            6.09,
            12.53
        ]
    },
    {
        "label": "VENTA DE RESPUESTOS Y ACCESORIOS DE MOTOSCICLETAS Y BICICLETAS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "VENTA DE LANCHAS",
        "factores": [
            13.05,
            17.79,
            24.23
        ]
    },
    {
        "label": "VENTA DE REPUESTOS Y ACCESORIOS PARA LANCHAS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "ELECTROAUTOS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "AUTOLAVADOS",
        "factores": [
            7.02,
            17.37,
            28.22
        ]
    },
    {
        "label": "ESTACIONES DE SERVICIO",
        "factores": [
            9.43,
            20.67,
            32.99
        ]
    },
    {
        "label": "GIMNASIOS",
        "factores": [
            3.99,
            9.62,
            15.05
        ]
    },
    {
        "label": "HERRERIAS",
        "factores": [
            1.98,
            7.14,
            11.85
        ]
    },
    {
        "label": "TALLER MECANICO, LATONERIA, PINTURA Y CAUCHOS",
        "factores": [
            7.28,
            13.75,
            19.99
        ]
    },
    {
        "label": "TALLER METALURGICO",
        "factores": [
            7.28,
            13.75,
            19.99
        ]
    },
    {
        "label": "TALLER MECANICO",
        "factores": [
            7.28,
            13.75,
            19.99
        ]
    },
    {
        "label": "TALLER REPARACION DE ELECTRODOMESTICOS Y SIMILARES",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "SERVICIO E INSTALACION DE EQUIPOS DE TRANSMISION",
        "factores": [
            7.28,
            13.75,
            19.99
        ]
    },
    {
        "label": "TALLER DE REPARACION DE AIRES ACONDICIONADOS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "FLORISTERIAS",
        "factores": [
            3.38,
            9,
            14.63
        ]
    },
    {
        "label": "VIVEROS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "BOUTIQUE",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "GALERIAS DE ARTE",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "JOYERIAS",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "JUGUETERIAS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "PINATERIAS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "OPTICAS",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "SASTRERIA Y TALLERES DE COSTURA",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "VENTA DE ANIMALES Y ARTICULOS PARA ANIMALES",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "VENTA DE ARTICULOS DEPORTIVOS Y HOBBIES",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "VENTA DE ARTICULOS PARA EL HOGAR",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "VENTA DE EQUIPOS Y ARTICULOS ELECTRICOS",
        "factores": [
            2.85,
            6.98,
            11.25
        ]
    },
    {
        "label": "VENTA DE LAMPARAS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "VENTA DE EQUIPOS Y ARTICULOS TELEFONICOS",
        "factores": [
            3.95,
            6.85,
            9.89
        ]
    },
    {
        "label": "VENTA DE EQUIPOS Y ARTICULOS DE COMPUTACION",
        "factores": [
            3.95,
            6.85,
            9.89
        ]
    },
    {
        "label": "VENTA DE ARTICULOS, EQUIPOS Y MATERIALES DE OFICINA",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "VENTA DE PERIODICOS Y REVISTAS",
        "factores": [
            2.53,
            6.12,
            9.45
        ]
    },
    {
        "label": "VENTA DE PRODUCTOS QUIMICOS",
        "factores": [
            3.95,
            7.8,
            12.64
        ]
    },
    {
        "label": "COPISTERIA",
        "factores": [
            2.85,
            6.89,
            10.73
        ]
    },
    {
        "label": "DISTRIBUIDORA DE GAS Y OTROS COMBUSTIBLES",
        "factores": [
            2.98,
            7.54,
            11.85
        ]
    },
    {
        "label": "DISTRIBUIDORA DE FERTILIZANTES, ABONOS Y OTROS PRODUCTOS SIMILARESPARA LA AGRICULTURA",
        "factores": [
            3.95,
            7.8,
            12.64
        ]
    },
    {
        "label": "LIBRERIAS Y PAPELERIAS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "ESTACIONAMIENTOS",
        "factores": [
            2.83,
            7.18,
            11.31
        ]
    },
    {
        "label": "SERVICIO DE EMBALAJE Y MUDANZA",
        "factores": [
            3.38,
            9.26,
            13.49
        ]
    },
    {
        "label": "DISTRIBUIDORA DE ALIMENTOS Y BEBIDAS",
        "factores": [
            3.38,
            9.26,
            13.49
        ]
    },
    {
        "label": "LINEAS DE AUTOBUSES Y TAXIS",
        "factores": [
            2.53,
            8.07,
            11.85
        ]
    },
    {
        "label": "MAYORISTAS DE MERCANCIAS",
        "factores": [
            3.38,
            8.91,
            13.49
        ]
    },
    {
        "label": "SERVICIO DE LIMPIEZA Y MANTENIMIENTO",
        "factores": [
            2.98,
            7.9,
            11.85
        ]
    },
    {
        "label": "SERVICIO DE CORRESPONDENCIA",
        "factores": [
            4.73,
            8.42,
            12.64
        ]
    },
    {
        "label": "SERVICIO DE VIGILANCIA",
        "factores": [
            2.57,
            6.21,
            9.65
        ]
    },
    {
        "label": "SERVICIOS DE FUMIGACION",
        "factores": [
            2.98,
            6.31,
            9.45
        ]
    },
    {
        "label": "ALMACENES DE ADUANAS",
        "factores": [
            5.63,
            13.95,
            22.49
        ]
    },
    {
        "label": "DE ALOJAMIENTO DE DEPORTISTAS",
        "factores": [
            15.35,
            30.39,
            46.28
        ]
    },
    {
        "label": "BATALLONES DE GUARNICION MILITAR",
        "factores": [
            15.35,
            30.39,
            46.28
        ]
    },
    {
        "label": "GUARDIA NACIONAL",
        "factores": [
            15.35,
            30.39,
            46.28
        ]
    },
    {
        "label": "VENTA Y REPARACION DE CELULARES",
        "factores": [
            5.45,
            9.69,
            15.43
        ]
    },
    {
        "label": "EMBOTELLADORAS/RECARGA DE AGUA POTABLE",
        "factores": [
            4.85,
            9.69,
            14.33
        ]
    },
    {
        "label": "DEPOSITOS O GALPONES",
        "factores": [
            3.38,
            13.04,
            22.49
        ]
    },
    {
        "label": "ANGARES",
        "factores": [
            3.38,
            13.04,
            22.49
        ]
    },
    {
        "label": "SUMINISTRO DE MATERIALES PARA INDUSTRIA Y CONSTRUCCION",
        "factores": [
            3.38,
            13.04,
            22.49
        ]
    },
    {
        "label": "FABRICA DE HIELO",
        "factores": [
            2.83,
            12.76,
            23.57
        ]
    },
    {
        "label": "TALLER DE CONFECCION",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "FABRICA DE PINATAS",
        "factores": [
            3.38,
            8.55,
            13.49
        ]
    },
    {
        "label": "TAPICES Y SIMILARES",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE LAMPARAS",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE TEXTILES",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE CALZADOS",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE DETERGENTES",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE ARTICULOS DE CERAMICA",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "FABRICA DE ARTESANIA",
        "factores": [
            5.46,
            12.45,
            19.99
        ]
    },
    {
        "label": "CARPINTERIAS",
        "factores": [
            2.98,
            8.34,
            12.86
        ]
    },
    {
        "label": "FABRICA DE MUEBLES",
        "factores": [
            10.66,
            17.65,
            25.19
        ]
    },
    {
        "label": "MUEBLERIA (EXHIBICION Y VENTA)",
        "factores": [
            3.38,
            7.12,
            10.73
        ]
    },
    {
        "label": "QUINCALLAS Y BAZARES",
        "factores": [2.53, 6.07, 9.45]
    },
    {
        "label": "TIENDAS POR DEPARTAMENTOS",
        "factores": [17.94, 46.12, 80.74]
    },
    {
        "label": "VENTA DE REPUESTOS Y ACCESORIOS VEHICULOS",
        "factores": [2.53, 6.12, 9.45]
    },
    {
        "label": "VENTA AMB. ALIMENTOS Y BEBIDAS",
        "factores": [1.69, 5.45, 9.31]
    },
    {
        "label": "INMUEBLES Y LOCALES DESOCUPADOS",
        "factores": [1.98, 1.98, 1.98]
    },
    {
        "label": "TERRENOS, CONSTRUCCIONES E INMUEBLES A ESTRENAR",
        "factores": [0, 0, 0]
    },
    {
        "label": "ESTACIONAMIENTOS",
        "factores": [2.83, 7.18, 11.31]
    },
    {
        "label": "PUESTO DE ESTACIONAMIENTO",
        "factores": [2.83, 7.18, 11.31]
    },
    {
        "label": "DULCERIAS/REPOSTERIAS",
        "factores": [7.54, 11.9, 16.03]
    },
    {
        "label": "SERVICIOS TECNICOS",
        "factores": [2.53, 6.12, 9.45]
    }
],
actividadesIndustriales: [] as any[],
  serviciosEspeciales: [] as any[],
  inspeccionesTecnicas: [] as any[],
  vistoBueno: [] as any[],
  serviciosExtraordinarios: [] as any[]
};
