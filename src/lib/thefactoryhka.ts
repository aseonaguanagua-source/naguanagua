export class TheFactoryHKA {
  private static baseUrl = 'https://demoemisionv2.thefactoryhka.com.ve';
  // En producción estas credenciales deben venir de variables de entorno
  private static user = process.env.TFHKA_USER || 'sqovrqunrqjv_tfhka';
  private static password = process.env.TFHKA_PASSWORD || 'UB!yb7U/r*/?';
  
  private static token: string | null = null;
  private static tokenExpiration: number | null = null;

  /**
   * Obtiene un token JWT válido de The Factory HKA
   */
  static async getToken(): Promise<string> {
    // Si tenemos token válido, lo reusamos
    if (this.token && this.tokenExpiration && Date.now() < this.tokenExpiration) {
      return this.token;
    }

    const response = await fetch(`${this.baseUrl}/api/Autenticacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usuario: this.user,
        clave: this.password
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Error en autenticación HKA: ${response.status} - ${err}`);
    }

    const data = await response.json();
    this.token = data.token;
    // Asumimos 24h de expiración si no viene especificado (o extraer del JWT si es necesario)
    this.tokenExpiration = Date.now() + (23 * 60 * 60 * 1000); 

    return this.token!;
  }

  /**
   * Emite un Documento Electrónico
   */
  static async emitirDocumento(documentoData: any) {
    const token = await this.getToken();

    const response = await fetch(`${this.baseUrl}/api/Emision`, {
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
      throw new Error(`Error en Emisión HKA: ${JSON.stringify(data)}`);
    }

    return data;
  }
}
