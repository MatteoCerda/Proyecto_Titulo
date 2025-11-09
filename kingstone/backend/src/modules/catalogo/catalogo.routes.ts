
import { Router } from 'express';
import * as catalogoController from './catalogo.controller';

const router = Router();

router.get('/', catalogoController.getCatalog);
router.get('/:id', catalogoController.getCatalogItem);

export default router;
