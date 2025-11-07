
import { Router } from 'express';
import * as catalogoController from './catalogo.controller';

const router = Router();

router.get('/', catalogoController.getOffers);

export default router;
