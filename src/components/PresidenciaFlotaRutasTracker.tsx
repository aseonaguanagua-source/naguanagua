'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Navigation,
  MapPin,
  Wrench,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Search,
  Gauge,
  Fuel,
  Activity,
  Calendar,
  Layers,
  Recycle,
  Radio,
  ChevronRight,
  Settings,
  Maximize2,
  Minimize2,
  Eye,
  X,
  Compass,
} from 'lucide-react';
import { RUTAS_NAGUANAGUA } from '@/data/rutasNaguanagua';

export type EstadoCamion =
  | 'EN_RUTA'
  | 'EN_VERTEDERO'
  | 'MANTENIMIENTO'
  | 'REPARACION';

export interface PuntoMapa {
  x: number; // 0 - 100 (% ancho del mapa táctico)
  y: number; // 0 - 100 (% alto del mapa táctico)
  sector: string;
  lat: number;
  lng: number;
}

export interface CamionFlota {
  id: string;
  placa: string;
  modelo: string;
  tipo: 'Compactador 25 yd³' | 'Compactador 20 yd³' | 'Compactador 18 yd³' | 'Roll-Off / Volteo';
  capacidadTon: number;
  cargaActualTon: number;
  porcentajeCarga: number;
  combustiblePct: number;
  velocidadKmh: number;
  estado: EstadoCamion;
  operativo: boolean;
  rutaId: string;
  rutaNombre: string;
  frecuenciaRuta: string;
  chofer: string;
  cedulaChofer: string;
  telefonoChofer: string;
  ayudantes: number;
  presionHidraulicaPsi: number;
  tempMotorC: number;
  viajesHoy: number;
  toneladasHoy: number;
  horaIngresoEstado?: string;
  tiempoEnEstado?: string;
  tiempoEstimadoSalida?: string;
  motivoTaller?: string;
  detalleTecnico?: string;
  mecanicoResponsable?: string;
  progresoTallerPct?: number;
  waypoints: PuntoMapa[];
  progresoInicial: number;
}

