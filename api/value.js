// api/value.js — tasación de objetos con Groq vision (Llama 4 Scout)
// ENV necesaria en Vercel: GROQ_API_KEY
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
        max_tokens: 220,
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text:
`Eres un tasador profesional de objetos de segunda mano en España (mercado: Wallapop, Catawiki, Todocoleccion).
Identifica el objeto principal de la foto y tásalo para venta de segunda mano en España.
Responde SOLO con JSON válido, sin markdown ni texto extra, con esta forma exacta:
{"nombre":"<nombre corto y específico, máx 6 palabras, en español>","categoria":"<Mueble|Electrodoméstico|Arte|Joyería|Libros|Decoración|Electrónica|Ropa|Otro>","valor_min":<entero euros>,"valor_max":<entero euros>}
Sé realista y conservador: precios de venta REAL de segunda mano, no de tienda. Si el objeto no tiene valor de reventa, usa 0-0.` },
            { type: 'image_url', image_url: { url: image } }
          ]
        }]
      })
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: 'Groq error', detail: t.slice(0, 200) }); }
    const data = await r.json();
    let txt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    txt = txt.replace(/```json|```/g, '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ nombre: null });
    const out = JSON.parse(m[0]);
    res.status(200).json({
      nombre: String(out.nombre || '').slice(0, 80),
      categoria: String(out.categoria || 'Otro').slice(0, 40),
      valor_min: Math.max(0, Math.min(999999, parseInt(out.valor_min) || 0)),
      valor_max: Math.max(0, Math.min(999999, parseInt(out.valor_max) || 0))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
