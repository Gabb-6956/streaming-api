const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Cache en memoria
const cache = new Map();
const CACHE_TIME = 30 * 60 * 1000; // 30 minutos

// HEADERS para parecer navegador real
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-ES,es;q=0.9'
};

// ==============================================
// FUENTE 1: LA.MOVIE
// ==============================================
async function scrapeLaMovie(query) {
    try {
        const url = `https://la.movie/search?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        const results = [];
        $('.movie-card, article, .item').each((i, el) => {
            const title = $(el).find('h2, h3, .title').text().trim();
            const link = $(el).find('a').attr('href');
            const poster = $(el).find('img').attr('src');
            const year = $(el).find('.year, .date').text().trim();
            
            if (title && link) {
                results.push({
                    title,
                    url: link.startsWith('http') ? link : `https://la.movie${link}`,
                    poster: poster || 'https://via.placeholder.com/200x300',
                    year: year || '2026',
                    source: 'LaMovie'
                });
            }
        });
        return results;
    } catch (error) {
        console.error('Error LaMovie:', error.message);
        return [];
    }
}

// ==============================================
// FUENTE 2: ALLCALIDAD.RE
// ==============================================
async function scrapeAllCalidad(query) {
    try {
        const url = `https://allcalidad.re/search/${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        const results = [];
        $('.movie-item, .post, article').each((i, el) => {
            const title = $(el).find('.title, h2, h3').text().trim();
            const link = $(el).find('a').attr('href');
            const poster = $(el).find('img').attr('src');
            
            if (title && link) {
                results.push({
                    title,
                    url: link.startsWith('http') ? link : `https://allcalidad.re${link}`,
                    poster: poster || 'https://via.placeholder.com/200x300',
                    source: 'AllCalidad'
                });
            }
        });
        return results;
    } catch (error) {
        console.error('Error AllCalidad:', error.message);
        return [];
    }
}

// ==============================================
// FUENTE 3: PELISPLUSHD.LA
// ==============================================
async function scrapePelisPlus(query) {
    try {
        const url = `https://www.pelisplushd.la/buscar/${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        const results = [];
        $('article, .item, .movie').each((i, el) => {
            const title = $(el).find('h2, .title, .name').text().trim();
            const link = $(el).find('a').attr('href');
            const poster = $(el).find('img').attr('src');
            
            if (title && link) {
                results.push({
                    title,
                    url: link.startsWith('http') ? link : `https://www.pelisplushd.la${link}`,
                    poster: poster || 'https://via.placeholder.com/200x300',
                    source: 'PelisPlus'
                });
            }
        });
        return results;
    } catch (error) {
        console.error('Error PelisPlus:', error.message);
        return [];
    }
}

// ==============================================
// FUENTE 4: CUEVANA.GS
// ==============================================
async function scrapeCuevana(query) {
    try {
        const url = `https://cuevana.gs/search?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        const results = [];
        $('.movie, .item, article').each((i, el) => {
            const title = $(el).find('.title, h2, h3').text().trim();
            const link = $(el).find('a').attr('href');
            const poster = $(el).find('img').attr('src');
            
            if (title && link) {
                results.push({
                    title,
                    url: link.startsWith('http') ? link : `https://cuevana.gs${link}`,
                    poster: poster || 'https://via.placeholder.com/200x300',
                    source: 'Cuevana'
                });
            }
        });
        return results;
    } catch (error) {
        console.error('Error Cuevana:', error.message);
        return [];
    }
}

// ==============================================
// ENDPOINT DE BÚSQUEDA
// ==============================================
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Falta query' });
    
    // Verificar cache
    if (cache.has(query)) {
        const cached = cache.get(query);
        if (Date.now() - cached.time < CACHE_TIME) {
            console.log('✅ Sirviendo desde cache:', query);
            return res.json(cached.data);
        }
    }
    
    console.log(`🔍 Buscando: ${query}`);
    
    // Ejecutar scrapers en paralelo
    const [laMovie, allCalidad, pelisPlus, cuevana] = await Promise.all([
        scrapeLaMovie(query),
        scrapeAllCalidad(query),
        scrapePelisPlus(query),
        scrapeCuevana(query)
    ]);
    
    // Combinar resultados
    const allResults = [...laMovie, ...allCalidad, ...pelisPlus, ...cuevana];
    
    console.log(`✅ Encontrados: ${allResults.length} resultados`);
    
    // Guardar en cache
    cache.set(query, {
        data: allResults,
        time: Date.now()
    });
    
    res.json(allResults);
});

// ==============================================
// ENDPOINT PARA EXTRAER VIDEOS
// ==============================================
app.get('/api/video', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Falta url' });
    
    try {
        console.log(`🎬 Extrayendo video de: ${url}`);
        
        const { data } = await axios.get(url, { 
            headers,
            timeout: 10000 
        });
        
        const $ = cheerio.load(data);
        const videos = [];
        
        // Buscar iframes de video
        $('iframe').each((i, el) => {
            const src = $(el).attr('src');
            if (src && (src.includes('player') || src.includes('embed') || 
                       src.includes('netu') || src.includes('hydrax') || 
                       src.includes('mega') || src.includes('ok'))) {
                
                let server = 'AllCalidad';
                if (src.includes('netu')) server = 'NetU';
                else if (src.includes('hydrax')) server = 'Hydrax';
                else if (src.includes('mega')) server = 'Mega';
                else if (src.includes('ok')) server = 'OK';
                
                videos.push({
                    url: src.startsWith('http') ? src : `https:${src}`,
                    server: server,
                    quality: 'HD',
                    type: 'iframe'
                });
            }
        });
        
        // Buscar video directo
        $('video source, .video-player source').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.match(/\.(mp4|mkv|m3u8|webm)/)) {
                videos.push({
                    url: src.startsWith('http') ? src : `https:${src}`,
                    server: 'Directo',
                    quality: '1080p',
                    type: 'direct'
                });
            }
        });
        
        if (videos.length > 0) {
            res.json(videos);
        } else {
            res.json([{ error: 'No se encontraron videos en esta página' }]);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==============================================
// ENDPOINT DE PRUEBA
// ==============================================
app.get('/', (req, res) => {
    res.json({
        status: '🚀 Servidor funcionando',
        endpoints: {
            search: '/api/search?q=spiderman',
            video: '/api/video?url=https://la.movie/pelicula/123'
        },
        fuentes: ['LaMovie', 'AllCalidad', 'PelisPlus', 'Cuevana']
    });
});

// ==============================================
// INICIAR SERVIDOR
// ==============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════╗
    ║   🚀 SERVIDOR STREAMING ACTIVO     ║
    ╠════════════════════════════════════╣
    ║  Puerto: ${PORT}                         ║
    ║  Fuentes: LaMovie, AllCalidad       ║
    ║          PelisPlus, Cuevana        ║
    ╚════════════════════════════════════╝
    `);
});