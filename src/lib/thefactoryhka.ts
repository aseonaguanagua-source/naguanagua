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
  public static getBaseUrl(): string {
    return process.env.TFHKA_URL?.trim() || 'https://emision.thefactoryhka.com.ve';
  }

  public static getUser(): string {
    return process.env.TFHKA_USER?.trim() || 'dvktexcnjbjn_tfhka';
  }

  public static getPassword(): string {
    return process.env.TFHKA_PASSWORD?.trim() || 'Qf*ILuU;QG-Y';
  }

  public static isEnabled(): boolean {
    return process.env.TFHKA_ENABLED !== 'false';
  }

  public static getBackupEmail(): string {
    return process.env.TFHKA_BACKUP_EMAIL?.trim() || 'facturacion.naguanagua@gmail.com';
  }

  public static getFallbackEmail(): string {
    return process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.naguanagua@gmail.com';
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
    // Asumir 23 horas de vigencia
    this.tokenExpiration = Date.now() + (23 * 60 * 60 * 1000);

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
}
