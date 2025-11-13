const body = $json.body ?? $json;
if (!body || !Array.isArray(body.entry)) {
  return [];
}
const change = body.entry?.[0]?.changes?.[0]?.value;
if (!change) {
  return [];
}
const message = change.messages?.[0];
if (!message) {
  return [];
}
const contact = change.contacts?.[0] ?? {};
const from = message.from ?? contact.wa_id ?? '';
if (!from) {
  return [];
}
const customerName = contact.profile?.name ?? '';
const phoneNumberId = change.metadata?.phone_number_id ?? '';
const rawText = message.text?.body ?? message.button?.text ?? message.button?.payload ?? message.interactive?.list_reply?.description ?? message.interactive?.button_reply?.title ?? '';
const text = (rawText || '').trim();
const attachments = [];
const addAttachment = (payload, type) => {
  if (!payload?.id) return;
  attachments.push({
    id: payload.id,
    mimeType: payload.mime_type ?? null,
    filename: payload.filename ?? payload.caption ?? `${type}-${payload.id}`,
    type,
  });
};
addAttachment(message.image, 'image');
addAttachment(message.document, 'document');
addAttachment(message.audio, 'audio');
addAttachment(message.video, 'video');
addAttachment(message.sticker, 'sticker');
const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
const clienteEmail = emailMatch ? emailMatch[0] : null;
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const structuredItems = [];
let current = {};
const flushCurrent = () => {
  if (Object.keys(current).length) {
    if (!current.cantidad) current.cantidad = 1;
    if (!current.producto) current.producto = 'Producto sin nombre';
    structuredItems.push(current);
    current = {};
  }
};
for (const line of lines) {
  const lower = line.toLowerCase();
  if (lower.startsWith('producto:')) {
    flushCurrent();
    current.producto = line.split(':').slice(1).join(':').trim() || 'Producto sin nombre';
    continue;
  }
  if (lower.startsWith('cantidad:')) {
    const amount = parseFloat(line.split(':').slice(1).join(':').trim());
    if (!isNa(amount)) current.cantidad = amount;
    continue;
  }
  if (lower.startsWith('material:')) {
    current.variantes = current.variantes ?? {};
    current.variantes.material = line.split(':').slice(1).join(':').trim();
    continue;
  }
  if (lower.startsWith('ancho:')) {
    current.variantes = current.variantes ?? {};
    const width = parseFloat(line.split(':').slice(1).join(':').trim());
    if (!isNa(width)) current.variantes.widthCm = width;
    continue;
  }
  if (lower.startsWith('notas:')) {
    current.notas = line.split(':').slice(1).join(':').trim();
    continue;
  }
  const multi = line.match(/^(\d+(?:[.,]\d+)?)\s*x\s*(.+)$/i);
  if (multi) {
    const cantidad = parseFloat(multi[1].replace(',', '.'));
    structuredItems.push({
      producto: multi[2].trim() || 'Producto sin nombre',
      cantidad: isNaN(cantidad) ? 1 : cantidad,
      notas: `Detectado desde WhatsApp: ${line}`,
    });
    continue;
  }
}
flushCurrent();
if (!structuredItems.length) {
  structuredItems.push({
    producto: 'Solicitud WhatsApp',
    cantidad: 1,
    notas: text || 'Sin detalle',
  });
}
const lower = text.toLowerCase();
let intent = 'cotizacion';
if (lower.includes('estado') || lower.includes('seguimiento')) {
  intent = 'estado';
}
if (lower.includes('pedido directo') || lower.includes('confirmar pedido') || lower.startsWith('pedido ')) {
  intent = 'pedido';
}
const pedidoMatch = lower.match(/(?:pedido|estado)\s*(?:#|n[o0.]*)?\s*(\d{3,})/i);
const pedidoId = pedidoMatch ? pedidoMatch[1] : null;
return [
  {
    json: {
      from,
      phoneNumberId,
      customerName,
      customerEmail: clienteEmail,
      text,
      structuredItems,
      intent,
      pedidoId,
      attachments,
      timestamp: message.timestamp,
      messageId: message.id,
    },
  },
];