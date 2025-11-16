"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOffers = exports.getCatalogItem = exports.getCatalog = void 0;
const catalogoService = __importStar(require("./catalogo.service"));
const getCatalog = async (req, res) => {
    try {
        const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const tipo = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';
        const catalogo = await catalogoService.getCatalog(search, tipo);
        res.json(catalogo);
    }
    catch (error) {
        console.error('Error obteniendo catálogo', error);
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.getCatalog = getCatalog;
const getCatalogItem = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ message: 'ID invalido' });
        }
        const item = await catalogoService.getCatalogItem(id);
        res.json(item);
    }
    catch (error) {
        if (error.message === 'Producto no encontrado') {
            return res.status(404).json({ message: error.message });
        }
        console.error('Error obteniendo producto', error);
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.getCatalogItem = getCatalogItem;
const getOffers = async (_req, res) => {
    try {
        const offers = await catalogoService.getOffers();
        res.json(offers);
    }
    catch (error) {
        console.error('Error obteniendo ofertas', error);
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.getOffers = getOffers;
