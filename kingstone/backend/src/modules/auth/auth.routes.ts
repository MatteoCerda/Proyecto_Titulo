import { Router } from 'express';
import { postRegister, postLogin } from './auth.controller';

const router = Router();
router.post('/register', postRegister);
router.post('/login', postLogin);
export default router;