const FLOTA_INICIAL: CamionFlota[] = [
  {
    id: 'IAMEC-01',
    placa: 'A81AC1D',
    modelo: 'Mack Granite Heil 25 yd³',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 9.8,
    porcentajeCarga: 70,
    combustiblePct: 82,
    velocidadKmh: 32,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'DIARIA-DIU',
    rutaNombre: 'Ruta Diaria Comercial & Avenidas',
    frecuenciaRuta: 'Diario (Diurno)',
    chofer: 'Carlos Eduardo Mendoza',
    cedulaChofer: 'V-14.892.110',
    telefonoChofer: '0414-4218890',
    ayudantes: 3,
    presionHidraulicaPsi: 2150,
    tempMotorC: 86,
    viajesHoy: 2,
    toneladasHoy: 23.4,
    waypoints: [
      { x: 68, y: 56, sector: 'Mañongo Calle 102 (Sambil / Hoteles)', lat: 10.2465, lng: -68.0012 },
      { x: 56, y: 53, sector: 'Av. Salvador Feo La Cruz', lat: 10.2512, lng: -68.0068 },
      { x: 46, y: 46, sector: 'Av. Universidad (Crucero de Naguanagua)', lat: 10.2584, lng: -68.0105 },
      { x: 44, y: 60, sector: 'Av. Bolívar de Naguanagua', lat: 10.2491, lng: -68.0114 },
      { x: 54, y: 67, sector: 'Av. 190 (Corta y Larga)', lat: 10.2418, lng: -68.0085 },
      { x: 64, y: 63, sector: 'Av. Valencia / Retorno Mañongo', lat: 10.2442, lng: -68.0035 },
    ],
    progresoInicial: 0.1,
  },
  {
    id: 'IAMEC-02',
    placa: 'A44BC9K',
    modelo: 'Freightliner M2 106 McNeilus',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 8.2,
    porcentajeCarga: 75,
    combustiblePct: 68,
    velocidadKmh: 26,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'VIII-MARJUE',
    rutaNombre: 'Ruta VIII · Eje La Granja',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'José Gregorio Bolívar',
    cedulaChofer: 'V-12.504.331',
    telefonoChofer: '0412-8801422',
    ayudantes: 3,
    presionHidraulicaPsi: 2080,
    tempMotorC: 88,
    viajesHoy: 2,
    toneladasHoy: 19.6,
    waypoints: [
      { x: 42, y: 59, sector: 'C.C. Free Market / C.C. Cristal', lat: 10.2478, lng: -68.0142 },
      { x: 34, y: 65, sector: 'C.C. La Granja · Zona Comercial', lat: 10.2452, lng: -68.0169 },
      { x: 28, y: 58, sector: 'Urb. La Granja · Res. Villa Olímpica', lat: 10.2495, lng: -68.0191 },
      { x: 35, y: 52, sector: 'Polideportivo Imdenaguanagua', lat: 10.2528, lng: -68.0158 },
    ],
    progresoInicial: 0.35,
  },
  {
    id: 'IAMEC-03',
    placa: 'A19DF4M',
    modelo: 'International WorkStar 7400',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 6.4,
    porcentajeCarga: 46,
    combustiblePct: 91,
    velocidadKmh: 29,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'II-LUNMIÉ',
    rutaNombre: 'Ruta II · Vivienda Rural de Bárbula',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Wilmer Antonio Sequera',
    cedulaChofer: 'V-15.772.904',
    telefonoChofer: '0424-4093310',
    ayudantes: 3,
    presionHidraulicaPsi: 2190,
    tempMotorC: 84,
    viajesHoy: 1,
    toneladasHoy: 13.8,
    waypoints: [
      { x: 56, y: 24, sector: 'Vivienda Rural de Bárbula · 1era Av.', lat: 10.2785, lng: -68.0042 },
      { x: 66, y: 20, sector: 'Vivienda Rural de Bárbula · 2da Av. (Próceres)', lat: 10.2812, lng: -68.0018 },
      { x: 72, y: 28, sector: 'Vivienda Rural de Bárbula · 4ta y 5ta Av.', lat: 10.2764, lng: -67.9995 },
      { x: 60, y: 33, sector: 'Transversal Bárbula / Hospital González Plaza', lat: 10.2738, lng: -68.0031 },
    ],
    progresoInicial: 0.6,
  },
  {
    id: 'IAMEC-04',
    placa: 'A72GH8P',
    modelo: 'Iveco Eurocargo Tector 170E22',
    tipo: 'Compactador 18 yd³',
    capacidadTon: 9.5,
    cargaActualTon: 5.1,
    porcentajeCarga: 54,
    combustiblePct: 74,
    velocidadKmh: 27,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'IX-MARJUE',
    rutaNombre: 'Ruta IX · Las Quintas & UNEFA',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Ramón Alberto Castellanos',
    cedulaChofer: 'V-13.219.887',
    telefonoChofer: '0414-4901123',
    ayudantes: 2,
    presionHidraulicaPsi: 1980,
    tempMotorC: 85,
    viajesHoy: 2,
    toneladasHoy: 16.2,
    waypoints: [
      { x: 39, y: 49, sector: 'Urb. Las Quintas I · Av. Principal', lat: 10.2591, lng: -68.0155 },
      { x: 31, y: 45, sector: 'Urb. Las Quintas II y Quintas Norte', lat: 10.2618, lng: -68.0184 },
      { x: 35, y: 39, sector: 'UNEFA Núcleo Naguanagua / Los Claveles', lat: 10.2649, lng: -68.0162 },
      { x: 43, y: 43, sector: 'Urb. Cantapiedra y La Paz', lat: 10.2621, lng: -68.0131 },
    ],
    progresoInicial: 0.25,
  },
  {
    id: 'IAMEC-05',
    placa: 'A90JK2R',
    modelo: 'Mack Granite Heil 25 yd³',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 11.9,
    porcentajeCarga: 85,
    combustiblePct: 60,
    velocidadKmh: 34,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'VIII-LUNMIÉ',
    rutaNombre: 'Ruta VIII · Mañongo, Palma Real & Tazajal',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Oswaldo Enrique Rivas',
    cedulaChofer: 'V-16.401.229',
    telefonoChofer: '0412-4419087',
    ayudantes: 3,
    presionHidraulicaPsi: 2210,
    tempMotorC: 89,
    viajesHoy: 2,
    toneladasHoy: 25.1,
    waypoints: [
      { x: 75, y: 50, sector: 'Urb. Palma Real y El Rincón (Mañongo)', lat: 10.2524, lng: -67.9978 },
      { x: 71, y: 62, sector: 'Jardín Mañongo / C.C. Il Pórtico', lat: 10.2448, lng: -67.9992 },
      { x: 66, y: 74, sector: 'Tazajal · Res. Monte Alegre y Los Azulejos', lat: 10.2365, lng: -68.0019 },
      { x: 59, y: 64, sector: 'Autopista del Este · Retorno Mañongo', lat: 10.2421, lng: -68.0045 },
    ],
    progresoInicial: 0.5,
  },
  {
    id: 'IAMEC-06',
    placa: 'A33LM5T',
    modelo: 'Freightliner M2 106 McNeilus',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 4.3,
    porcentajeCarga: 39,
    combustiblePct: 87,
    velocidadKmh: 28,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'X-MARJUE',
    rutaNombre: 'Ruta X · El Cafetal, Campiña II & Rotafe',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Héctor Luis Pinto',
    cedulaChofer: 'V-17.890.512',
    telefonoChofer: '0424-4651109',
    ayudantes: 3,
    presionHidraulicaPsi: 2050,
    tempMotorC: 83,
    viajesHoy: 1,
    toneladasHoy: 10.8,
    waypoints: [
      { x: 49, y: 50, sector: 'Urb. El Cafetal · Av. Principal', lat: 10.2552, lng: -68.0098 },
      { x: 43, y: 55, sector: 'La Campiña II y Edificios Campiña', lat: 10.2529, lng: -68.0122 },
      { x: 52, y: 59, sector: 'Los Candiles y Urb. Rotafe', lat: 10.2508, lng: -68.0089 },
      { x: 55, y: 51, sector: 'Av. Salvador Feo La Cruz · Tramo Este', lat: 10.2541, lng: -68.0072 },
    ],
    progresoInicial: 0.75,
  },
  {
    id: 'IAMEC-07',
    placa: 'A55NP7V',
    modelo: 'Dongfeng Cummins Compactador 20 yd³',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 7.5,
    porcentajeCarga: 68,
    combustiblePct: 76,
    velocidadKmh: 25,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'VI-LUNMIÉ',
    rutaNombre: 'Ruta VI · Carialinda, Las Flores & Los Chorros',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Douglas Rafael Guevara',
    cedulaChofer: 'V-14.110.678',
    telefonoChofer: '0416-6428910',
    ayudantes: 3,
    presionHidraulicaPsi: 2020,
    tempMotorC: 86,
    viajesHoy: 2,
    toneladasHoy: 18.0,
    waypoints: [
      { x: 44, y: 34, sector: 'Urb. Carialinda (Sectores A, B, C y D)', lat: 10.2688, lng: -68.0124 },
      { x: 36, y: 30, sector: 'Sector Los Chorros y Callejón Pecoraro', lat: 10.2712, lng: -68.0156 },
      { x: 46, y: 38, sector: 'Las Flores y Carialinda E, F y G', lat: 10.2665, lng: -68.0112 },
      { x: 51, y: 33, sector: 'Av. Universidad · Sector Puente Bárbula', lat: 10.2695, lng: -68.0091 },
    ],
    progresoInicial: 0.3,
  },
  {
    id: 'IAMEC-08',
    placa: 'A61QR9W',
    modelo: 'JAC Gallop Compactador 18 yd³',
    tipo: 'Compactador 18 yd³',
    capacidadTon: 9.5,
    cargaActualTon: 6.1,
    porcentajeCarga: 64,
    combustiblePct: 79,
    velocidadKmh: 29,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'XIII-MARJUE',
    rutaNombre: 'Ruta XIII · Urb. Tarapío & Caprenco',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Miguel Ángel Zambrano',
    cedulaChofer: 'V-18.023.445',
    telefonoChofer: '0414-4337812',
    ayudantes: 2,
    presionHidraulicaPsi: 1960,
    tempMotorC: 84,
    viajesHoy: 2,
    toneladasHoy: 14.9,
    waypoints: [
      { x: 26, y: 45, sector: 'Urb. Tarapío · Av. Principal', lat: 10.2602, lng: -68.0218 },
      { x: 19, y: 40, sector: 'Colinas de Tarapío y Tarapío III', lat: 10.2634, lng: -68.0241 },
      { x: 24, y: 51, sector: 'Sector Caprenco y La Begoña', lat: 10.2581, lng: -68.0201 },
      { x: 30, y: 47, sector: 'Brisas de Tarapío y Barrio Oeste', lat: 10.2594, lng: -68.0189 },
    ],
    progresoInicial: 0.62,
  },
  {
    id: 'IAMEC-09',
    placa: 'A88ST3X',
    modelo: 'International WorkStar 7400',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 8.9,
    porcentajeCarga: 64,
    combustiblePct: 84,
    velocidadKmh: 36,
    estado: 'EN_RUTA',
    operativo: true,
    rutaId: 'XIV-MARJUE',
    rutaNombre: 'Ruta XIV · La Entrada, Lomas del Roscio & Trincheras',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Pedro Luis Colmenares',
    cedulaChofer: 'V-11.982.340',
    telefonoChofer: '0412-4012298',
    ayudantes: 3,
    presionHidraulicaPsi: 2140,
    tempMotorC: 87,
    viajesHoy: 1,
    toneladasHoy: 13.5,
    waypoints: [
      { x: 48, y: 22, sector: 'Carretera Nacional · Res. Los Mangos', lat: 10.2855, lng: -68.0108 },
      { x: 42, y: 14, sector: 'Pueblo de La Entrada y Lomas del Roscio', lat: 10.2921, lng: -68.0135 },
      { x: 35, y: 9, sector: 'Trincheras · Av. Principal y Las Terrazas', lat: 10.2984, lng: -68.0169 },
      { x: 44, y: 17, sector: 'Retorno Carretera Nacional La Entrada', lat: 10.2891, lng: -68.0121 },
    ],
    progresoInicial: 0.45,
  },
  // ── UNIDADES EN VERTEDERO (EN MOVIMIENTO EN LA VÍA Y MANIOBRA DE DESCARGA) ──
  {
    id: 'IAMEC-10',
    placa: 'A12UV6Y',
    modelo: 'Mack Granite Heil 25 yd³',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 13.8,
    porcentajeCarga: 99,
    combustiblePct: 64,
    velocidadKmh: 38,
    estado: 'EN_VERTEDERO',
    operativo: true,
    rutaId: 'I-LUNMIÉ',
    rutaNombre: 'Ruta I · Casco Central, Av. Urdaneta & Malagón',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Jesús Alberto Nieves',
    cedulaChofer: 'V-13.665.102',
    telefonoChofer: '0414-4889201',
    ayudantes: 3,
    presionHidraulicaPsi: 2200,
    tempMotorC: 85,
    viajesHoy: 2,
    toneladasHoy: 27.6,
    horaIngresoEstado: 'Hace 18 min',
    tiempoEnEstado: '18 min en Vertedero La Guásima',
    tiempoEstimadoSalida: '12 min (Descargando en Romana #2)',
    detalleTecnico: 'Descarga de 13.8 Toneladas completando 2do viaje del turno diurno.',
    waypoints: [
      { x: 24, y: 78, sector: 'Acceso Vertedero La Guásima · Romana #2', lat: 10.1412, lng: -68.0485 },
      { x: 16, y: 84, sector: 'Vertedero La Guásima · Patio de Descarga', lat: 10.1425, lng: -68.0468 },
      { x: 21, y: 81, sector: 'Retorno de Romana · Vertedero La Guásima', lat: 10.1452, lng: -68.0441 },
    ],
    progresoInicial: 0.2,
  },
  {
    id: 'IAMEC-11',
    placa: 'A27WX8Z',
    modelo: 'Freightliner M2 106 McNeilus',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 10.9,
    porcentajeCarga: 99,
    combustiblePct: 58,
    velocidadKmh: 54,
    estado: 'EN_VERTEDERO',
    operativo: true,
    rutaId: 'VII-MARJUE',
    rutaNombre: 'Ruta VII · Casco de Naguanagua & Nueva Naguanagua',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Néstor Daniel Ochoa',
    cedulaChofer: 'V-15.332.890',
    telefonoChofer: '0424-4110922',
    ayudantes: 3,
    presionHidraulicaPsi: 2100,
    tempMotorC: 88,
    viajesHoy: 2,
    toneladasHoy: 21.5,
    horaIngresoEstado: 'Hace 25 min',
    tiempoEnEstado: '25 min en tránsito / descarga',
    tiempoEstimadoSalida: '20 min para reincorporarse a Ruta VII',
    detalleTecnico: 'En traslado y maniobra de vaciado hidráulico de tolva (10.9 Ton recolectadas).',
    waypoints: [
      { x: 38, y: 69, sector: 'Distribuidor Naguanagua hacia Autopista Sur', lat: 10.2145, lng: -68.0211 },
      { x: 28, y: 76, sector: 'Autopista Sur · Vía Vertedero La Guásima', lat: 10.1785, lng: -68.0312 },
      { x: 18, y: 84, sector: 'Vertedero La Guásima · Zona de Descarga', lat: 10.1418, lng: -68.0475 },
    ],
    progresoInicial: 0.65,
  },
  {
    id: 'IAMEC-12',
    placa: 'A39YZ1A',
    modelo: 'International WorkStar 7400',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 13.5,
    porcentajeCarga: 96,
    combustiblePct: 71,
    velocidadKmh: 48,
    estado: 'EN_VERTEDERO',
    operativo: true,
    rutaId: 'X-LUNMIÉ',
    rutaNombre: 'Ruta X · González Plaza & Hospital Carabobo',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Franklin José Yánez',
    cedulaChofer: 'V-16.908.114',
    telefonoChofer: '0412-8456711',
    ayudantes: 3,
    presionHidraulicaPsi: 2170,
    tempMotorC: 86,
    viajesHoy: 2,
    toneladasHoy: 26.8,
    horaIngresoEstado: 'Hace 10 min',
    tiempoEnEstado: '10 min en cola de pesaje',
    tiempoEstimadoSalida: '25 min para retorno a Naguanagua',
    detalleTecnico: 'Unidad al 96% de capacidad (13.5 Ton). Pesaje de entrada registrado.',
    waypoints: [
      { x: 32, y: 74, sector: 'Tramo Tocuyito · Vía La Guásima', lat: 10.1612, lng: -68.0375 },
      { x: 22, y: 80, sector: 'Acceso Principal Vertedero La Guásima', lat: 10.1512, lng: -68.0412 },
      { x: 15, y: 86, sector: 'Celda de Disposición Final #4 · La Guásima', lat: 10.1398, lng: -68.0499 },
    ],
    progresoInicial: 0.4,
  },
  {
    id: 'IAMEC-13',
    placa: 'A45BC3D',
    modelo: 'Mack Granite Roll-Off Especial',
    tipo: 'Roll-Off / Volteo',
    capacidadTon: 16,
    cargaActualTon: 15.2,
    porcentajeCarga: 95,
    combustiblePct: 69,
    velocidadKmh: 50,
    estado: 'EN_VERTEDERO',
    operativo: true,
    rutaId: 'DIARIA-NOC',
    rutaNombre: 'Operativo Especial · Puntos Críticos y Grandes Generadores',
    frecuenciaRuta: 'Diario (Operativo Especial)',
    chofer: 'Leonardo José Briceño',
    cedulaChofer: 'V-14.556.701',
    telefonoChofer: '0414-4029918',
    ayudantes: 2,
    presionHidraulicaPsi: 2250,
    tempMotorC: 87,
    viajesHoy: 3,
    toneladasHoy: 42.0,
    horaIngresoEstado: 'Hace 32 min',
    tiempoEnEstado: '32 min (Saliendo de Vertedero)',
    tiempoEstimadoSalida: '5 min (Retornando a Av. Bolívar)',
    detalleTecnico: 'Descarga completada (15.2 Ton). Retornando vacío para 4to operativo.',
    waypoints: [
      { x: 17, y: 83, sector: 'Salida Romana Vertedero La Guásima', lat: 10.1431, lng: -68.0461 },
      { x: 33, y: 72, sector: 'Autopista Sur · Retorno a Naguanagua', lat: 10.2115, lng: -68.0214 },
      { x: 45, y: 63, sector: 'Entrada Sur Naguanagua · Av. Bolívar', lat: 10.2412, lng: -68.0125 },
    ],
    progresoInicial: 0.55,
  },
  // ── UNIDADES EN MANTENIMIENTO PREVENTIVO ──
  {
    id: 'IAMEC-14',
    placa: 'A58EF7G',
    modelo: 'Dongfeng Cummins Compactador 20 yd³',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 0,
    porcentajeCarga: 0,
    combustiblePct: 95,
    velocidadKmh: 0,
    estado: 'MANTENIMIENTO',
    operativo: false,
    rutaId: 'V-LUNMIÉ',
    rutaNombre: 'Ruta V · Barrio Coromoto & Colinas de Girardot',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Rafael Antonio Cordero',
    cedulaChofer: 'V-12.887.410',
    telefonoChofer: '0416-4401288',
    ayudantes: 3,
    presionHidraulicaPsi: 0,
    tempMotorC: 32,
    viajesHoy: 1,
    toneladasHoy: 10.4,
    horaIngresoEstado: 'Hoy 01:30 PM',
    tiempoEnEstado: '2 horas y 15 min en servicio preventivo',
    tiempoEstimadoSalida: '1 hora y 30 min (Sale hoy 05:15 PM)',
    motivoTaller: 'Mantenimiento Preventivo de 10.000 Km (Cambio de aceite 15W40, filtros y engrase general)',
    detalleTecnico:
      'Sustitución de filtro primario/secundario de combustible, filtro de aceite, engrase de pasadores de pala compactadora y revisión de bandas de freno.',
    mecanicoResponsable: 'Jefe de Taller Ing. Rubén Darío Silva',
    progresoTallerPct: 75,
    waypoints: [
      { x: 52, y: 42, sector: 'Patio Taller Central IAMEC · Bahía Preventiva #1', lat: 10.2632, lng: -68.0078 },
    ],
    progresoInicial: 0,
  },
  {
    id: 'IAMEC-15',
    placa: 'A63HI9J',
    modelo: 'JAC Gallop Compactador 18 yd³',
    tipo: 'Compactador 18 yd³',
    capacidadTon: 9.5,
    cargaActualTon: 0,
    porcentajeCarga: 0,
    combustiblePct: 88,
    velocidadKmh: 0,
    estado: 'MANTENIMIENTO',
    operativo: false,
    rutaId: 'XI-MARJUE',
    rutaNombre: 'Ruta XI · El Naranjal I, II & El Pinar',
    frecuenciaRuta: 'Mar-Jue-Sáb (Diurno)',
    chofer: 'Édgar Alexander Morales',
    cedulaChofer: 'V-17.112.009',
    telefonoChofer: '0412-4778120',
    ayudantes: 2,
    presionHidraulicaPsi: 0,
    tempMotorC: 30,
    viajesHoy: 1,
    toneladasHoy: 8.9,
    horaIngresoEstado: 'Hoy 02:00 PM',
    tiempoEnEstado: '1 hora y 45 min en servicio preventivo',
    tiempoEstimadoSalida: '45 min (Lista para Turno Nocturno)',
    motivoTaller: 'Rotación y calibración de neumáticos + Purga de sistema neumático de frenos y lavado de tolva',
    detalleTecnico:
      'Montaje de 2 cauchos nuevos 11R22.5 en eje trasero, drenaje de secador de aire y lavado a presión de caja compactadora.',
    mecanicoResponsable: 'Téc. Luis Gerardo Páez',
    progresoTallerPct: 88,
    waypoints: [
      { x: 55, y: 43, sector: 'Patio Taller Central IAMEC · Bahía Preventiva #2', lat: 10.2628, lng: -68.0065 },
    ],
    progresoInicial: 0,
  },
  // ── UNIDADES EN REPARACIÓN (CON TIEMPO DE REPARACIÓN Y MOTIVO DETALLADO) ──
  {
    id: 'IAMEC-16',
    placa: 'A77KL2M',
    modelo: 'Mack Granite Heil 25 yd³',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 0,
    porcentajeCarga: 0,
    combustiblePct: 45,
    velocidadKmh: 0,
    estado: 'REPARACION',
    operativo: false,
    rutaId: 'XII-LUNMIÉ',
    rutaNombre: 'Ruta XII · Guayabal, Camino Real & Bayona',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Alexis Ramón Escalona',
    cedulaChofer: 'V-13.009.451',
    telefonoChofer: '0414-4156602',
    ayudantes: 3,
    presionHidraulicaPsi: 0,
    tempMotorC: 28,
    viajesHoy: 0,
    toneladasHoy: 0,
    horaIngresoEstado: 'Ayer 09:00 AM',
    tiempoEnEstado: '1 día y 6 horas en reparación',
    tiempoEstimadoSalida: '6 horas restantes (Entrega mañana 07:00 AM)',
    motivoTaller: 'Reemplazo de sellos y empaquetaduras del cilindro hidráulico principal de la pala compactadora',
    detalleTecnico:
      'Se detectó pérdida de presión hidráulica en el ciclo de barrido. Se desmontó el cilindro telescópico derecho, se instaló kit de sellos Parker de alta presión y se está completando prueba de banco a 2.300 PSI.',
    mecanicoResponsable: 'Esp. Hidráulico Marcos Aurelio Tovar',
    progresoTallerPct: 80,
    waypoints: [
      { x: 50, y: 40, sector: 'Taller Central IAMEC · Área Hidráulica Pesada', lat: 10.2641, lng: -68.0088 },
    ],
    progresoInicial: 0,
  },
  {
    id: 'IAMEC-17',
    placa: 'A84NO5P',
    modelo: 'Freightliner M2 106 McNeilus',
    tipo: 'Compactador 20 yd³',
    capacidadTon: 11,
    cargaActualTon: 0,
    porcentajeCarga: 0,
    combustiblePct: 38,
    velocidadKmh: 0,
    estado: 'REPARACION',
    operativo: false,
    rutaId: 'III-LUNMIÉ',
    rutaNombre: 'Ruta III · Barrio La Luz, Chaguaramal & El Piñal',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Gustavo Adolfo Perdomo',
    cedulaChofer: 'V-15.884.210',
    telefonoChofer: '0424-4983321',
    ayudantes: 3,
    presionHidraulicaPsi: 0,
    tempMotorC: 27,
    viajesHoy: 0,
    toneladasHoy: 0,
    horaIngresoEstado: 'Hace 2 días',
    tiempoEnEstado: '2 días y 4 horas en reparación',
    tiempoEstimadoSalida: '18 horas restantes (En calibración de inyectores)',
    motivoTaller: 'Reparación de bomba de inyección electrónica y sustitución de cartucho de turboalimentador',
    detalleTecnico:
      'La unidad presentó pérdida de potencia en pendientes de Bárbula. Se reemplazó el cartucho del turbo Cummins ISB y se calibraron los 6 inyectores en laboratorio diésel. En fase de armado final.',
    mecanicoResponsable: 'Jefe Mecánico Diésel Hernán Cortés',
    progresoTallerPct: 65,
    waypoints: [
      { x: 48, y: 43, sector: 'Taller Central IAMEC · Área de Motores Diésel', lat: 10.2625, lng: -68.0095 },
    ],
    progresoInicial: 0,
  },
  {
    id: 'IAMEC-18',
    placa: 'A95QR8S',
    modelo: 'International WorkStar 7400',
    tipo: 'Compactador 25 yd³',
    capacidadTon: 14,
    cargaActualTon: 0,
    porcentajeCarga: 0,
    combustiblePct: 52,
    velocidadKmh: 0,
    estado: 'REPARACION',
    operativo: false,
    rutaId: 'XI-LUNMIÉ',
    rutaNombre: 'Ruta XI · Fundación Carabobo, Bomboná & Simón Bolívar',
    frecuenciaRuta: 'Lun-Mié-Vie (Diurno)',
    chofer: 'Orlando José Valera',
    cedulaChofer: 'V-12.119.304',
    telefonoChofer: '0416-8412099',
    ayudantes: 3,
    presionHidraulicaPsi: 0,
    tempMotorC: 28,
    viajesHoy: 0,
    toneladasHoy: 0,
    horaIngresoEstado: 'Hoy 07:30 AM',
    tiempoEnEstado: '8 horas en reparación',
    tiempoEstimadoSalida: '3 horas restantes (Sale hoy 06:30 PM)',
    motivoTaller: 'Sustitución de kit de embrague cerámico (croche) y manguera de alta presión de toma de fuerza (PTO)',
    detalleTecnico:
      'Se bajó caja Eaton Fuller de 10 velocidades para montar disco y plato de embrague reforzado de 15.5 pulgadas, además de manguera R2 de 1" de la bomba acoplada a la toma de fuerza.',
    mecanicoResponsable: 'Téc. Transmisiones Freddy Sequera',
    progresoTallerPct: 85,
    waypoints: [
      { x: 53, y: 39, sector: 'Taller Central IAMEC · Fosa de Transmisiones #3', lat: 10.2648, lng: -68.0072 },
    ],
    progresoInicial: 0,
  },
];

