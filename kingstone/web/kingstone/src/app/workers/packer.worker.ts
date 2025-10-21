import { packPolygons, PackableItem, PackOptions } from '../utils/polygon-packer';

type IncomingMessage = {
  id: number;
  items: Array<PackableItem<any>>;
  options: PackOptions;
};

type WorkerResponse<TMeta = unknown> =
  | { id: number; type: 'success'; placements: ReturnType<typeof packPolygons<TMeta>>['placements']; usedHeight: number }
  | { id: number; type: 'error'; message: string };

addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
  try {
    const { id, items, options } = event.data || {};
    const result = packPolygons(items ?? [], options ?? { rollWidthCm: 1 });
    const response: WorkerResponse = {
      id,
      type: 'success',
      placements: result.placements,
      usedHeight: result.usedHeight
    };
    postMessage(response);
  } catch (error: any) {
    const response: WorkerResponse = {
      id: event.data?.id ?? -1,
      type: 'error',
      message: error?.message || 'packing_failed'
    };
    postMessage(response);
  }
});
