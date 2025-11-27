import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sistema de caché simple en memoria
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutos

// Función para obtener el nombre de la tienda desde la URL
const getStoreName = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('shein')) return 'shein';
    if (hostname.includes('zara')) return 'zara';
    if (hostname.includes('hm') || hostname.includes('h&m')) return 'hm';
    if (hostname.includes('forever21')) return 'forever21';
    if (hostname.includes('amazon')) return 'amazon';
    if (hostname.includes('aliexpress')) return 'aliexpress';
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : hostname;
  } catch {
    return 'unknown';
  }
};

// Función para limpiar y procesar URL de imagen
const processImageUrl = (imgUrl: string | undefined | null, baseUrl: string): string => {
  if (!imgUrl || imgUrl === 'null' || imgUrl === 'undefined' || imgUrl.trim() === '') {
    return '';
  }
  
  let url = imgUrl.trim();
  
  // Remover escapes y caracteres extraños
  url = url.replace(/\\/g, '');
  
  // Si empieza con //, añadir https:
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  
  // Si es relativa, añadir baseUrl
  if (url.startsWith('/') && !url.startsWith('//')) {
    url = baseUrl + url;
  }
  
  // Verificar que sea una URL válida
  try {
    new URL(url);
    return url;
  } catch {
    return '';
  }
};