// Interpolación en circuito cerrado continuo (loop sin pausas en los extremos)
function calcularPosicionEnCircuito(waypoints: PuntoMapa[], progreso: number) {
  if (!waypoints || waypoints.length === 0) {
    return {
      x: 50,
      y: 50,
      sector: 'Naguanagua',
      lat: 10.258,
      lng: -68.011,
      proximoSector: 'Naguanagua',
      indiceParadaActual: 0,
      progresoTramoPct: 0,
    };
  }
  if (waypoints.length === 1) {
    return {
      ...waypoints[0],
      proximoSector: waypoints[0].sector,
      indiceParadaActual: 0,
      progresoTramoPct: 100,
    };
  }

  // Circuito cerrado continuo: pasa por 0 -> 1 -> 2 -> ... -> N-1 -> 0 sin detenerse jamás
  const n = waypoints.length;
  const posLoop = ((progreso % 1) + 1) % 1; // siempre entre 0 y 1
  const posExacta = posLoop * n;
  const idxActual = Math.floor(posExacta) % n;
  const idxSiguiente = (idxActual + 1) % n;
  const frac = posExacta - Math.floor(posExacta);

  const p1 = waypoints[idxActual];
  const p2 = waypoints[idxSiguiente];

  return {
    x: p1.x + (p2.x - p1.x) * frac,
    y: p1.y + (p2.y - p1.y) * frac,
    lat: p1.lat + (p2.lat - p1.lat) * frac,
    lng: p1.lng + (p2.lng - p1.lng) * frac,
    sector: frac < 0.65 ? p1.sector : p2.sector,
    proximoSector: p2.sector,
    indiceParadaActual: idxActual,
    progresoTramoPct: Math.round(frac * 100),
  };
}

