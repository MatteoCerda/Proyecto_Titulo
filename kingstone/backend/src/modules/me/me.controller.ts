
import { Request, Response } from 'express';
import * as meService from './me.service';

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const user = await meService.getUserProfile(id);
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error interno' });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).user?.sub);
    const { fullName } = req.body || {};
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const user = await meService.updateUserProfile(id, fullName);
    res.json({ user });
  } catch (e: any) {
    if (e.message === 'Usuario no encontrado') return res.status(404).json({ message: e.message });
    if (e.message === 'Nombre inválido') return res.status(400).json({ message: e.message });
    res.status(500).json({ message: 'Error interno' });
  }
};

export const updateUserPassword = async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).user?.sub);
    const { currentPassword, newPassword } = req.body || {};
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    await meService.updateUserPassword(id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Usuario no encontrado') return res.status(404).json({ message: e.message });
    if (e.message.startsWith('Contraseña')) return res.status(400).json({ message: e.message });
    res.status(500).json({ message: 'Error interno' });
  }
};

export const getClientProfile = async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const profile = await meService.getClientProfile(id);
    res.json({ profile });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error interno' });
  }
};

export const upsertClientProfile = async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const profile = await meService.upsertClientProfile(id, req.body);
    res.json({ profile });
  } catch (e: any) {
    if (e.message === 'Usuario no encontrado') return res.status(404).json({ message: e.message });
    res.status(500).json({ message: e.message || 'Error interno' });
  }
};