// Función para extraer imágenes directamente del HTML (backup)
const extractImagesFromHtml = (html: string, baseUrl: string): string[] => {
  const images: string[] = [];
  
  // Patrones para encontrar URLs de imágenes
  const patterns = [
    /data-src=["']([^"']+)["']/gi,
    /data-lazy-src=["']([^"']+)["']/gi,
    /data-original=["']([^"']+)["']/gi,
    /data-url=["']([^"']+)["']/gi,
    /data-image-src=["']([^"']+)["']/gi,
    /src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const imgUrl = processImageUrl(match[1], baseUrl);
      if (imgUrl && !images.includes(imgUrl)) {
        images.push(imgUrl);
      }
    }
  }
  
  return images.slice(0, 100); // Máximo 100 imágenes
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls, season = 'todos', categories = 'todos', language = 'es' } = await req.json();
    console.log('📥 Input:', { urls, season, categories, language });

    // Verificar caché primero
    const cacheKey = `${urls.join('|')}|${season}|${categories}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('🎯 Returning cached results');
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!urls || urls.length === 0) {
      throw new Error('At least one URL is required');
    }

    const SCRAPERAPI_KEY = Deno.env.get('SCRAPERAPI_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!SCRAPERAPI_KEY) {
      console.error('❌ SCRAPERAPI_KEY no configurada');
      throw new Error('SCRAPERAPI_KEY not configured');
    }

    if (!LOVABLE_API_KEY) {
      console.error('❌ LOVABLE_API_KEY no configurada');
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Procesar todas las URLs
    const analysisPromises = urls.map(async (url: string) => {
      try {
        const storeName = getStoreName(url);
        const baseUrl = new URL(url).origin;
        console.log(`🏪 Analyzing: ${storeName} - ${url}`);

        // Usar ScraperAPI con configuración optimizada
        console.log(`🔧 Fetching with ScraperAPI...`);
        const targetUrl = encodeURIComponent(url);
        const scraperUrl = `http://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=${targetUrl}&render=true&device_type=desktop&wait_for_selector=.product-card,.product-item,.S-product-card,img`;
        
        const scraperResp = await fetch(scraperUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });
        
        if (!scraperResp.ok) {
          console.error(`❌ ScraperAPI error: ${scraperResp.status}`);
          throw new Error(`ScraperAPI failed: ${scraperResp.status}`);
        }
        
        const rawHtml = await scraperResp.text();
        console.log(`✅ HTML fetched: ${rawHtml.length} chars`);

        if (rawHtml.length < 3000) {
          console.error(`❌ HTML too short`);
          throw new Error('HTML content too short');
        }

        // Extraer imágenes del HTML como backup
        const backupImages = extractImagesFromHtml(rawHtml, baseUrl);
        console.log(`📸 Found ${backupImages.length} images in HTML`);

        // Limpiar HTML para el LLM
        const cleanHtml = rawHtml
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<svg[\s\S]*?<\/svg>/gi, '')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Tomar una porción más grande del HTML
        const htmlForAnalysis = cleanHtml.slice(0, 200000);

        const langLabel = language === 'en' ? 'English' : language === 'zh' ? '中文' : 'Español';

        const systemPrompt = `Eres un experto en scraping de e-commerce. Tu trabajo es extraer productos del HTML.
REGLAS CRÍTICAS:
1. Devuelve SOLO JSON válido, sin texto adicional
2. Extrae 25-50 productos DIFERENTES
3. Las recomendaciones deben estar en ${langLabel}
4. Si no encuentras imagen, usa "" (string vacío)
5. NUNCA descartes un producto por no tener imagen`;

        const userPrompt = `Extrae productos de este sitio de ${storeName}. 

🎯 OBJETIVO: 25-50 productos únicos con variedad

📸 IMÁGENES - BUSCA EN ESTE ORDEN:
1. data-src="..."
2. data-lazy-src="..."  
3. data-original="..."
4. data-image-src="..."
5. src="..." (si contiene .jpg, .png, .webp)
6. Si URL empieza con // → añade https:
7. Si es relativa /path → añade ${baseUrl}
8. Si no hay imagen → usa "" (NUNCA descartes el producto)

💰 PRECIOS:
- Busca precios en formato $XX.XX, €XX.XX, XX€
- Incluye moneda original

🏷️ COLORES Y TALLAS:
- Extrae si están disponibles
- Si no hay, usa arrays vacíos []

📊 TREND SCORE (1-10):
- 9-10: Muy tendencia, bestseller
- 7-8: Popular, buenas ventas
- 5-6: Normal
- <5: Básico

🔴 PRIORIDAD:
- "high": trend_score >= 8
- "medium": trend_score >= 6
- "low": trend_score < 6

URL: ${url}
BASE: ${baseUrl}
TIENDA: ${storeName}

Imágenes encontradas en HTML (úsalas como referencia):
${backupImages.slice(0, 20).join('\n')}

HTML COMPLETO:
${htmlForAnalysis}

RESPONDE SOLO CON ESTE JSON:
{
  "products": [
    {
      "title": "Nombre del producto",
      "price": "$XX.XX",
      "colors": ["Negro", "Blanco"],
      "sizes": ["S", "M", "L"],
      "image": "https://...",
      "trend_score": 8.5,
      "recommendation": "Explicación en ${langLabel}",
      "priority": "high"
    }
  ]
}`;

        console.log(`🤖 Calling Lovable AI...`);
        
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 16000,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`❌ AI error ${response.status}: ${errText}`);
          throw new Error(`AI failed: ${response.status}`);
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        
        // Limpiar respuesta
        content = content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/^\s*{\s*"products"/, '{"products"')
          .trim();

        // Intentar parsear JSON
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          // Intentar encontrar JSON válido en la respuesta
          const jsonMatch = content.match(/\{[\s\S]*"products"[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            console.error('❌ Could not parse AI response');
            throw new Error('Invalid AI response');
          }
        }

        console.log(`✅ Parsed ${parsed.products?.length || 0} products from AI`);

        // Procesar productos
        const products = (parsed.products || []).map((p: any, index: number) => {
          // Procesar imagen
          let imageUrl = processImageUrl(p.image, baseUrl);
          
          // Si no hay imagen, intentar usar una del backup
          if (!imageUrl && backupImages[index]) {
            imageUrl = backupImages[index];
          }

          return {
            title: String(p.title || 'Producto').slice(0, 150),
            price: String(p.price || 'N/A'),
            colors: Array.isArray(p.colors) ? p.colors : [],
            sizes: Array.isArray(p.sizes) ? p.sizes : [],
            image: imageUrl,
            trend_score: Math.min(10, Math.max(1, Number(p.trend_score) || 5)),
            recommendation: String(p.recommendation || ''),
            priority: ['high', 'medium', 'low'].includes(p.priority) ? p.priority : 'medium',
            store: storeName,
            store_url: url,
          };
        });

        console.log(`📦 Processed ${products.length} products for ${storeName}`);
        return { url, products, storeName };

      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error);
        return { url, products: [], storeName: getStoreName(url), error: String(error) };
      }
    });

    // Esperar resultados
    const allResults = await Promise.all(analysisPromises);

    // Combinar productos
    let allProducts = allResults.flatMap(r => r.products);
    console.log(`📊 Total products before dedup: ${allProducts.length}`);

    // Deduplicación
    const uniqueProducts: any[] = [];
    const seenTitles = new Set<string>();
    const seenImages = new Set<string>();
    
    for (const product of allProducts) {
      const normalizedTitle = product.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
      const imageKey = product.image?.toLowerCase().split('?')[0] || '';
      
      const titleExists = seenTitles.has(normalizedTitle);
      const imageExists = imageKey && seenImages.has(imageKey);
      
      if (!titleExists && !imageExists) {
        uniqueProducts.push(product);
        seenTitles.add(normalizedTitle);
        if (imageKey) seenImages.add(imageKey);
      }
    }

    console.log(`✅ Unique products: ${uniqueProducts.length}`);

    // Ordenar por trend_score
    uniqueProducts.sort((a, b) => b.trend_score - a.trend_score);

    // Calcular resumen
    const totalProducts = uniqueProducts.length;
    const avgScore = totalProducts > 0 
      ? uniqueProducts.reduce((sum, p) => sum + p.trend_score, 0) / totalProducts 
      : 0;
    const recommendedImport = uniqueProducts.filter(p => p.priority === 'high').length;

    const finalResult = {
      urls,
      products: uniqueProducts,
      summary: {
        total_products: totalProducts,
        avg_trend_score: Number(avgScore.toFixed(1)),
        recommended_import: recommendedImport,
        stores_analyzed: urls.length
      }
    };

    // Guardar en caché
    cache.set(cacheKey, { data: finalResult, timestamp: Date.now() });
    console.log('💾 Cached results');

    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Analysis failed',
        details: String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