export default function PresidenciaFlotaRutasTracker() {
  const [vistaInterna, setVistaInterna] = useState<'TRACKER' | 'ESTATUS_FLOTA' | 'CRONOGRAMA_RUTAS'>('TRACKER');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'OPERATIVOS' | EstadoCamion>('TODOS');
  const [busquedaCamion, setBusquedaCamion] = useState<string>('');

  // Selección de camión: 'TODOS' muestra todos en el mapa; un ID específico ('IAMEC-01') muestra SOLO ese camión en el mapa
  const [camionFiltroMapa, setCamionFiltroMapa] = useState<string>('TODOS');
  const [camionSeleccionadoId, setCamionSeleccionadoId] = useState<string>('IAMEC-01');
  const [mapaPantallaCompleta, setMapaPantallaCompleta] = useState<boolean>(false);

  // Controles del simulador GPS en vivo (movimiento fluido a 20 FPS sin pausas)
  const [simulacionActiva, setSimulacionActiva] = useState<boolean>(true);
  const [velocidadSim, setVelocidadSim] = useState<1 | 2 | 4>(1);
  const [tickTiempo, setTickTiempo] = useState<number>(0);

  // Filtros de las 29 Rutas Oficiales de Naguanagua
  const [filtroFrecuenciaRuta, setFiltroFrecuenciaRuta] = useState<string>('TODAS');
  const [busquedaRuta, setBusquedaRuta] = useState<string>('');

  // Reloj de animación continua a 60ms para que el movimiento GPS nunca se detenga
  useEffect(() => {
    if (!simulacionActiva) return;
    const interval = setInterval(() => {
      setTickTiempo((prev) => prev + 0.0022 * velocidadSim);
    }, 60);
    return () => clearInterval(interval);
  }, [simulacionActiva, velocidadSim]);

  // Calcular posición y telemetría dinámica de cada camión
  const flotaEnVivo = useMemo(() => {
    return FLOTA_INICIAL.map((camion, idx) => {
      const enMovimiento = camion.estado === 'EN_RUTA' || camion.estado === 'EN_VERTEDERO';
      const factorVelocidadUnidad = 0.85 + (idx % 5) * 0.14;
      const avance = enMovimiento
        ? camion.progresoInicial + tickTiempo * factorVelocidadUnidad
        : camion.progresoInicial;
      const pos = calcularPosicionEnCircuito(camion.waypoints, avance);

      const deltaVel = enMovimiento ? Math.round(Math.sin(tickTiempo * 18 + idx) * 4) : 0;
      const velocidadActual = enMovimiento ? Math.max(15, camion.velocidadKmh + deltaVel) : 0;
      const incrementoCarga =
        camion.estado === 'EN_RUTA'
          ? Math.min(98, Math.round(camion.porcentajeCarga + ((tickTiempo * 12) % 15)))
          : camion.porcentajeCarga;
      const cargaTonActual =
        camion.estado === 'EN_RUTA'
          ? Number(((incrementoCarga / 100) * camion.capacidadTon).toFixed(1))
          : camion.cargaActualTon;

      return {
        ...camion,
        pos,
        velocidadActual,
        porcentajeCargaActual: incrementoCarga,
        cargaTonActual,
      };
    });
  }, [tickTiempo]);

  // Resumen numérico de la flota
  const resumenFlota = useMemo(() => {
    const total = flotaEnVivo.length;
    const enRuta = flotaEnVivo.filter((c) => c.estado === 'EN_RUTA').length;
    const enVertedero = flotaEnVivo.filter((c) => c.estado === 'EN_VERTEDERO').length;
    const operativos = enRuta + enVertedero;
    const enMantenimiento = flotaEnVivo.filter((c) => c.estado === 'MANTENIMIENTO').length;
    const enReparacion = flotaEnVivo.filter((c) => c.estado === 'REPARACION').length;
    const toneladasHoyTotal = flotaEnVivo.reduce((acc, c) => acc + c.toneladasHoy, 0);
    const viajesHoyTotal = flotaEnVivo.reduce((acc, c) => acc + c.viajesHoy, 0);

    return {
      total,
      operativos,
      enRuta,
      enVertedero,
      enMantenimiento,
      enReparacion,
      toneladasHoyTotal,
      viajesHoyTotal,
      porcentajeOperatividad: Math.round((operativos / total) * 100),
    };
  }, [flotaEnVivo]);

  // Camiones filtrados por estatus/búsqueda
  const camionesFiltrados = useMemo(() => {
    return flotaEnVivo.filter((c) => {
      if (filtroEstado === 'OPERATIVOS' && !c.operativo) return false;
      if (
        filtroEstado !== 'TODOS' &&
        filtroEstado !== 'OPERATIVOS' &&
        c.estado !== filtroEstado
      ) {
        return false;
      }
      if (busquedaCamion.trim()) {
        const q = busquedaCamion.toLowerCase();
        const match =
          c.id.toLowerCase().includes(q) ||
          c.placa.toLowerCase().includes(q) ||
          c.modelo.toLowerCase().includes(q) ||
          c.chofer.toLowerCase().includes(q) ||
          c.rutaNombre.toLowerCase().includes(q) ||
          c.pos.sector.toLowerCase().includes(q) ||
          (c.motivoTaller || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [flotaEnVivo, filtroEstado, busquedaCamion]);

  // Camiones que se dibujan en el mapa: si el usuario eligió un camión específico, se ve SOLO ese camión
  const camionesEnMapa = useMemo(() => {
    if (camionFiltroMapa !== 'TODOS') {
      return flotaEnVivo.filter((c) => c.id === camionFiltroMapa);
    }
    return camionesFiltrados;
  }, [flotaEnVivo, camionFiltroMapa, camionesFiltrados]);

  const camionSeleccionado = useMemo(() => {
    const targetId = camionFiltroMapa !== 'TODOS' ? camionFiltroMapa : camionSeleccionadoId;
    return (
      flotaEnVivo.find((c) => c.id === targetId) ||
      camionesFiltrados[0] ||
      flotaEnVivo[0]
    );
  }, [flotaEnVivo, camionFiltroMapa, camionSeleccionadoId, camionesFiltrados]);

  // Al seleccionar un camión específico (en el mapa o en el selector), enfocar solo ese camión
  const handleSelectSingleTruck = (id: string) => {
    setCamionSeleccionadoId(id);
    setCamionFiltroMapa(id);
  };

  // Rutas de Naguanagua enriquecidas con unidad asignada en la maqueta
  const rutasEnriquecidas = useMemo(() => {
    return RUTAS_NAGUANAGUA.map((r, index) => {
      const camionDirecto = flotaEnVivo.find((c) => c.rutaId === r.id);
      const camionAsignado = camionDirecto || flotaEnVivo[index % 13];
      const avanceRutaPct =
        camionDirecto?.estado === 'EN_RUTA'
          ? Math.min(95, 45 + ((index * 7) % 45))
          : camionDirecto?.estado === 'EN_VERTEDERO'
            ? 100
            : 60 + ((index * 5) % 35);

      return {
        ...r,
        unidadAsignada: camionAsignado.id,
        modeloUnidad: camionAsignado.modelo,
        placaUnidad: camionAsignado.placa,
        choferAsignado: camionAsignado.chofer,
        estadoUnidad: camionAsignado.estado,
        avanceRutaPct,
        toneladasEstimadas: (8.5 + (index % 6) * 1.4).toFixed(1),
      };
    }).filter((r) => {
      if (filtroFrecuenciaRuta === 'DIARIO' && !r.frecuencia.startsWith('Diario')) return false;
      if (filtroFrecuenciaRuta === 'LUN_MIE_VIE' && !r.frecuencia.startsWith('Lun-Mié-Vie')) return false;
      if (filtroFrecuenciaRuta === 'MAR_JUE_SAB' && !r.frecuencia.startsWith('Mar-Jue-Sáb')) return false;
      if (busquedaRuta.trim()) {
        const q = busquedaRuta.toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          r.nombre.toLowerCase().includes(q) ||
          r.sectores.toLowerCase().includes(q) ||
          r.unidadAsignada.toLowerCase().includes(q) ||
          r.choferAsignado.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [flotaEnVivo, filtroFrecuenciaRuta, busquedaRuta]);

  const getBadgeEstado = (estado: EstadoCamion) => {
    switch (estado) {
      case 'EN_RUTA':
        return {
          label: '🚛 EN RUTA RECOLECTANDO',
          shortLabel: 'En Ruta',
          bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400',
          hex: '#10b981',
        };
      case 'EN_VERTEDERO':
        return {
          label: '♻️ EN VERTEDERO (LA GUÁSIMA)',
          shortLabel: 'En Vertedero',
          bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
          dot: 'bg-sky-400',
          hex: '#38bdf8',
        };
      case 'MANTENIMIENTO':
        return {
          label: '🟡 EN MANTENIMIENTO PREVENTIVO',
          shortLabel: 'Mantenimiento',
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400',
          hex: '#f59e0b',
        };
      case 'REPARACION':
        return {
          label: '🔴 EN REPARACIÓN (TALLER)',
          shortLabel: 'En Reparación',
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-500',
          hex: '#f43f5e',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* ══ CABECERA DEL CENTRO DE OPERACIONES DE FLOTA, RUTAS Y GPS ══ */}
      <div className="bg-gradient-to-r from-[#0b241b] via-[#0f2e22] to-[#091c15] border border-[#B8CD29]/40 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#B8CD29] text-slate-950 flex items-center justify-center shadow-lg shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  SIMULACIÓN GPS EN TIEMPO REAL · MODO MAQUETA PRESIDENCIAL
                </span>
                <span className="text-xs text-slate-400 font-semibold">
                  • 29 Rutas Oficiales Naguanagua · 18 Unidades Monitoreadas
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                CONTROL DE RUTAS, ESTATUS DE FLOTA Y TRACKER GPS EN VIVO
              </h2>
              <p className="text-xs text-emerald-100/75 mt-0.5">
                Seleccione qué camión desea monitorear de forma exclusiva o toque el mapa para abrir el Tracker Satelital en Pantalla Completa.
              </p>
            </div>
          </div>

          {/* Selector de Sub-Vistas Directas */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-emerald-800/60 self-start lg:self-center">
            {[
              { id: 'TRACKER', label: '🛰️ Mapa Tracker GPS' },
              { id: 'ESTATUS_FLOTA', label: '🚛 Estatus & Reparaciones' },
              { id: 'CRONOGRAMA_RUTAS', label: '🗺️ 29 Rutas Oficiales' },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setVistaInterna(v.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${vistaInterna === v.id
                    ? 'bg-[#B8CD29] text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ TARJETAS DE ESTATUS DE FLOTA (FILTROS RÁPIDOS AL PULSAR) ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Total Unidades */}
        <button
          onClick={() => {
            setFiltroEstado('TODOS');
            setCamionFiltroMapa('TODOS');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'TODOS' && camionFiltroMapa === 'TODOS'
              ? 'bg-slate-900 border-[#B8CD29] shadow-lg shadow-[#B8CD29]/10'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              FLOTA TOTAL IAMEC
            </span>
            <Truck className="w-4 h-4 text-[#B8CD29]" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5">{resumenFlota.total}</div>
          <div className="text-[11px] text-emerald-400 font-bold mt-1">
            {resumenFlota.toneladasHoyTotal.toFixed(1)} Ton recolectadas hoy
          </div>
        </button>

        {/* 2. Total Operativos */}
        <button
          onClick={() => {
            setFiltroEstado('OPERATIVOS');
            setCamionFiltroMapa('TODOS');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'OPERATIVOS'
              ? 'bg-emerald-950/60 border-emerald-400 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900/80 border-emerald-900/50 hover:border-emerald-600/50'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
              🟢 OPERATIVOS
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5">
            {resumenFlota.operativos}{' '}
            <span className="text-xs font-bold text-emerald-300/80">
              ({resumenFlota.porcentajeOperatividad}%)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Activos en calle y vertedero
          </div>
        </button>

        {/* 3. Camiones en Ruta */}
        <button
          onClick={() => {
            setFiltroEstado('EN_RUTA');
            setCamionFiltroMapa('TODOS');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'EN_RUTA'
              ? 'bg-emerald-950/70 border-[#B8CD29] shadow-lg shadow-[#B8CD29]/15'
              : 'bg-slate-900/80 border-slate-800 hover:border-emerald-500/50'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8CD29]">
              🚛 EN RUTA AHORA
            </span>
            <Navigation className="w-4 h-4 text-[#B8CD29]" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5">{resumenFlota.enRuta}</div>
          <div className="text-[11px] text-[#B8CD29] font-semibold mt-1">
            Recolectando en sectores
          </div>
        </button>

        {/* 4. Camiones en Vertedero */}
        <button
          onClick={() => {
            setFiltroEstado('EN_VERTEDERO');
            setCamionFiltroMapa('TODOS');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'EN_VERTEDERO'
              ? 'bg-sky-950/60 border-sky-400 shadow-lg shadow-sky-500/15'
              : 'bg-slate-900/80 border-slate-800 hover:border-sky-500/50'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-300">
              ♻️ EN VERTEDERO
            </span>
            <Recycle className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-sky-400 mt-1.5">{resumenFlota.enVertedero}</div>
          <div className="text-[11px] text-sky-200/80 mt-1">
            Descarga en La Guásima
          </div>
        </button>

        {/* 5. En Mantenimiento Preventivo */}
        <button
          onClick={() => {
            setFiltroEstado('MANTENIMIENTO');
            setCamionFiltroMapa('TODOS');
            setVistaInterna('ESTATUS_FLOTA');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'MANTENIMIENTO'
              ? 'bg-amber-950/60 border-amber-400 shadow-lg shadow-amber-500/15'
              : 'bg-slate-900/80 border-slate-800 hover:border-amber-500/50'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              🟡 MANTENIMIENTO
            </span>
            <Settings className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1.5">
            {resumenFlota.enMantenimiento}
          </div>
          <div className="text-[11px] text-amber-200/80 mt-1">
            Servicio preventivo (Hoy)
          </div>
        </button>

        {/* 6. En Reparación (Taller) */}
        <button
          onClick={() => {
            setFiltroEstado('REPARACION');
            setCamionFiltroMapa('TODOS');
            setVistaInterna('ESTATUS_FLOTA');
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${filtroEstado === 'REPARACION'
              ? 'bg-rose-950/60 border-rose-400 shadow-lg shadow-rose-500/15'
              : 'bg-slate-900/80 border-slate-800 hover:border-rose-500/50'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
              🔴 EN REPARACIÓN
            </span>
            <Wrench className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1.5">
            {resumenFlota.enReparacion}
          </div>
          <div className="text-[11px] text-rose-200/80 mt-1">
            Ver motivo y tiempo taller
          </div>
        </button>
      </div>

      {/* ══ SECCIÓN 1: SIMULADOR / TRACKER GPS SATELITAL EN VIVO (CON PANTALLA COMPLETA Y FILTRO DE UN SOLO CAMIÓN) ══ */}
      {vistaInterna === 'TRACKER' && (
        <div
          className={
            mapaPantallaCompleta
              ? 'fixed inset-0 z-50 bg-[#04110c] flex flex-col overflow-y-auto'
              : 'bg-slate-900/95 border border-emerald-800/60 rounded-2xl overflow-hidden shadow-2xl'
          }
        >
          {/* Barra superior de control del Tracker GPS + Selector de Camión */}
          <div className="bg-slate-950/95 border-b border-emerald-900/60 px-4 sm:px-6 py-3 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Radio className={`w-5 h-5 ${simulacionActiva ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-white">
                      TRACKER GPS SATELITAL EN VIVO · NAGUANAGUA
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${simulacionActiva
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                    >
                      {simulacionActiva ? '● MOVIMIENTO EN VIVO' : '⏸ PAUSADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {camionFiltroMapa === 'TODOS'
                      ? `Mostrando ${camionesEnMapa.length} unidades en el mapa. Seleccione un camión abajo o tóquelo en el mapa para ver solo su recorrido.`
                      : `Monitoreo exclusivo de ${camionSeleccionado.id} (${camionSeleccionado.rutaNombre})`}
                  </p>
                </div>
              </div>

              {/* Botones de reproducción, velocidad y Pantalla Completa */}
              <div className="flex flex-wrap items-center gap-2">
                {camionFiltroMapa !== 'TODOS' && (
                  <button
                    onClick={() => setCamionFiltroMapa('TODOS')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver Todos los Camiones ({flotaEnVivo.length})
                  </button>
                )}

                <button
                  onClick={() => setSimulacionActiva((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${simulacionActiva
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400'
                    }`}
                >
                  {simulacionActiva ? (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Reanudar
                    </>
                  )}
                </button>

                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-0.5">
                  {([1, 2, 4] as const).map((vel) => (
                    <button
                      key={vel}
                      onClick={() => setVelocidadSim(vel)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${velocidadSim === vel
                          ? 'bg-[#B8CD29] text-slate-950'
                          : 'text-slate-400 hover:text-white'
                        }`}
                    >
                      {vel}x
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setMapaPantallaCompleta((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${mapaPantallaCompleta
                      ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400'
                      : 'bg-[#B8CD29] hover:bg-[#c8de38] text-slate-950 border-[#B8CD29]'
                    }`}
                >
                  {mapaPantallaCompleta ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" /> Cerrar Pantalla Completa
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" /> Abrir Mapa Completo
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* BARRA SELECTORA DE CAMIÓN: Permite elegir qué camión ver en solitario o ver todos */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2 shrink-0">
                <Compass className="w-4 h-4 text-[#B8CD29]" />
                <span className="text-xs font-black text-[#B8CD29] uppercase tracking-wider">
                  Seleccionar Camión a Ver:
                </span>
              </div>

              {/* Dropdown directo + Botones rápidos */}
              <select
                value={camionFiltroMapa}
                onChange={(e) => {
                  const val = e.target.value;
                  setCamionFiltroMapa(val);
                  if (val !== 'TODOS') setCamionSeleccionadoId(val);
                }}
                className="bg-slate-900 border border-[#B8CD29]/50 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-[#B8CD29] sm:w-80"
              >
                <option value="TODOS">🌐 VER TODOS LOS CAMIONES EN EL MAPA ({flotaEnVivo.length})</option>
                <optgroup label="🚛 Camiones Recolectando en Ruta (9)">
                  {flotaEnVivo
                    .filter((c) => c.estado === 'EN_RUTA')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        🚛 {c.id} ({c.placa}) · {c.rutaNombre}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="♻️ Camiones en Vertedero La Guásima (4)">
                  {flotaEnVivo
                    .filter((c) => c.estado === 'EN_VERTEDERO')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        ♻️ {c.id} ({c.placa}) · {c.rutaNombre}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="🟡 En Mantenimiento Preventivo (2)">
                  {flotaEnVivo
                    .filter((c) => c.estado === 'MANTENIMIENTO')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        🟡 {c.id} ({c.placa}) · {c.motivoTaller?.slice(0, 42)}...
                      </option>
                    ))}
                </optgroup>
                <optgroup label="🔴 En Reparación en Taller (3)">
                  {flotaEnVivo
                    .filter((c) => c.estado === 'REPARACION')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        🔴 {c.id} ({c.placa}) · {c.motivoTaller?.slice(0, 42)}...
                      </option>
                    ))}
                </optgroup>
              </select>

              {/* Píldoras rápidas de unidades */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setCamionFiltroMapa('TODOS')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black border shrink-0 cursor-pointer transition-all ${camionFiltroMapa === 'TODOS'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                >
                  Todos ({flotaEnVivo.length})
                </button>
                {flotaEnVivo.map((u) => {
                  const isSolo = camionFiltroMapa === u.id;
                  const b = getBadgeEstado(u.estado);
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectSingleTruck(u.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1 shrink-0 cursor-pointer transition-all ${isSolo
                          ? 'bg-[#B8CD29] text-slate-950 border-[#B8CD29] shadow'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      {u.id.replace('IAMEC-', 'U-')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cuerpo del Tracker: Mapa Táctico + Panel de Telemetría de la Unidad Seleccionada */}
          <div className="grid grid-cols-1 lg:grid-cols-12 flex-1">
            {/* MAPA TÁCTICO INTERACTIVO DE NAGUANAGUA (8 COLUMNAS) */}
            <div
              onClick={(e) => {
                // Si toca el lienzo del mapa en vista normal, se abre el mapa completo para mejor visualización
                if (!mapaPantallaCompleta && (e.target as HTMLElement).tagName !== 'BUTTON') {
                  setMapaPantallaCompleta(true);
                }
              }}
              className={`lg:col-span-8 relative ${mapaPantallaCompleta ? 'min-h-[62vh] lg:min-h-[78vh]' : 'min-h-[460px] sm:min-h-[540px]'
                } bg-[#04110c] overflow-hidden select-none border-b lg:border-b-0 lg:border-r border-emerald-900/50 cursor-pointer`}
            >
              {/* Banner flotante superior en el mapa */}
              <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                <div className="bg-slate-950/85 backdrop-blur-md border border-emerald-500/40 rounded-xl px-3 py-1.5 text-[11px] font-bold text-emerald-300 shadow-lg">
                  {camionFiltroMapa === 'TODOS' ? (
                    <span>🛰️ Viendo toda la flota · Toque un camión para aislar su ruta o toque el mapa para ampliar</span>
                  ) : (
                    <span>
                      🎯 Modo Enfoque Exclusivo: <strong className="text-[#B8CD29]">{camionSeleccionado.id}</strong> ·{' '}
                      {camionSeleccionado.pos.sector} ({camionSeleccionado.velocidadActual} km/h)
                    </span>
                  )}
                </div>
              </div>

              {/* Retícula radar y arterias viales de Naguanagua en SVG */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <defs>
                  <pattern id="gridNaguanagua" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="rgba(16, 185, 129, 0.08)"
                      strokeWidth="0.25"
                    />
                  </pattern>
                  <radialGradient id="radarGlow" cx="50%" cy="48%" r="50%">
                    <stop offset="0%" stopColor="rgba(184, 205, 41, 0.12)" />
                    <stop offset="60%" stopColor="rgba(16, 185, 129, 0.05)" />
                    <stop offset="100%" stopColor="rgba(4, 17, 12, 0)" />
                  </radialGradient>
                </defs>

                {/* Fondo con cuadrícula GPS */}
                <rect width="100" height="100" fill="url(#gridNaguanagua)" />
                <circle cx="50" cy="48" r="44" fill="url(#radarGlow)" />

                {/* Contorno estilizado del Municipio Naguanagua */}
                <polygon
                  points="18,12 45,6 76,16 84,48 76,75 40,86 12,88 10,52"
                  fill="rgba(16, 185, 129, 0.03)"
                  stroke="rgba(16, 185, 129, 0.18)"
                  strokeWidth="0.35"
                  strokeDasharray="1.5 1"
                />

                {/* Autopista Regional del Centro / Autopista del Este (Eje Norte-Sur) */}
                <path
                  d="M 38,4 Q 46,24 58,45 T 62,74 L 18,85"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.22)"
                  strokeWidth="1.2"
                />
                {/* Av. Universidad y Av. Bolívar de Naguanagua */}
                <path
                  d="M 58,24 L 46,48 L 44,68"
                  fill="none"
                  stroke="rgba(184, 205, 41, 0.25)"
                  strokeWidth="0.9"
                />
                {/* Eje Este-Oeste: Tarapío - Las Quintas - El Cafetal - Mañongo */}
                <path
                  d="M 20,45 L 36,48 L 52,54 L 74,56"
                  fill="none"
                  stroke="rgba(16, 185, 129, 0.22)"
                  strokeWidth="0.7"
                />

                {/* Trazos de las rutas activas de los camiones visibles en el mapa */}
                {camionesEnMapa.map((camion) => {
                  if (camion.waypoints.length < 2) return null;
                  const isFocused =
                    camionFiltroMapa !== 'TODOS' || camion.id === camionSeleccionado?.id;
                  // Cerrar el polígono del circuito para que se vea toda la vuelta de la ruta
                  const closedWaypoints = [...camion.waypoints, camion.waypoints[0]];
                  const pointsStr = closedWaypoints.map((w) => `${w.x},${w.y}`).join(' ');
                  const badge = getBadgeEstado(camion.estado);
                  return (
                    <g key={`route-${camion.id}`}>
                      <polyline
                        points={pointsStr}
                        fill="none"
                        stroke={isFocused ? '#B8CD29' : badge.hex}
                        strokeWidth={isFocused ? '1.3' : '0.5'}
                        strokeOpacity={isFocused ? '0.95' : '0.4'}
                        strokeDasharray={isFocused ? '2 1' : '1.2 0.8'}
                      />
                      {isFocused &&
                        camion.waypoints.map((wp, idx) => (
                          <circle
                            key={idx}
                            cx={wp.x}
                            cy={wp.y}
                            r="1.3"
                            fill="#04110c"
                            stroke="#B8CD29"
                            strokeWidth="0.6"
                          />
                        ))}
                    </g>
                  );
                })}
              </svg>

              {/* Etiquetas geográficas de referencia de Naguanagua en el Mapa */}
              <div className="absolute inset-0 pointer-events-none">
                {[
                  { label: 'TRINCHERAS / LA ENTRADA', x: 38, y: 9 },
                  { label: 'BÁRBULA / VIVIENDA RURAL', x: 64, y: 21 },
                  { label: 'CARIALINDA / LOS CHORROS', x: 42, y: 33 },
                  { label: 'TARAPÍO / LA BEGOÑA', x: 23, y: 44 },
                  { label: 'LAS QUINTAS / UNEFA', x: 35, y: 46 },
                  { label: 'AV. UNIVERSIDAD / EL CAFETAL', x: 47, y: 50 },
                  { label: 'LA GRANJA / AV. BOLÍVAR', x: 34, y: 63 },
                  { label: 'MAÑONGO / SAMBIL / EL RINCÓN', x: 70, y: 53 },
                  { label: 'TAZAJAL / MONTE ALEGRE', x: 66, y: 74 },
                ].map((z, idx) => (
                  <div
                    key={idx}
                    style={{ left: `${z.x}%`, top: `${z.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-800/80 text-[8px] sm:text-[9px] font-extrabold text-slate-400 tracking-wider whitespace-nowrap"
                  >
                    {z.label}
                  </div>
                ))}

                {/* Base Patio Taller Central IAMEC */}
                <div
                  style={{ left: '51%', top: '41%' }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-rose-950/85 border border-rose-500/50 text-[9px] font-black text-rose-300 shadow whitespace-nowrap"
                >
                  🔧 PATIO TALLER CENTRAL IAMEC
                </div>

                {/* Base Vertedero La Guásima */}
                <div
                  style={{ left: '18%', top: '88%' }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-sky-950/90 border border-sky-400/60 text-[9px] sm:text-[10px] font-black text-sky-300 shadow-lg whitespace-nowrap"
                >
                  ♻️ VERTEDERO LA GUÁSIMA (DESCARGA Y ROMANA)
                </div>

                {/* Si hay 1 solo camión enfocado, mostrar etiquetas de todas sus paradas en la ruta */}
                {camionFiltroMapa !== 'TODOS' &&
                  camionSeleccionado.waypoints.map((wp, idx) => (
                    <div
                      key={`stop-label-${idx}`}
                      style={{ left: `${wp.x}%`, top: `${Math.max(6, wp.y - 4.5)}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#0f291e]/95 border border-[#B8CD29]/70 text-[9px] font-extrabold text-[#B8CD29] shadow-md whitespace-nowrap z-20"
                    >
                      Parada #{idx + 1}: {wp.sector}
                    </div>
                  ))}
              </div>

              {/* Marcadores Interactivos de los Camiones en Tiempo Real */}
              {camionesEnMapa.map((camion) => {
                const isSelected = camion.id === camionSeleccionado?.id;
                const badge = getBadgeEstado(camion.estado);
                return (
                  <button
                    key={camion.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleSelectSingleTruck(camion.id);
                    }}
                    style={{
                      left: `${camion.pos.x}%`,
                      top: `${camion.pos.y}%`,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer focus:outline-none ${isSelected ? 'z-30 scale-115' : 'z-20 hover:z-30 hover:scale-110'
                      }`}
                  >
                    {/* Pulso radar para unidades en movimiento o seleccionadas */}
                    {(isSelected || camion.velocidadActual > 0) && (
                      <span
                        style={{ borderColor: isSelected ? '#B8CD29' : badge.hex }}
                        className={`absolute -inset-2.5 rounded-full border-2 animate-ping ${isSelected ? 'opacity-85' : 'opacity-40'
                          }`}
                      />
                    )}

                    <div
                      style={{
                        borderColor: isSelected ? '#B8CD29' : badge.hex,
                        backgroundColor: isSelected ? '#0f291e' : '#091512',
                      }}
                      className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 shadow-2xl"
                    >
                      <span className="text-xs">🚛</span>
                      <span
                        className={`text-[10px] sm:text-[11px] font-black tracking-tight ${isSelected ? 'text-[#B8CD29]' : 'text-white'
                          }`}
                      >
                        {camion.id.replace('IAMEC-', 'U-')}
                      </span>
                      {camion.velocidadActual > 0 && (
                        <span className="text-[9px] font-extrabold text-emerald-300 bg-emerald-950/90 px-1.5 py-0.5 rounded-full">
                          {camion.velocidadActual}km/h
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Leyenda inferior del mapa */}
              <div className="absolute bottom-2.5 right-2.5 left-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMapaPantallaCompleta((prev) => !prev);
                  }}
                  className="pointer-events-auto flex items-center gap-1.5 bg-[#B8CD29] hover:bg-[#c8de38] text-slate-950 font-black text-[11px] px-3 py-1.5 rounded-xl shadow-lg cursor-pointer"
                >
                  {mapaPantallaCompleta ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" /> Salir de Pantalla Completa
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" /> Ampliar Mapa Completo
                    </>
                  )}
                </button>

                <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> En Ruta ({resumenFlota.enRuta})
                  </span>
                  <span className="flex items-center gap-1.5 text-sky-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> En Vertedero ({resumenFlota.enVertedero})
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Mantenimiento ({resumenFlota.enMantenimiento})
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> En Reparación ({resumenFlota.enReparacion})
                  </span>
                </div>
              </div>
            </div>

            {/* PANEL DE TELEMETRÍA EN VIVO DE LA UNIDAD SELECCIONADA (4 COLUMNAS) */}
            <div className="lg:col-span-4 bg-slate-950/90 p-4 sm:p-5 flex flex-col justify-between space-y-4">
              {camionSeleccionado && (
                <>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getBadgeEstado(camionSeleccionado.estado).bg
                            }`}
                        >
                          {getBadgeEstado(camionSeleccionado.estado).label}
                        </span>
                        <h4 className="text-lg font-black text-white mt-1.5 flex items-center gap-2">
                          {camionSeleccionado.id}
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-[#B8CD29] border border-slate-700">
                            Placa {camionSeleccionado.placa}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-400 font-semibold">
                          {camionSeleccionado.modelo} · {camionSeleccionado.tipo}
                        </p>
                      </div>

                      {camionFiltroMapa !== 'TODOS' ? (
                        <button
                          onClick={() => setCamionFiltroMapa('TODOS')}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 text-[10px] font-black cursor-pointer"
                        >
                          Ver Todos
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSelectSingleTruck(camionSeleccionado.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#B8CD29]/20 hover:bg-[#B8CD29]/30 text-[#B8CD29] border border-[#B8CD29]/40 text-[10px] font-black cursor-pointer"
                        >
                          Aislar en Mapa
                        </button>
                      )}
                    </div>

                    {/* Ubicación GPS Actual en movimiento */}
                    <div className="bg-slate-900/90 border border-emerald-900/60 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> Ubicación GPS en Vivo
                        </span>
                        <span className="font-mono text-slate-400">
                          {camionSeleccionado.pos.lat.toFixed(4)}° N, {camionSeleccionado.pos.lng.toFixed(4)}° W
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-black text-white">
                        {camionSeleccionado.pos.sector}
                      </div>
                      {(camionSeleccionado.estado === 'EN_RUTA' ||
                        camionSeleccionado.estado === 'EN_VERTEDERO') && (
                          <div className="space-y-1 pt-1">
                            <div className="text-[11px] text-[#B8CD29] font-semibold flex items-center gap-1">
                              <ChevronRight className="w-3.5 h-3.5" />
                              Dirigiéndose a: {camionSeleccionado.pos.proximoSector}
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${camionSeleccionado.pos.progresoTramoPct}%` }}
                                className="h-full bg-[#B8CD29] transition-all duration-100"
                              />
                            </div>
                          </div>
                        )}
                    </div>

                    {/* Ruta y Cuadrilla Asignada */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Ruta & Cuadrilla Operativa
                      </div>
                      <div className="text-xs font-black text-[#B8CD29]">
                        {camionSeleccionado.rutaNombre} ({camionSeleccionado.frecuenciaRuta})
                      </div>
                      <div className="text-xs text-slate-200 font-semibold flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span>👨‍✈️ {camionSeleccionado.chofer}</span>
                        <span className="text-[11px] text-slate-400">
                          +{camionSeleccionado.ayudantes} Ayudantes
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        C.I: {camionSeleccionado.cedulaChofer} · Tel: {camionSeleccionado.telefonoChofer}
                      </div>
                    </div>

                    {/* Indicadores de Telemetría (Velocidad, Carga de Tolva, Combustible, Hidráulico) */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Velocidad GPS
                        </div>
                        <div className="text-base font-black text-white mt-0.5">
                          {camionSeleccionado.velocidadActual} km/h
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Temp. Motor: {camionSeleccionado.tempMotorC}°C
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-[#B8CD29]" /> Carga en Tolva
                        </div>
                        <div className="text-base font-black text-[#B8CD29] mt-0.5">
                          {camionSeleccionado.cargaTonActual} / {camionSeleccionado.capacidadTon} Ton (
                          {camionSeleccionado.porcentajeCargaActual}%)
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            style={{ width: `${camionSeleccionado.porcentajeCargaActual}%` }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-[#B8CD29]"
                          />
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Fuel className="w-3.5 h-3.5 text-sky-400" /> Nivel Diésel
                        </div>
                        <div className="text-sm font-black text-white mt-0.5">
                          {camionSeleccionado.combustiblePct}% Tanque
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-purple-400" /> Recolectado Hoy
                        </div>
                        <div className="text-sm font-black text-emerald-400 mt-0.5">
                          {camionSeleccionado.toneladasHoy} Ton ({camionSeleccionado.viajesHoy} viajes)
                        </div>
                      </div>
                    </div>

                    {/* Alerta / Detalle Especial si está en Reparación, Mantenimiento o Vertedero */}
                    {camionSeleccionado.estado !== 'EN_RUTA' && (
                      <div
                        className={`rounded-xl p-3 border space-y-1.5 ${camionSeleccionado.estado === 'REPARACION'
                            ? 'bg-rose-950/50 border-rose-500/50'
                            : camionSeleccionado.estado === 'MANTENIMIENTO'
                              ? 'bg-amber-950/50 border-amber-500/50'
                              : 'bg-sky-950/50 border-sky-500/50'
                          }`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-wider flex items-center justify-between">
                          <span
                            className={
                              camionSeleccionado.estado === 'REPARACION'
                                ? 'text-rose-300'
                                : camionSeleccionado.estado === 'MANTENIMIENTO'
                                  ? 'text-amber-300'
                                  : 'text-sky-300'
                            }
                          >
                            {camionSeleccionado.estado === 'REPARACION'
                              ? '🔧 MOTIVO Y TIEMPO DE REPARACIÓN'
                              : camionSeleccionado.estado === 'MANTENIMIENTO'
                                ? '⚙️ SERVICIO PREVENTIVO EN CURSO'
                                : '♻️ OPERACIÓN EN VERTEDERO LA GUÁSIMA'}
                          </span>
                          <span className="text-white font-bold">
                            {camionSeleccionado.tiempoEnEstado}
                          </span>
                        </div>
                        {camionSeleccionado.motivoTaller && (
                          <div className="text-xs font-extrabold text-white">
                            Motivo: {camionSeleccionado.motivoTaller}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-300 leading-relaxed">
                          {camionSeleccionado.detalleTecnico}
                        </div>
                        <div className="text-[11px] font-bold text-[#B8CD29] pt-1">
                          ⏱️ Salida estimada: {camionSeleccionado.tiempoEstimadoSalida}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ SECCIÓN 2: DETALLE DE CAMIONES EN REPARACIÓN Y MANTENIMIENTO (CON TIEMPO Y MOTIVO) + TABLA DE FLOTA ══ */}
      {vistaInterna === 'ESTATUS_FLOTA' && (
        <div className="space-y-6">
          {/* Bloque Destacado: Unidades en Reparación y Mantenimiento Preventivo */}
          <div className="bg-slate-900/95 border border-rose-500/40 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  CONTROL DE TALLER CENTRAL IAMEC
                </span>
                <h3 className="text-base sm:text-lg font-black text-white mt-1.5 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-rose-400" />
                  UNIDADES EN REPARACIÓN Y MANTENIMIENTO (MOTIVO, TIEMPO EN TALLER Y ENTREGA)
                </h3>
              </div>
              <div className="text-xs text-slate-400 font-semibold">
                {resumenFlota.enReparacion} en Reparación Mecánica · {resumenFlota.enMantenimiento} en Mantenimiento Preventivo
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {flotaEnVivo
                .filter((c) => c.estado === 'REPARACION' || c.estado === 'MANTENIMIENTO')
                .map((unidad) => {
                  const esReparacion = unidad.estado === 'REPARACION';
                  return (
                    <div
                      key={unidad.id}
                      onClick={() => {
                        handleSelectSingleTruck(unidad.id);
                        setVistaInterna('TRACKER');
                      }}
                      className={`rounded-2xl p-4 border transition-all cursor-pointer ${esReparacion
                          ? 'bg-rose-950/25 border-rose-500/40 hover:border-rose-400'
                          : 'bg-amber-950/25 border-amber-500/40 hover:border-amber-400'
                        }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${esReparacion
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                          >
                            {esReparacion ? '🔴 EN REPARACIÓN' : '🟡 EN MANTENIMIENTO'}
                          </span>
                          <span className="text-sm font-black text-white">
                            {unidad.id} · Placa {unidad.placa}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                          {unidad.modelo}
                        </span>
                      </div>

                      {/* Motivo principal */}
                      <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-[#B8CD29]">
                          Motivo de Ingreso a Taller:
                        </div>
                        <div className="text-xs sm:text-sm font-black text-white">
                          {unidad.motivoTaller}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {unidad.detalleTecnico}
                        </p>
                      </div>

                      {/* Tiempos de Reparación y Barra de Avance */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
                        <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800">
                          <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-rose-400" /> Tiempo en Taller
                          </div>
                          <div className="text-xs font-black text-white mt-0.5">
                            {unidad.tiempoEnEstado}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Ingreso: {unidad.horaIngresoEstado}
                          </div>
                        </div>

                        <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800">
                          <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Tiempo Restante / Salida
                          </div>
                          <div className="text-xs font-black text-emerald-300 mt-0.5">
                            {unidad.tiempoEstimadoSalida}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Ruta: {unidad.rutaId}
                          </div>
                        </div>

                        <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                            <span>Avance Taller</span>
                            <span className="text-[#B8CD29] font-black">{unidad.progresoTallerPct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                            <div
                              style={{ width: `${unidad.progresoTallerPct}%` }}
                              className={`h-full ${esReparacion ? 'bg-rose-500' : 'bg-amber-400'
                                }`}
                            />
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-1">
                            👷 {unidad.mecanicoResponsable}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Listado General de las 18 Unidades de la Flota */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  PADRÓN COMPLETO DE UNIDADES Y ESTADO OPERATIVO ({camionesFiltrados.length} de {flotaEnVivo.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Toque cualquier camión de la tabla para ver su recorrido exclusivo en el Mapa Tracker GPS.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busquedaCamion}
                    onChange={(e) => setBusquedaCamion(e.target.value)}
                    placeholder="Buscar unidad, placa, chofer, sector..."
                    className="bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[#B8CD29] w-64"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase">
                    <th className="py-3 px-3">Unidad / Placa</th>
                    <th className="py-3 px-3">Estatus Actual</th>
                    <th className="py-3 px-3">Ruta Asignada</th>
                    <th className="py-3 px-3">Ubicación GPS / Detalle Taller</th>
                    <th className="py-3 px-3">Carga Tolva</th>
                    <th className="py-3 px-3">Chofer Responsable</th>
                    <th className="py-3 px-3 text-right">Acción GPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {camionesFiltrados.map((c) => {
                    const b = getBadgeEstado(c.estado);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => {
                          handleSelectSingleTruck(c.id);
                          setVistaInterna('TRACKER');
                        }}
                        className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3">
                          <div className="font-black text-white">{c.id}</div>
                          <div className="text-[11px] text-slate-400">
                            {c.placa} · {c.modelo}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border ${b.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
                            {b.shortLabel}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {c.operativo ? '🟢 Operativo' : `⏱️ ${c.tiempoEnEstado}`}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#B8CD29]">{c.rutaNombre}</div>
                          <div className="text-[11px] text-slate-400">{c.frecuenciaRuta}</div>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="font-bold text-slate-100">{c.pos.sector}</div>
                          {c.motivoTaller ? (
                            <div className="text-[11px] text-rose-300 font-semibold mt-0.5">
                              🔧 {c.motivoTaller} ({c.tiempoEstimadoSalida})
                            </div>
                          ) : c.detalleTecnico ? (
                            <div className="text-[11px] text-sky-300 mt-0.5">
                              {c.detalleTecnico}
                            </div>
                          ) : (
                            <div className="text-[11px] text-emerald-400 mt-0.5">
                              Velocidad: {c.velocidadActual} km/h · Combustible: {c.combustiblePct}%
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-black text-white">
                            {c.cargaTonActual} / {c.capacidadTon} Ton ({c.porcentajeCargaActual}%)
                          </div>
                          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                            <div
                              style={{ width: `${c.porcentajeCargaActual}%` }}
                              className="h-full bg-emerald-400"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-200">{c.chofer}</div>
                          <div className="text-[11px] text-slate-400">
                            {c.telefonoChofer} (+{c.ayudantes} ayud.)
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#B8CD29] text-slate-950 font-black text-[10px]">
                            🛰️ Ver en Mapa
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ SECCIÓN 3: CRONOGRAMA Y DIRECTORIO OFICIAL DE LAS 29 RUTAS DE NAGUANAGUA ══ */}
      {vistaInterna === 'CRONOGRAMA_RUTAS' && (
        <div className="bg-slate-900/95 border border-emerald-800/60 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#B8CD29]/20 text-[#B8CD29] border border-[#B8CD29]/40">
                PLANIFICACIÓN OPERATIVA MUNICIPAL
              </span>
              <h3 className="text-base sm:text-lg font-black text-white mt-1.5 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#B8CD29]" />
                RUTAS OFICIALES DE RECOLECCIÓN EN NAGUANAGUA ({rutasEnriquecidas.length} Rutas)
              </h3>
              <p className="text-xs text-slate-400">
                Cobertura completa de sectores residenciales, comerciales, avenidas principales, hospitales y comunidades con su camión asignado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'TODAS', label: 'Todas (29)' },
                { id: 'DIARIO', label: 'Diarias (Diurno/Nocturno)' },
                { id: 'LUN_MIE_VIE', label: 'Lun - Mié - Vie (13)' },
                { id: 'MAR_JUE_SAB', label: 'Mar - Jue - Sáb (14)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltroFrecuenciaRuta(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${filtroFrecuenciaRuta === f.id
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                  {f.label}
                </button>
              ))}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busquedaRuta}
                  onChange={(e) => setBusquedaRuta(e.target.value)}
                  placeholder="Buscar urbanización o sector..."
                  className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[#B8CD29] w-56"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {rutasEnriquecidas.map((ruta) => {
              const badge = getBadgeEstado(ruta.estadoUnidad);
              return (
                <div
                  key={ruta.id}
                  className="bg-slate-950/85 border border-slate-800 hover:border-emerald-600/60 rounded-2xl p-4 flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#B8CD29]/20 text-[#B8CD29] border border-[#B8CD29]/40 text-xs font-black">
                        {ruta.nombre} ({ruta.id})
                      </span>
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800/60">
                        {ruta.frecuencia}
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                      Sectores y Comunidades Atendidas:
                    </div>
                    <p className="text-xs text-slate-200 font-medium leading-relaxed mt-1">
                      {ruta.sectores}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/90 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">
                        🚛 Unidad: <strong className="text-white">{ruta.unidadAsignada}</strong> ({ruta.placaUnidad})
                      </span>
                      <button
                        onClick={() => {
                          handleSelectSingleTruck(ruta.unidadAsignada);
                          setVistaInterna('TRACKER');
                        }}
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#B8CD29] text-slate-950 cursor-pointer"
                      >
                        🛰️ Ver en Tracker
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>👨‍✈️ {ruta.choferAsignado}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badge.bg}`}>
                        {badge.shortLabel}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                        <span>Cumplimiento de Ruta</span>
                        <span className="text-[#B8CD29]">{ruta.avanceRutaPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${ruta.avanceRutaPct}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-[#B8CD29]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
