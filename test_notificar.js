"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var thefactoryhka_1 = require("./src/lib/thefactoryhka");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var valuesToTest, fechaActual, pad, fechaFmt, horaStr, _i, valuesToTest_1, val, mockDocument, tfhkaResponse, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    valuesToTest = ["SI", "Si", "S", "true", "True", "TRUE", "yes", "Yes", "Y"];
                    fechaActual = new Date();
                    pad = function (n) { return String(n).padStart(2, '0'); };
                    fechaFmt = "".concat(pad(fechaActual.getDate()), "/").concat(pad(fechaActual.getMonth() + 1), "/").concat(fechaActual.getFullYear());
                    horaStr = fechaActual.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
                    _i = 0, valuesToTest_1 = valuesToTest;
                    _a.label = 1;
                case 1:
                    if (!(_i < valuesToTest_1.length)) return [3 /*break*/, 6];
                    val = valuesToTest_1[_i];
                    mockDocument = {
                        Encabezado: {
                            IdentificacionDocumento: {
                                TipoDocumento: "01",
                                NumeroDocumento: String(Math.floor(Math.random() * 99999999)).padStart(8, '0'),
                                TipoProveedor: null,
                                TipoTransaccion: null,
                                FechaEmision: fechaFmt,
                                FechaVencimiento: fechaFmt,
                                HoraEmision: horaStr,
                                Anulado: false,
                                TipoDePago: "Inmediato",
                                Serie: "",
                                Sucursal: "",
                                TipoDeVenta: "Interna"
                            },
                            Vendedor: null,
                            Comprador: {
                                TipoIdentificacion: "J",
                                NumeroIdentificacion: "123456789",
                                RazonSocial: "EMPRESA DE PRUEBA C.A.",
                                Direccion: "AVENIDA UNIVERSIDAD NAGUANAGUA",
                                Ubigeo: null,
                                Pais: "VE",
                                Notificar: val,
                                Telefono: [],
                                Correo: ["aseonaguanagua@globalgreenca.com"],
                                OtrosEnvios: null
                            },
                            SujetoRetenido: null,
                            Tercero: null,
                            Totales: {
                                NroItems: "1",
                                MontoGravadoTotal: "100.00",
                                MontoExentoTotal: "0.00",
                                MontoPercibidoTotal: "0.00",
                                SubtotalAntesDescuento: "100.00",
                                TotalDescuento: null,
                                TotalRecargos: null,
                                Subtotal: "100.00",
                                TotalIVA: "16.00",
                                MontoTotalConIVA: "116.00",
                                TotalAPagar: "116.00",
                                MontoEnLetras: "CIENTO DIECISEIS BOLIVARES CON 00/100",
                                ImpuestosSubtotal: [
                                    {
                                        CodigoTotalImp: "G",
                                        AlicuotaImp: "16.00",
                                        BaseImponibleImp: "100.00",
                                        ValorTotalImp: "16.00"
                                    }
                                ],
                                FormasPago: [
                                    {
                                        Descripcion: "Pago",
                                        Fecha: fechaFmt,
                                        Forma: "01",
                                        Monto: "116.00",
                                        Moneda: "VES",
                                        TipoCambio: "0.0000"
                                    }
                                ]
                            }
                        },
                        DetallesItems: [
                            {
                                NumeroLinea: "1",
                                CodigoCIIU: "0198",
                                CodigoPLU: "ASEO001",
                                IndicadorBienoServicio: "2",
                                Descripcion: "Servicio de Aseo Urbano - PRUEBA",
                                Cantidad: "1",
                                UnidadMedida: "NIU",
                                PrecioUnitario: "100.00",
                                PrecioUnitarioDescuento: null,
                                MontoBonificacion: null,
                                DescripcionBonificacion: null,
                                DescuentoMonto: "0.00",
                                RecargoMonto: "0",
                                PrecioItem: "100.00",
                                PrecioAntesDescuento: "100.00",
                                CodigoImpuesto: "G",
                                TasaIVA: "16.00",
                                ValorIVA: "16.00",
                                ValorTotalItem: "116.00",
                                InfoAdicionalItem: [],
                                ListaItemOTI: null
                            }
                        ]
                    };
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, thefactoryhka_1.TheFactoryHKA.emitirDocumento(mockDocument)];
                case 3:
                    tfhkaResponse = _a.sent();
                    console.log("Success with value: ".concat(val));
                    console.log(tfhkaResponse);
                    return [3 /*break*/, 6];
                case 4:
                    e_1 = _a.sent();
                    console.log("Failed with value: ".concat(val));
                    console.log(e_1.message);
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/];
            }
        });
    });
}
main();
