/**
 * The Factory HKA — Integración Oficial de Facturación Digital SENIAT (Venezuela)
 * Proveedor Autorizado de Certificación (PAC).
 */

export interface TFHKAConfig {
  baseUrl: string;
  user: string;
  password: string;
  token?: string;
  enabled: boolean;
  backupEmail: string;
  fallbackEmail: string;
}

export class TheFactoryHKA {
  public static isDemoMode(): boolean {
    if (process.env.TFHKA_FORCE_PRODUCTION === 'true') return false;
    if (process.env.TFHKA_FORCE_DEMO === 'true' || process.env.TFHKA_DEMO === 'true') return true;

    // Cualquier despliegue de Preview, Development o Branch en Vercel trabaja estrictamente en DEMO / Sandbox
    if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development') return true;
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview') return true;
    if (process.env.NEXT_PUBLIC_APP_ENV === 'test' || process.env.NEXT_PUBLIC_APP_ENV === 'demo') return true;

    const vUrl = (process.env.VERCEL_URL || '').toLowerCase();
    if (vUrl && !vUrl.includes('naguanagua.globalgreenrec.com')) {
      if (vUrl.includes('git-') || vUrl.includes('vercel.app')) {
        return true;
      }
    }

    // Si existen credenciales explícitas configuradas en TFHKA_USER en entorno de producción
    if (process.env.TFHKA_USER && process.env.TFHKA_USER.trim().length > 0) {
      return false;
    }

    return true;
  }

  public static getBaseUrl(): string {
    if (this.isDemoMode()) {
      return 'https://demoemisionv2.thefactoryhka.com.ve';
    }
    return process.env.TFHKA_URL?.trim() || 'https://emision.thefactoryhka.com.ve';
  }

  public static getUser(): string {
    if (this.isDemoMode()) {
      return process.env.TFHKA_DEMO_USER?.trim() || 'sqovrqunrqjv_tfhka';
    }
    return process.env.TFHKA_USER?.trim() || '';
  }

  public static getPassword(): string {
    if (this.isDemoMode()) {
      return process.env.TFHKA_DEMO_PASSWORD?.trim() || 'UB!yb7U/r*/?';
    }
    return process.env.TFHKA_PASSWORD?.trim() || '';
  }

  public static isEnabled(): boolean {
    return process.env.TFHKA_ENABLED !== 'false';
  }

  public static getBackupEmail(): string {
    return process.env.TFHKA_BACKUP_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';
  }

  public static getFallbackEmail(): string {
    return process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';
  }

  private static token: string | null = null;
  private static tokenExpiration: number | null = null;

  /**
   * Obtiene un token JWT válido de The Factory HKA
   */
  static async getToken(): Promise<string> {
    // Si se especificó un token manual estático en env, usarlo
    if (process.env.TFHKA_TOKEN && process.env.TFHKA_TOKEN.trim().length > 10) {
      return process.env.TFHKA_TOKEN.trim();
    }

    // Reusar token en memoria si aún es válido
    if (this.token && this.tokenExpiration && Date.now() < this.tokenExpiration) {
      return this.token;
    }

    const baseUrl = this.getBaseUrl();
    const usuario = this.getUser();
    const clave = this.getPassword();
    if (!usuario || !clave) {
      throw new Error('Faltan TFHKA_USER / TFHKA_PASSWORD en las variables de entorno.');
    }

    const response = await fetch(`${baseUrl}/api/Autenticacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usuario, clave })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Error en autenticación The Factory HKA (${response.status}): ${err}`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error(`The Factory HKA no retornó token de sesión: ${JSON.stringify(data)}`);
    }

    this.token = data.token;
    // Usar la expiracion real que retorna TFHKA (aprox. 12h), con 5 min de margen
    const exp = data.expiracion ? Date.parse(data.expiracion) : NaN;
    this.tokenExpiration = !isNaN(exp) ? exp - 5 * 60 * 1000 : Date.now() + (11 * 60 * 60 * 1000);

    return this.token!;
  }

  /**
   * Verifica la conexión y validez de las credenciales con The Factory HKA
   */
  static async verificarConexion(): Promise<{
    ok: boolean;
    message: string;
    url: string;
    usuario: string;
    isProduction: boolean;
    tokenPreview?: string;
  }> {
    const url = this.getBaseUrl();
    const usuario = this.getUser();
    const isProduction = !url.toLowerCase().includes('demo');

    try {
      const token = await this.getToken();
      return {
        ok: true,
        message: 'Conexión exitosa con el servicio de The Factory HKA.',
        url,
        usuario,
        isProduction,
        tokenPreview: `${token.substring(0, 16)}...`
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err.message || 'Error al conectar con The Factory HKA',
        url,
        usuario,
        isProduction
      };
    }
  }

  /**
   * Emite un Documento Electrónico (Factura Fiscal) hacia The Factory HKA
   */
  static async emitirDocumento(documentoData: any) {
    const token = await this.getToken();
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/Emision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        documentoElectronico: documentoData
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Error en Emisión The Factory HKA (${response.status}): ${JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Último número de documento emitido en TFHKA.
   * Devuelve: número (>=0; 0 = nunca ha emitido) o null si no se pudo consultar
   * (p.ej. código 99: límite de 1 consulta cada 30 s).
   */
  static async ultimoDocumento(serie: string = '', tipoDocumento: string = '01'): Promise<number | null> {
    try {
      const token = await this.getToken();
      const response = await fetch(`${this.getBaseUrl()}/api/UltimoDocumento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ serie, tipoDocumento }),
      });
      const data: any = await response.json().catch(() => ({}));
      if (data?.codigo === '200' || data?.numeroDocumento) {
        const n = parseInt(String(data.numeroDocumento ?? data.resultado?.numeroDocumento ?? ''), 10);
        return Number.isFinite(n) ? n : null;
      }
      const val = JSON.stringify(data?.validaciones || '').toLowerCase();
      if (data?.codigo === '203' && val.includes('no ha emitido')) return 0;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Descarga el PDF oficial de un documento emitido (api/DescargaArchivo).
   * En The Factory HKA Venezuela, DescargaArchivo requiere el Número de Control (ej: '00-00000188' -> '0000000188').
   * Se prueban tanto el número de control formateado como el número de documento para máxima compatibilidad.
   */
  static async descargarPdf(numeroDocumento: string | number, serie: string = '', tipoDocumento: string = '01', numeroControl?: string): Promise<Buffer | null> {
    try {
      const token = await this.getToken();
      const candidates: string[] = [];
      const strDoc = String(numeroDocumento || '').trim();
      if (strDoc) {
        const cleanDoc = strDoc.replace(/-/g, '').trim();
        if (/^\d+$/.test(cleanDoc) && cleanDoc.length <= 10) {
          candidates.push(cleanDoc.padStart(10, '0'));
        }
        candidates.push(strDoc);
      }

      if (numeroControl) {
        const cleanCtrl = String(numeroControl).replace(/-/g, '').trim();
        if (cleanCtrl) candidates.push(cleanCtrl.padStart(10, '0'));
      }

      for (const cand of Array.from(new Set(candidates))) {
        try {
          const response = await fetch(`${this.getBaseUrl()}/api/DescargaArchivo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ serie, tipoDocumento, numeroDocumento: cand, tipoArchivo: 'PDF' }),
          });
          const data: any = await response.json().catch(() => ({}));
          if (data?.archivo) {
            return Buffer.from(data.archivo, 'base64');
          }
        } catch (_) {}
      }
      return null;
    } catch {
      return null;
    }
  }
}
