// api/value.js — Vaci: identifica y tasa un objeto con Groq vision (Llama 4 Scout)
// ENV en Vercel: GROQ_API_KEY
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta GROQ_API_KEY' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const image = body && body.image;
  if (!image || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return res.status(400).json({ error: 'Imagen inválida' });
  if (image.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Imagen demasiado grande' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 240,
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text:
`Eres un tasador profesional de segunda mano en España (Wallapop, Catawiki, Todocoleccion, Cash Converters).
Identifica el objeto principal de la foto y tásalo para venta REAL de segunda mano en España hoy.
Responde SOLO con JSON válido, sin markdown, con esta forma exacta:
{"nombre":"<específico, máx 6 palabras, español>","categoria":"<Mueble|Electrodoméstico|Electrónica|Arte|Joyería|Libros|Decoración|Ropa|Deporte|Herramientas|Otro>","valor_min":<entero €>,"valor_max":<entero €>,"confianza":"<alta|media|baja>"}
Reglas: precios conservadores de venta real (no de tienda). Si es genérico o sin valor de reventa: 0-0. "confianza" alta solo si identificas marca/modelo o el tipo es muy estandarizado; baja si es arte, antigüedad o no estás seguro.` },
            { type: 'image_url', image_url: { url: image } }
          ]
        }]
      })
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: 'Groq error', detail: t.slice(0, 200) }); }
    const data = await r.json();
    let txt = (data.choices?.[0]?.message?.content) || '';
    txt = txt.replace(/```json|```/g, '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ nombre: null });
    const out = JSON.parse(m[0]);
    res.status(200).json({
      nombre: String(out.nombre || '').slice(0, 80),
      categoria: String(out.categoria || 'Otro').slice(0, 40),
      valor_min: Math.max(0, Math.min(999999, parseInt(out.valor_min) || 0)),
      valor_max: Math.max(0, Math.min(999999, parseInt(out.valor_max) || 0)),
      confianza: ['alta','media','baja'].includes(out.confianza) ? out.confianza : 'media'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
