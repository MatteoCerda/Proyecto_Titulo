
import { Request, Response } from 'express';
import * as catalogoService from './catalogo.service';

export const getCatalog = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';
    const catalogo = await catalogoService.getCatalog(search, tipo);
    res.json(catalogo);
  } catch (error) {
    console.error('Error obteniendo catálogo', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

export const getCatalogItem = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const item = await catalogoService.getCatalogItem(id);
    res.json(item);
  } catch (error: any) {
    if (error.message === 'Producto no encontrado') {
      return res.status(404).json({ message: error.message });
    }
    console.error('Error obteniendo producto', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

export const getOffers = async (_req: Request, res: Response) => {
  try {
    const offers = await catalogoService.getOffers();
    res.json(offers);
  } catch (error) {
    console.error('Error obteniendo ofertas', error);
    res.status(500).json({ message: 'Error interno' });
  }
};
