'use strict';

// =====================================================================
//  ASISTENTE DE VOZ - esfera reactiva, cámara con dedos, 3D, investigación
// =====================================================================

const $ = (id) => document.getElementById(id);

// Si algo falla, el error se muestra en rojo arriba de la pantalla
window.addEventListener('error', (e) => {
  const b = document.getElementById('errorPantalla');
  if (b) { b.style.display = 'block'; b.textContent = 'Error: ' + e.message + ' (línea ' + e.lineno + ')'; }
});

// Carga una librería de internet solo cuando hace falta (así la página nunca se queda esperando)
const _librerias = {};
function cargarScript(url) {
  if (_librerias[url]) return _librerias[url];
  _librerias[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.crossOrigin = 'anonymous';
    const limite = setTimeout(() => { delete _librerias[url]; reject(new Error('tiempo agotado')); }, 20000);
    s.onload = () => { clearTimeout(limite); resolve(); };
    s.onerror = () => { clearTimeout(limite); delete _librerias[url]; reject(new Error('no se pudo cargar')); };
    document.head.appendChild(s);
  });
  return _librerias[url];
}

function leer(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

const cfg = {
  nombre: leer('nombre', 'Jarvis'),
  usuario: leer('usuario', 'amigo'),
  color: leer('color', '#00e5ff'),
  voz: leer('voz', ''),
  claveIA: leer('claveIA', ''),
  institucion: leer('institucion', ''),
  proyecto: leer('proyecto', 'Asistente personal de voz')
};

const esOpera = /OPR\//.test(navigator.userAgent);
let escuchando = false;
let hablando = false;
let reconocimiento = null;
let voces = [];
let modo = 'reposo';
let nivelMic = 0;

// ---------------------------------------------------------------------
//  UTILIDADES
// ---------------------------------------------------------------------
function normalizar(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)\s*!/g, '$1 factorial ')
    .replace(/(\d),(?=\d)/g, '$1\u0001').replace(/(\d)\.(?=\d)/g, '$1\u0002')
    .replace(/[¿?¡!,.;:]/g, ' ')
    .replace(/\u0001/g, ',').replace(/\u0002/g, '.')
    .replace(/\s+/g, ' ').trim();
}

function escaparRegex(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setModo(m) {
  modo = m;
  const textos = { reposo: 'En espera', escuchando: 'Escuchando', hablando: 'Respondiendo', pensando: 'Pensando' };
  $('estado').textContent = textos[m] || '';
}

function aplicarConfig() {
  document.documentElement.style.setProperty('--color', cfg.color);
  $('nombre').textContent = cfg.nombre.toUpperCase();
  document.title = cfg.nombre + ' - Asistente';
}

function mostrarRespuesta(t) { $('respuesta').textContent = t; }
function mostrarTuVoz(t) { $('tuvoz').textContent = t ? '“' + t + '”' : ''; }

setInterval(() => { $('reloj').textContent = new Date().toLocaleTimeString('es-ES'); }, 1000);

// ---------------------------------------------------------------------
//  ESFERA (canvas)
// ---------------------------------------------------------------------
const lienzo = $('orbe');
const ctxO = lienzo.getContext('2d');
let W = 0, H = 0, nivel = 0, ox = window.innerWidth / 2;

function ajustarLienzo() {
  const d = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  lienzo.width = W * d; lienzo.height = H * d;
  ctxO.setTransform(d, 0, 0, d, 0, 0);
}
window.addEventListener('resize', ajustarLienzo);
ajustarLienzo();

function dibujar(ms) {
  requestAnimationFrame(dibujar);
  const s = ms / 1000;

  let objetivo;
  if (modo === 'hablando') objetivo = 0.30 + 0.30 * Math.abs(Math.sin(s * 6.5)) * (0.65 + 0.35 * Math.sin(s * 2.7));
  else if (modo === 'escuchando') objetivo = Math.max(nivelMic, 0.05 + 0.02 * Math.sin(s * 2));
  else if (modo === 'pensando') objetivo = 0.12 + 0.08 * Math.sin(s * 9);
  else objetivo = 0.04 + 0.03 * Math.sin(s * 1.4);
  nivel += (objetivo - nivel) * 0.18;

  const panel = document.body.classList.contains('panel-abierto') && W > 800;
  const objX = panel ? (W - Math.min(520, W)) / 2 : W / 2;
  ox += (objX - ox) * 0.08;

  const x = ox, y = H * 0.38;
  const [r, g, b] = hexRgb(cfg.color);
  const base = Math.min(W, H) * 0.13;
  const R = base * (1 + nivel * 1.1);

  ctxO.clearRect(0, 0, W, H);
  if (holo.on) { dibujarHolo(ctxO, x, y, s, nivel, r, g, b); return; }

  // Halo de luz
  const halo = ctxO.createRadialGradient(x, y, R * 0.3, x, y, R * 3);
  halo.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.30 + nivel * 0.3) + ')');
  halo.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  ctxO.fillStyle = halo;
  ctxO.beginPath(); ctxO.arc(x, y, R * 3, 0, Math.PI * 2); ctxO.fill();

  // Anillos que se expanden
  for (let i = 0; i < 3; i++) {
    const fase = (s * 0.5 + i / 3) % 1;
    const rr = R * (1.05 + fase * (0.6 + nivel * 1.4));
    ctxO.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + ((1 - fase) * (0.18 + nivel * 0.5)) + ')';
    ctxO.lineWidth = 2;
    ctxO.beginPath(); ctxO.arc(x, y, rr, 0, Math.PI * 2); ctxO.stroke();
  }

  // Núcleo con borde ondulado
  ctxO.beginPath();
  const pasos = 90;
  for (let i = 0; i <= pasos; i++) {
    const a = (i / pasos) * Math.PI * 2;
    const onda = 1 + nivel * 0.16 * Math.sin(a * 6 + s * 5) + nivel * 0.10 * Math.sin(a * 9 - s * 7) + 0.012 * Math.sin(a * 3 + s);
    const px = x + Math.cos(a) * R * onda;
    const py = y + Math.sin(a) * R * onda;
    if (i === 0) ctxO.moveTo(px, py); else ctxO.lineTo(px, py);
  }
  ctxO.closePath();
  const nucleo = ctxO.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.05, x, y, R * 1.1);
  nucleo.addColorStop(0, 'rgba(255,255,255,0.95)');
  nucleo.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.95)');
  nucleo.addColorStop(1, 'rgba(' + Math.floor(r * 0.15) + ',' + Math.floor(g * 0.15) + ',' + Math.floor(b * 0.3) + ',0.95)');
  ctxO.fillStyle = nucleo;
  ctxO.shadowColor = cfg.color;
  ctxO.shadowBlur = 40 + nivel * 60;
  ctxO.fill();
  ctxO.shadowBlur = 0;
}
requestAnimationFrame(dibujar);

// ---------------------------------------------------------------------
//  VOLUMEN DEL MICRÓFONO (para que la esfera crezca cuando hablas)
// ---------------------------------------------------------------------
let audioCtx = null, analizador = null, datosAudio = null, streamAudio = null;

async function iniciarAudio() {
  if (analizador) return;
  try {
    streamAudio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const fuente = audioCtx.createMediaStreamSource(streamAudio);
    analizador = audioCtx.createAnalyser();
    analizador.fftSize = 512;
    fuente.connect(analizador);
    datosAudio = new Uint8Array(analizador.fftSize);
    medirVolumen();
  } catch (e) {
    analizador = null;
  }
}

function medirVolumen() {
  requestAnimationFrame(medirVolumen);
  if (!analizador) return;
  analizador.getByteTimeDomainData(datosAudio);
  let suma = 0;
  for (let i = 0; i < datosAudio.length; i++) {
    const v = (datosAudio[i] - 128) / 128;
    suma += v * v;
  }
  const rms = Math.sqrt(suma / datosAudio.length);
  nivelMic = Math.min(1, rms * 6);
}

// ---------------------------------------------------------------------
//  VOZ: HABLAR
// ---------------------------------------------------------------------
function cargarVoces() {
  try {
    voces = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
  } catch (e) { voces = []; }
  const sel = $('inVoz');
  sel.innerHTML = '';
  voces.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = v.name + ' (' + v.lang + ')';
    if (v.name === cfg.voz) o.selected = true;
    sel.appendChild(o);
  });
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = cargarVoces;

// ---------------------------------------------------------------------
//  VOZ: ESCUCHAR
// ---------------------------------------------------------------------
function iniciarReconocimiento() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    hablar('Tu navegador no soporta reconocimiento de voz. Abre esta página en Google Chrome.');
    return;
  }
  reconocimiento = new SR();
  reconocimiento.lang = idioma === 'en' ? 'en-US' : 'es-ES';
  reconocimiento.continuous = true;
  reconocimiento.interimResults = true;
  reconocimiento.maxAlternatives = 3;

  reconocimiento.onstart = () => {
    $('btnMic').classList.add('activo');
    if (!hablando) setModo('escuchando');
    $('tuvoz').textContent = 'Habla ahora...';
  };

  reconocimiento.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (hablando || (pres.enCurso && !pres.pausada)) {
        if (r.isFinal && /\b(callate|silencio|basta|detente|deten|alto|pausa|espera|siguiente|anterior|salir de la presentacion|termina la presentacion|next|previous|pause|stop|exit the presentation)\b/.test(normalizar(r[0].transcript))) procesar(r[0].transcript);
        continue;
      }
      if (!r.isFinal) { mostrarTuVoz(r[0].transcript); continue; }
      procesar(elegirAlternativa(r));
    }
  };

  reconocimiento.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      escuchando = false;
      hablar('No tengo permiso para usar el micrófono. Pulsa el candado de la barra de direcciones y permítelo. Recuerda abrir la página con Live Server.');
    } else if (e.error === 'network') {
      escuchando = false;
      hablar(esOpera
        ? 'Opera no puede usar el reconocimiento de voz. Abre esta misma dirección en Google Chrome o Edge. Mientras tanto puedes escribir las órdenes.'
        : 'El reconocimiento de voz no pudo conectarse. Necesita internet y Google Chrome o Edge. Mientras tanto puedes escribir las órdenes.');
    } else if (e.error === 'audio-capture') {
      escuchando = false;
      hablar('No encuentro ningún micrófono conectado.');
    } else if (e.error === 'language-not-supported') {
      escuchando = false;
      hablar('Este navegador no soporta el reconocimiento de voz en español.');
    }
  };

  reconocimiento.onend = () => {
    if (escuchando) {
      setTimeout(() => { try { reconocimiento.start(); } catch (err) {} }, 250);
    } else {
      $('btnMic').classList.remove('activo');
      setModo('reposo');
    }
  };

  escuchando = true;
  try { reconocimiento.start(); } catch (e) {}
  iniciarAudio();
}

function detenerReconocimiento() {
  escuchando = false;
  nivelMic = 0;
  try { reconocimiento.stop(); } catch (e) {}
  $('btnMic').classList.remove('activo');
  setModo('reposo');
  mostrarRespuesta('Micrófono apagado.');
}

$('btnMic').addEventListener('click', () => {
  marcarActividad();
  if (escuchando) {
    detenerReconocimiento();
  } else {
    iniciarReconocimiento();
    hablar(esOpera
      ? 'Aviso: en Opera el micrófono casi nunca funciona. Si no me escucho, abre esta página en Google Chrome. También puedes escribir.'
      : 'Hola ' + (cfg.usuario === 'amigo' ? '' : cfg.usuario) + ', soy ' + cfg.nombre + '. Te escucho.');
  }
});

// ---------------------------------------------------------------------
//  PANEL LATERAL
// ---------------------------------------------------------------------
function abrirPanel(vista) {
  if (!vista || !$(vista)) return;
  document.querySelectorAll('.vista').forEach((v) => v.classList.remove('visible'));
  $(vista).classList.add('visible');
  $('panel').classList.add('abierto');
  document.body.classList.add('panel-abierto');
  if (vista === 'v-d3') setTimeout(ajustar3D, 80);
}

function cerrarPanel() {
  $('panel').classList.remove('abierto');
  document.body.classList.remove('panel-abierto');
}

$('cerrarPanel').addEventListener('click', cerrarPanel);
document.querySelectorAll('#menu button').forEach((b) => {
  if (b.dataset.vista) b.addEventListener('click', () => abrirPanel(b.dataset.vista));
});

// ---------------------------------------------------------------------
//  PROCESAR ÓRDENES
// ---------------------------------------------------------------------
function procesar(textoOriginal, reintento) {
  if (!reintento) { mostrarTuVoz(textoOriginal); marcarActividad(); ultimaPregunta = textoOriginal; }
  let t = normalizar(textoOriginal);
  const nom = normalizar(cfg.nombre);
  if (nom) t = t.replace(new RegExp('\\b' + escaparRegex(nom) + '\\b', 'g'), '').replace(/\s+/g, ' ').trim();
  if (!t) { hablar('Dime, ' + cfg.usuario + ', te escucho.'); return; }

  if (idioma === 'en') { if (pres.enCurso && controlPresentacion(t)) return; procesarEn(t); return; }
  if (comandosIdioma(t)) return;

  t = humanizar(t);
  if (!t) { hablar('Dime, ' + cfg.usuario + ', te escucho.'); return; }

  if (pcComando(t)) return;

  // ---- Presentación y conversación en curso ----
  if (pres.enCurso && controlPresentacion(t)) return;
  if (!pres.enCurso && /\b(presentate|presentacion|demostracion|exposicion)\b/.test(t) && !/(termina|salir|cancela)/.test(t)) { iniciarPresentacion(audienciaDe(t)); return; }
  if (/^(?:repite|repitelo|que dijiste|dilo de nuevo|mas despacio|mas lento|habla lento|habla mas despacio|mas rapido|mas veloz|habla rapido|habla mas rapido|velocidad normal|ritmo normal|callate|silencio|basta|detente|alto|para de hablar|deja de hablar|ya basta)/.test(t) && charlar(t)) return;
  if (respuestaContexto(t)) return;

  let m;

  // ---- Puntero virtual ----
  if (/(desactiva|apaga|quita|oculta|cierra|deten|deja de usar)\s+(?:(?:el|la|mi)\s+)*puntero/.test(t)) { activarPuntero(false); return; }
  if (/(activa|enciende|prende|inicia|usa|habilita|pon|ponme)\s+(?:(?:el|la|mi)\s+)*puntero/.test(t)) { activarPuntero(true); return; }
  m = t.match(/(?:mueve|lleva|pon|coloca)\s+(?:(?:el|la)\s+)*puntero\s+(?:(?:a|hacia|en|al)\s+)*(.+)/);
  if (m) { moverPunteroVoz(m[1]); return; }
  if (/^(?:haz|hace|da|dale)\s+(?:un\s+)?(?:clic|click|clik)$/.test(t) || /^(?:clic|click|clik)$/.test(t)) { clicEnPuntero(); return; }
  m = t.match(/(?:haz|hace|da|dale)?\s*(?:clic|click|clik)\s+(?:(?:en|sobre|a)\s+)+(?:(?:el|la|los|las|boton)\s+)*(.+)/);
  if (m) { clicEnTexto(m[1]); return; }
  m = t.match(/^(?:pulsa|presiona|toca|aprieta|selecciona|elige|clickea|clica)\s+(?:(?:en|sobre|el|la|los|las|boton|opcion)\s+)*(.+)/);
  if (m) { clicEnTexto(m[1]); return; }

  // ---- Cambiar el nombre del asistente ----
  m = t.match(/(?:cambiate el nombre a|cambia el nombre a|cambiate nombre a|ahora te llamas|te vas a llamar|te llamaras|llamate)\s+(.+)/);
  if (m) {
    const nuevo = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    cfg.nombre = nuevo; guardar('nombre', nuevo); aplicarConfig();
    hablar('Perfecto, desde ahora me llamo ' + nuevo + '.');
    return;
  }

  // ---- Panel ----
  if (/(cierra|oculta|quita) (el )?panel/.test(t)) { cerrarPanel(); hablar('Panel cerrado.'); return; }

  // ---- Temporizador con tiempo ----
  m = t.match(/(?:temporizador|cronometro|alarma|avisame).*?(\d+)\s*(hora|horas|minuto|minutos|segundo|segundos)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    iniciarTemporizador(u.startsWith('hora') ? n * 3600 : u.startsWith('min') ? n * 60 : n);
    return;
  }

  // ---- Mover un programa flotante ----
  m = t.match(/(?:mueve|mover|pasa|lleva|coloca|acomoda|pon|ponme)\s+(?:(?:el|la|las|los)\s+)*(notas?|calculadora|temporizador|cronometro|clima)\s*(.*)$/);
  if (m && /(izquierda|derecha|centro|medio|arriba|abajo|superior|inferior)/.test(m[2])) { moverPrograma(progDesde(m[1]), m[2]); return; }

  // ---- Cerrar programas y sitios ----
  m = t.match(/(?:cierra|cerrar|quita|elimina)\s+(?:(?:el|la|las|los|todo|todos|todas)\s+)*(notas?|calculadora|temporizador|cronometro|clima|youtube|google|wikipedia|gmail|maps|mapas|whatsapp|spotify|github|drive|traductor|todo|todos|todas|ventanas|programas)\b/);
  if (m) { cerrarCosa(m[1]); return; }

  // ---- Abrir programas flotantes ----
  m = t.match(/(?:abre|abrir|muestra|muestrame|inicia|lanza|activa|enciende|prende)\s+(?:(?:el|la|las|los|un|una|mis)\s+)*(bloc de notas|notas?|calculadora|temporizador|cronometro|clima)\b/);
  if (m) { abrirPrograma(progDesde(m[1])); return; }

  // ---- Anotar ----
  m = t.match(/(?:anota|anotame|apunta|apuntame)\s+(.+)/);
  if (m) {
    const mo = textoOriginal.match(/(?:anota|anótame|anotame|apunta|apúntame|apuntame)\s+(.+)/i);
    anotar(mo ? mo[1] : m[1]);
    return;
  }

  // ---- Compartir pantalla ----
  if (/(deja de|deten|detener|para de|termina de|corta).*(compart|transmit|pantalla|escritorio)/.test(t)) { detenerPantalla(true); return; }
  if (/(captura|screenshot)/.test(t) && /(pantalla|escritorio)/.test(t)) { capturaPantalla(); return; }
  if (/(comparte|compartir|comparteme|transmite|muestra).*(pantalla|escritorio)/.test(t)) { compartirPantalla(); return; }

  // ---- Efectos ----
  if (/(desactiva|quita|apaga|sal del|termina).*(matrix|lluvia)/.test(t)) { modoMatrix(false); return; }
  if (/(matrix|lluvia de codigo|modo hacker)/.test(t)) { modoMatrix(true); return; }

  m = t.match(/(?:cambia|cambiate|pon|ponte|usa|quiero)\s+(?:el )?color(?: del tema| de la esfera| de la pantalla)?\s+(?:a |en |de |al )?([a-z]+)/);
  if (m && coloresTema[m[1]]) { cambiarColor(m[1]); return; }

  // ---- Cámara ----
  if (/(enciende|prende|activa|abre).*camara/.test(t)) { abrirPanel('v-camara'); encenderCamara(); return; }
  if (/(apaga|cierra|desactiva).*camara/.test(t)) { apagarCamara(); return; }
  if (/(toma|saca|haz|tomame).*foto/.test(t)) { tomarFoto(); return; }

  // ---- 3D ----
  if (/(crea|genera|haz|hazme|dibuja|muestra|muestrame|construye|pon|ponme|dame|quiero|necesito).*(cubo|esfera|cono|cilindro|dona|toro|piramide)/.test(t)) { crearModelo(t); return; }
  if (/(deten|detene|para|frena|deja de girar).*(modelo|figura|objeto|giro)/.test(t) || /deja de girar/.test(t)) { alternarGiro(false); return; }
  if (/(gira|rota)/.test(t) && /(modelo|figura|objeto|giro)/.test(t)) { alternarGiro(true); return; }
  if (/(borra|elimina|quita).*(modelo|figura|objeto)/.test(t)) { borrarModelo(); return; }

  // ---- Casa inteligente (simulada) ----
  if (/(enciende|prende|apaga|abre|cierra)/.test(t) && /(luz|luces|ventilador|puerta)/.test(t)) { controlarCasa(t); return; }

  // ---- Clima ----
  if (/(clima|que tiempo hace|temperatura|va a llover|esta lloviendo|pronostico)/.test(t)) { abrirPrograma('clima'); return; }

  // ---- Recomendaciones y ayuda ----
  if (/(recomienda|recomiendame|recomendacion|recomendaciones|sugerencia|que puedes hacer|que sabes hacer|que puedo (?:decir|pedir|hacer)|comandos)/.test(t) || /\bayuda\b/.test(t)) { recomendar(); return; }

  if (charlar(t)) return;

  // ---- Conversación ----
  if (/que hora/.test(t)) { hablar('Son las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })); return; }
  if (/(que dia es|que fecha|fecha de hoy)/.test(t)) { hablar('Hoy es ' + new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); return; }
  if (/(como te llamas|quien eres|cual es tu nombre)/.test(t)) { hablar('Me llamo ' + cfg.nombre + ' y soy tu asistente personal.'); return; }
  if (/(como me llamo|cual es mi nombre)/.test(t)) { hablar(cfg.usuario === 'amigo' ? 'Aún no me has dicho tu nombre.' : 'Te llamas ' + cfg.usuario + '.'); return; }
  m = t.match(/(?:mi nombre es|me llamo)\s+(.+)/);
  if (m) {
    const n = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    cfg.usuario = n; guardar('usuario', n);
    hablar('Mucho gusto, ' + n + '.');
    return;
  }
  if (/(como estas|como te sientes|que tal estas)/.test(t)) { hablar('Estoy funcionando al cien por ciento y listo para ayudarte, ' + cfg.usuario + '.'); return; }
  if (/quien te (creo|hizo|programo|desarrollo)/.test(t)) { hablar('Fui creado como proyecto para la feria, usando HTML, CSS y JavaScript.'); return; }
  if (/(dato curioso|dato interesante|sabias que|cuentame algo)/.test(t)) { hablar(elegir(DATOS)); return; }
  if (/(frase|mensaje).*(motivador|motivacion|inspirador)|motivame|animame/.test(t)) { hablar(elegir(FRASES)); return; }
  if (/moneda|cara o (sello|cruz)/.test(t)) { hablar('Salió ' + (Math.random() < 0.5 ? 'cara.' : 'sello.')); return; }
  if (/(lanza|tira|tirar|lanzar).*dado/.test(t)) { hablar('Salió el número ' + (1 + Math.floor(Math.random() * 6)) + '.'); return; }
  if (/numero (aleatorio|al azar)/.test(t)) { hablar('Mi número es el ' + (1 + Math.floor(Math.random() * 100)) + '.'); return; }
  if (/\b(adios|chao|hasta luego|nos vemos)\b/.test(t)) { hablar('Hasta luego, ' + cfg.usuario + '. Aquí estaré cuando me necesites.'); return; }
  if (/\b(hola|buenos dias|buenas tardes|buenas noches|hey)\b/.test(t)) { hablar('Hola ' + cfg.usuario + ', soy ' + cfg.nombre + '. ¿En qué te ayudo?'); return; }
  if (/chiste/.test(t)) { contarChiste(); return; }
  if (/\bgracias\b/.test(t)) { hablar('De nada, ' + cfg.usuario + '.'); return; }
  if (esPeticionMatematica(t) && calcularVoz(t)) return;

  // ---- v8: holograma, cámara, búsqueda mundial, carpeta, instalación ----
  if (comandosHolo(t)) return;
  if (comandosVision(t)) return;
  m = t.match(/(?:busca|buscame|investiga|googlea|averigua|consulta|busca)\s+(?:en\s+)?(?:google|internet|la web|el navegador|linea)\s*(?:sobre|de|acerca de|que es|quien es)?\s*(.+)/) || t.match(/^(?:googlea|googlear)\s+(.+)/);
  if (m) { buscarEnWeb(m[1]); return; }
  if (/(conecta|conectar|vincula|vincular|elige|selecciona|agrega).*carpeta/.test(t)) { abrirPanel('v-docs'); $('btnCarpeta').classList.add('pulsar'); hablar('Pulsa el botón que brilla, Conectar carpeta, y elige la carpeta de tu computador donde están tus archivos. Después podré abrirlos por voz.'); return; }
  if (/(instala|instalar|descarga|descargar).*(app|aplicacion|programa|asistente)|como te instalo/.test(t)) { instalarApp(); return; }
  m = t.match(/(?:abre|abrir|busca|buscame|muestra|muestrame|ensename|trae)\s+(?:(?:el|la|mi|un|una)\s+)*(?:archivo|documento|pdf|word|excel|hoja de calculo|imagen|foto|presentacion)\s+(?:de\s+|llamad[oa]\s+|que se llama\s+)?(.+)/);
  if (m && !PC.activo) {
    const enDocs = docs.length ? buscarDocPorNombre(m[1]) : null;
    if (!enDocs) { abrirArchivoCarpeta(m[1]); return; }
  }

  // ---- Videos, pantalla, Office, documentos (v7) ----
  if (/^(?:siguiente|otro|proximo)\s+video/.test(t)) { siguienteVideo(); return; }
  if (/^(?:cierra|quita|deten|apaga)\s+(?:el\s+)?video/.test(t)) { cerrarVideo(); return; }
  m = t.match(/^(?:pon|ponme|muestra|muestrame|busca|buscame|reproduce|reproduceme|dame|ensename|quiero ver|ver)?\s*(?:unos?\s+|algunos?\s+|el\s+|los\s+)?videos?\s+(?:de|sobre|del|acerca de)?\s*(.+)/);
  if (m) { buscarVideos(m[1]); return; }
  if (/(lee|leeme|que dice|que hay en|mira|revisa|analiza)\s+(?:(?:la|mi|el)\s+)*(?:pantalla|escritorio)/.test(t)) { leerPantalla('todo'); return; }
  if (/(vigila|vigilar|monitorea|avisame|avisa).*(notificacion|notificaciones|mensajes)/.test(t)) { vigilarNotificaciones(true); return; }
  if (/(deja de|para de|no)\s+(?:vigil|monitore)/.test(t) || /(deten|apaga).*(vigilancia|vigilar)/.test(t)) { vigilarNotificaciones(false); return; }
  if (/(tengo|hay|llego|llegaron|alguna|revisa|lee|que)\b.*\b(notificacion|notificaciones)/.test(t)) { leerPantalla('notif'); return; }
  m = t.match(/(?:abre|abrir|entra a|ve a|inicia|ejecuta|muestra)\s+(?:(?:el|la|mi)\s+)*(excel|word|power ?point)\b/);
  if (m) { abrirOffice(m[1].replace(/\s/g, '')); return; }
  m = t.match(/(?:muestra|muestrame|lee|leeme|abre|ver|visualiza)\s+(?:(?:el|la|mi|un)\s+)*(?:documento|archivo|pdf|hoja de calculo)\b\s*(.*)/);
  if (m) {
    if (!docs.length) { abrirPanel('v-docs'); hablar('Todavía no hay documentos cargados. Pulsa Elegir archivos y carga uno, por ejemplo un PDF, un Word o un Excel.'); return; }
    const d = buscarDocPorNombre(m[1]);
    if (d) { verDoc(d); return; }
    hablar('No encontré ese documento. Tengo cargados: ' + docs.map((x) => x.nombre).join(', ') + '.'); return;
  }
  if (/pantalla completa/.test(t)) { hablar('Intento poner la pantalla completa.'); pantallaCompleta(); return; }

  // ---- Abrir sitios web ----
  m = t.match(new RegExp('(?:abre|abrir|ve a|entra a|ir a|abre la pagina de|abre la pagina|abre el sitio de)\\s+(?:(?:el|la|las|los)\\s+)*(' + Object.keys(SITIOS).join('|') + ')\\b'));
  if (m) { abrirSitio(m[1]); return; }
  m = t.match(/(?:reproduce|pon|ponme)\s+(.+)/);
  if (m) {
    buscarVideos(m[1]);
    return;
  }

  // ---- Documentos propios ----
  if (/(abre|muestra|ve a|ir a)\s+(?:(?:mis|mi|el|los|la|las)\s+)*(documentos|archivos|apuntes|pdfs?)\b/.test(t) && !/(busca|que dice|segun)/.test(t)) {
    abrirPanel('v-docs'); hablar('Aquí están tus documentos. Tengo ' + docs.length + ' cargados.'); return;
  }
  if (/(borra|elimina|quita|limpia)\s+(?:(?:todos|todas|mis|los|las)\s+)*(documentos|archivos)/.test(t)) { borrarDocs(); return; }
  if (/(cuantos|que|cuales)\s+(?:documentos|archivos).*(tengo|cargados|hay)/.test(t)) { listarDocs(); return; }
  const qd = consultaDocs(t);
  if (qd !== null) {
    if (!docs.length) { abrirPanel('v-docs'); hablar('Todavía no has cargado documentos. Pulsa Elegir archivos en el panel y vuelve a preguntarme.'); return; }
    if (!qd) { abrirPanel('v-docs'); hablar('¿Qué quieres que busque en tus documentos?'); return; }
    buscarEnDocs(qd, false);
    return;
  }

  // ---- Investigar ----
  m = t.match(/(?:investiga|investigame|busca|buscame|que es|que son|quien es|quien fue|dime sobre|hablame de|explicame)\s+(?:sobre |acerca de |de |del |la |el |los |las |un |una )*(.+)/);
  if (m) { if (!(docs.length && buscarEnDocs(m[1], true))) investigar(m[1]); return; }

  // ---- Si no coincidió con nada: comprensión aproximada, documentos, Wikipedia ----
  if (!reintento) {
    const d = intentoDifuso(t);
    if (d) { mostrarTuVoz(textoOriginal + '  →  ' + d); procesar(d, true); return; }
  }
  if (docs.length && buscarEnDocs(t, true)) return;
  if (!reintento && esAfirmacion(t) && !/(que es|quien es|quien fue|investiga|busca|significa|define)/.test(t) && t.split(' ').length <= 12 && /^(?:yo|me|mi|mis|estoy|tengo|soy|hoy|ayer|esto|eso|estaba|creo|pienso|siento|quiero|no se|es |esta )/.test(t)) { charlaGenerica(); return; }
  investigar(t);
}

$('btnEnviar').addEventListener('click', () => {
  const v = $('entrada').value.trim();
  if (v) { procesar(v); $('entrada').value = ''; }
});
$('entrada').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnEnviar').click(); });

// ---------------------------------------------------------------------
//  UTILIDADES VARIAS
// ---------------------------------------------------------------------
function contarChiste() {
  const chistes = [
    '¿Qué le dice un jaguar a otro jaguar? Jaguar you.',
    '¿Por qué los programadores confunden Halloween con Navidad? Porque OCT 31 es igual a DEC 25.',
    '¿Qué hace una abeja en el gimnasio? Zumba.',
    '¿Cómo se despiden los químicos? Ácido un placer.',
    '¿Qué le dice un bit a otro? Nos vemos en el bus.'
  ];
  hablar(chistes[Math.floor(Math.random() * chistes.length)]);
}

// ---------------------------------------------------------------------
//  INVESTIGACIÓN (WIKIPEDIA)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  CASA INTELIGENTE (SIMULADA)
// ---------------------------------------------------------------------
function ponerDispositivo(id, on, textoOn, textoOff) {
  const el = $(id);
  el.classList.toggle('encendido', on);
  if (id === 'ventilador') el.classList.toggle('girando', on);
  el.querySelector('b').textContent = on ? textoOn : textoOff;
}

function controlarCasa(t) {
  const activar = /(enciende|prende|abre)/.test(t);
  abrirPanel('v-casa');

  if (t.includes('sala')) { ponerDispositivo('luzSala', activar, 'Encendida', 'Apagada'); hablar((activar ? 'Encendí' : 'Apagué') + ' la luz de la sala.'); return; }
  if (t.includes('cuarto') || t.includes('habitacion')) { ponerDispositivo('luzCuarto', activar, 'Encendida', 'Apagada'); hablar((activar ? 'Encendí' : 'Apagué') + ' la luz del cuarto.'); return; }
  if (t.includes('ventilador')) { ponerDispositivo('ventilador', activar, 'Encendido', 'Apagado'); hablar((activar ? 'Encendí' : 'Apagué') + ' el ventilador.'); return; }
  if (t.includes('puerta')) { ponerDispositivo('puerta', activar, 'Abierta', 'Cerrada'); hablar((activar ? 'Abrí' : 'Cerré') + ' la puerta.'); return; }
  if (t.includes('luz') || t.includes('luces')) {
    ponerDispositivo('luzSala', activar, 'Encendida', 'Apagada');
    ponerDispositivo('luzCuarto', activar, 'Encendida', 'Apagada');
    hablar(activar ? 'Encendí todas las luces.' : 'Apagué todas las luces.');
    return;
  }
  hablar('No entendí qué dispositivo controlar.');
}

// ---------------------------------------------------------------------
//  CÁMARA Y CONTROL CON LOS DEDOS
// ---------------------------------------------------------------------
let streamCamara = null;
let manos = null;
let camaraMP = null;
let agarrando = false;

async function encenderCamara() {
  if (streamCamara) { hablar('La cámara ya está encendida.'); return; }
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    $('video').srcObject = streamCamara;
    $('btnCamara').textContent = 'Apagar cámara';
    hablar('Cámara encendida. Junta el pulgar y el índice para agarrar el recuadro.');
    iniciarManos();
  } catch (e) {
    streamCamara = null;
    hablar('No pude acceder a la cámara. Revisa los permisos del navegador.');
  }
}

function apagarCamara() {
  if (!streamCamara) { hablar('La cámara ya está apagada.'); return; }
  streamCamara.getTracks().forEach((tr) => tr.stop());
  streamCamara = null;
  $('video').srcObject = null;
  if (!pu.activo) detenerRastreo();
  const l = $('manos');
  l.getContext('2d').clearRect(0, 0, l.width, l.height);
  $('btnCamara').textContent = 'Encender cámara';
  hablar('Cámara apagada.');
}

$('btnCamara').addEventListener('click', () => { if (streamCamara) apagarCamara(); else encenderCamara(); });

function tomarFoto() {
  if (!streamCamara) { hablar('Primero enciende la cámara.'); return; }
  const c = document.createElement('canvas');
  c.width = $('video').videoWidth || 640;
  c.height = $('video').videoHeight || 480;
  c.getContext('2d').drawImage($('video'), 0, 0);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'foto.png';
  a.click();
  hablar('Foto guardada en tu carpeta de descargas.');
}
$('btnFoto').addEventListener('click', tomarFoto);

function posicionarVentana(left, top) {
  const marco = $('marco'), v = $('ventana');
  v.style.left = Math.max(0, Math.min(marco.clientWidth - v.offsetWidth, left)) + 'px';
  v.style.top = Math.max(0, Math.min(marco.clientHeight - v.offsetHeight, top)) + 'px';
}

// Arrastrar el recuadro con el mouse (respaldo si fallan los dedos)
(function () {
  const v = $('ventana');
  let d = null;
  v.addEventListener('pointerdown', (e) => {
    const r = v.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { v.setPointerCapture(e.pointerId); } catch (err) {}
    v.classList.add('agarrada');
  });
  v.addEventListener('pointermove', (e) => {
    if (!d) return;
    const m = $('marco').getBoundingClientRect();
    posicionarVentana(e.clientX - m.left - d.dx, e.clientY - m.top - d.dy);
  });
  const soltarMouse = () => { d = null; v.classList.remove('agarrada'); };
  v.addEventListener('pointerup', soltarMouse);
  v.addEventListener('pointercancel', soltarMouse);
})();

function soltar() {
  agarrando = false;
  if (!$('ventana').matches(':active')) $('ventana').classList.remove('agarrada');
}

// ---------------------------------------------------------------------
//  MODELOS 3D (THREE.JS)
// ---------------------------------------------------------------------
let escena = null, camara3D = null, render3D = null, modelo = null, girando = true;

const colores = {
  rojo: 0xff3b3b, azul: 0x3b82ff, verde: 0x2ecc71, amarillo: 0xffd23b,
  naranja: 0xff8c1a, morado: 0x9b59b6, rosado: 0xff69b4, rosa: 0xff69b4,
  blanco: 0xffffff, negro: 0x333333, gris: 0x999999, celeste: 0x4fd8ff
};

function iniciar3D() {
  const cont = $('escena');
  escena = new THREE.Scene();
  camara3D = new THREE.PerspectiveCamera(60, (cont.clientWidth || 480) / (cont.clientHeight || 380), 0.1, 100);
  camara3D.position.z = 4;
  render3D = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render3D.setSize(cont.clientWidth || 480, cont.clientHeight || 380);
  cont.appendChild(render3D.domElement);
  escena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const luz = new THREE.DirectionalLight(0xffffff, 0.9);
  luz.position.set(3, 4, 5);
  escena.add(luz);
  animar3D();
}

function ajustar3D() {
  const cont = $('escena');
  if (!render3D || !cont.clientWidth) return;
  render3D.setSize(cont.clientWidth, cont.clientHeight);
  camara3D.aspect = cont.clientWidth / cont.clientHeight;
  camara3D.updateProjectionMatrix();
}
window.addEventListener('resize', ajustar3D);

function animar3D() {
  requestAnimationFrame(animar3D);
  if (modelo && girando) { modelo.rotation.x += 0.01; modelo.rotation.y += 0.015; }
  render3D.render(escena, camara3D);
}

async function crearModelo(t) {
  abrirPanel('v-d3');
  mostrarRespuesta('Cargando el motor 3D...');
  try { await cargarScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'); } catch (e) {}
  if (typeof THREE === 'undefined') { hablar('No se cargó la librería 3D. Revisa tu conexión a internet.'); return; }
  if (!render3D) iniciar3D();
  if (modelo) escena.remove(modelo);

  let color = 0x00e5ff, nombreColor = '';
  for (const c in colores) { if (t.includes(c)) { color = colores[c]; nombreColor = ' ' + c; break; } }
  if (!nombreColor) {
    for (const w of t.split(' ')) for (const c in colores) { if (simTok(w, c) >= 0.75) { color = colores[c]; nombreColor = ' ' + c; } }
  }

  let geo, forma;
  if (t.includes('esfera')) { geo = new THREE.SphereGeometry(1.2, 48, 48); forma = 'una esfera'; }
  else if (t.includes('cono')) { geo = new THREE.ConeGeometry(1.1, 2.2, 48); forma = 'un cono'; }
  else if (t.includes('cilindro')) { geo = new THREE.CylinderGeometry(1, 1, 2.2, 48); forma = 'un cilindro'; }
  else if (t.includes('dona') || t.includes('toro')) { geo = new THREE.TorusGeometry(1, 0.4, 32, 100); forma = 'una dona'; }
  else if (t.includes('piramide')) { geo = new THREE.ConeGeometry(1.4, 2, 4); forma = 'una pirámide'; }
  else { geo = new THREE.BoxGeometry(1.8, 1.8, 1.8); forma = 'un cubo'; }

  modelo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.4 }));
  escena.add(modelo);
  girando = true;
  setTimeout(ajustar3D, 80);
  hablar('Listo, creé ' + forma + nombreColor + '.');
}

function alternarGiro(valor) {
  girando = valor;
  hablar(valor ? 'El modelo está girando.' : 'Detuve el modelo.');
}

function borrarModelo() {
  if (modelo) { escena.remove(modelo); modelo = null; hablar('Modelo borrado.'); }
  else hablar('No hay ningún modelo para borrar.');
}

// ---------------------------------------------------------------------
//  AJUSTES
// ---------------------------------------------------------------------
$('btnAjustes').addEventListener('click', () => {
  $('inNombre').value = cfg.nombre;
  $('inUsuario').value = cfg.usuario === 'amigo' ? '' : cfg.usuario;
  $('inColor').value = cfg.color;
  $('inInstitucion').value = cfg.institucion;
  $('inProyecto').value = cfg.proyecto;
  $('inClaveIA').value = cfg.claveIA;
  cargarVoces();
  $('modal').classList.remove('oculto');
});
$('btnCerrar').addEventListener('click', () => $('modal').classList.add('oculto'));
$('btnGuardar').addEventListener('click', () => {
  cfg.nombre = $('inNombre').value.trim() || 'Jarvis';
  cfg.usuario = $('inUsuario').value.trim() || 'amigo';
  cfg.color = $('inColor').value;
  cfg.voz = $('inVoz').value || '';
  guardar('nombre', cfg.nombre);
  guardar('usuario', cfg.usuario);
  guardar('color', cfg.color);
  guardar('voz', cfg.voz);
  cfg.institucion = $('inInstitucion').value.trim();
  cfg.proyecto = $('inProyecto').value.trim() || 'Asistente personal de voz';
  guardar('institucion', cfg.institucion);
  guardar('proyecto', cfg.proyecto);
  cfg.claveIA = $('inClaveIA').value.trim();
  guardar('claveIA', cfg.claveIA);
  aplicarConfig();
  $('modal').classList.add('oculto');
  hablar('Ajustes guardados. Soy ' + cfg.nombre + '.');
});

// ---------------------------------------------------------------------
//  INICIO
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  EXTRAS: programas flotantes, pantalla, sitios, efectos, recomendaciones
// ---------------------------------------------------------------------
function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

const DATOS = [
  'La miel es el único alimento que no caduca: se han encontrado tarros de miles de años todavía comestibles.',
  'Los pulpos tienen tres corazones y su sangre es azul.',
  'Un día en Venus dura más que un año en Venus.',
  'El corazón de una ballena azul es tan grande como un auto pequeño.',
  'Los plátanos son ligeramente radiactivos por su contenido de potasio, pero completamente inofensivos.',
  'La Torre Eiffel puede crecer unos quince centímetros en verano por la dilatación del metal.',
  'En el salar de Uyuni, en Bolivia, se forma el espejo natural más grande del mundo cuando llueve.'
];

const FRASES = [
  'El éxito es la suma de pequeños esfuerzos repetidos cada día.',
  'No tienes que ser perfecto para empezar, pero tienes que empezar para ser mejor.',
  'Los grandes proyectos empiezan con una idea y la decisión de intentarlo.',
  'Si te cansas, aprende a descansar, no a rendirte.',
  'Hoy es un buen día para construir algo increíble.'
];

// ----- Colores del tema -----
const coloresTema = {
  rojo: '#ff3b3b', azul: '#3b82ff', verde: '#2ecc71', amarillo: '#ffd23b', naranja: '#ff8c1a',
  morado: '#b46bff', rosado: '#ff69b4', rosa: '#ff69b4', blanco: '#ffffff', celeste: '#00e5ff', cian: '#00e5ff'
};

function cambiarColor(nombre) {
  const nuevo = coloresTema[nombre];
  if (matrizOn) { colorAntes = nuevo; } else { cfg.color = nuevo; aplicarConfig(); }
  guardar('color', nuevo);
  hablar('Listo, cambié el color a ' + nombre + '.');
}

// ----- Modo Matrix -----
const lienzoM = $('matriz');
const ctxM = lienzoM.getContext('2d');
let matrizOn = false, colorAntes = null, columnasM = [];

function iniciarMatriz() {
  lienzoM.width = window.innerWidth;
  lienzoM.height = window.innerHeight;
  columnasM = [];
  for (let i = 0; i < Math.ceil(lienzoM.width / 16); i++) columnasM.push(Math.random() * 40);
}
window.addEventListener('resize', () => { if (matrizOn) iniciarMatriz(); });

function dibujarMatriz() {
  if (!matrizOn) return;
  ctxM.fillStyle = 'rgba(2,5,12,0.12)';
  ctxM.fillRect(0, 0, lienzoM.width, lienzoM.height);
  ctxM.fillStyle = '#00ff66';
  ctxM.font = '16px monospace';
  for (let i = 0; i < columnasM.length; i++) {
    const letra = String.fromCharCode(0x30A0 + Math.floor(Math.random() * 90));
    ctxM.fillText(letra, i * 16, columnasM[i] * 16);
    if (columnasM[i] * 16 > lienzoM.height && Math.random() > 0.975) columnasM[i] = 0;
    columnasM[i] += 1;
  }
  setTimeout(() => requestAnimationFrame(dibujarMatriz), 50);
}

function modoMatrix(on) {
  if (on === matrizOn) { hablar(on ? 'El modo Matrix ya está activo.' : 'El modo Matrix ya está apagado.'); return; }
  matrizOn = on;
  if (on) {
    colorAntes = cfg.color;
    cfg.color = '#00ff66';
    aplicarConfig();
    lienzoM.classList.add('activo');
    iniciarMatriz();
    dibujarMatriz();
    hablar('Modo Matrix activado.');
  } else {
    cfg.color = colorAntes || cfg.color;
    aplicarConfig();
    lienzoM.classList.remove('activo');
    ctxM.clearRect(0, 0, lienzoM.width, lienzoM.height);
    hablar('Modo Matrix desactivado.');
  }
}

// ----- Pitido -----
function pitar() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.frequency.value = 880; g.gain.value = 0.2;
    o.start();
    setTimeout(() => { o.stop(); a.close(); }, 700);
  } catch (e) {}
}

// ----- Programas flotantes -----
const ventanas = {};
let zTop = 10;

function progDesde(txt) {
  if (/nota/.test(txt)) return 'notas';
  if (/calculadora/.test(txt)) return 'calculadora';
  if (/temporizador|cronometro/.test(txt)) return 'temporizador';
  return 'clima';
}

function traerAlFrente(v) { zTop++; v.style.zIndex = zTop; }

function hacerArrastrable(v, cab) {
  let d = null;
  cab.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const r = v.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    v.classList.add('arrastrando');
    try { cab.setPointerCapture(e.pointerId); } catch (err) {}
    traerAlFrente(v);
  });
  cab.addEventListener('pointermove', (e) => {
    if (!d) return;
    v.style.left = Math.max(0, Math.min(window.innerWidth - v.offsetWidth, e.clientX - d.dx)) + 'px';
    v.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - d.dy)) + 'px';
  });
  const fin = () => { d = null; v.classList.remove('arrastrando'); };
  cab.addEventListener('pointerup', fin);
  cab.addEventListener('pointercancel', fin);
}

function abrirPrograma(id, callado) {
  const def = programas[id];
  if (!def) return;
  if (ventanas[id]) {
    traerAlFrente(ventanas[id]);
    if (def.refrescar) def.refrescar(ventanas[id].querySelector('.cuerpo'));
    else if (!callado) hablar('Ya tienes ' + def.titulo + ' abierto.');
    return;
  }
  const v = document.createElement('div');
  v.className = 'vent';
  const n = Object.keys(ventanas).length;
  v.style.left = (30 + n * 34) + 'px';
  v.style.top = (90 + n * 34) + 'px';

  const cab = document.createElement('header');
  const titulo = document.createElement('span');
  titulo.textContent = def.icono + ' ' + def.titulo;
  const x = document.createElement('button');
  x.textContent = '✕';
  x.addEventListener('click', () => cerrarPrograma(id));
  cab.appendChild(titulo); cab.appendChild(x);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'cuerpo';
  v.appendChild(cab); v.appendChild(cuerpo);
  $('capaVentanas').appendChild(v);

  ventanas[id] = v;
  hacerArrastrable(v, cab);
  traerAlFrente(v);
  def.crear(cuerpo);
  if (!callado && !def.silencioso) hablar('Abrí ' + def.titulo + '. Puedes moverla con el mouse o pedirme que la mueva.');
}

function cerrarPrograma(id) {
  const v = ventanas[id];
  if (!v) return;
  if (id === 'temporizador') pararTemporizador();
  if (id === 'calculadora') calcApi = null;
  v.remove();
  delete ventanas[id];
}

function moverPrograma(id, destino) {
  if (!ventanas[id]) abrirPrograma(id, true);
  const v = ventanas[id];
  const d = normalizar(destino);
  const w = v.offsetWidth, h = v.offsetHeight, M = 20;
  const izq = /izquierda/.test(d), der = /derecha/.test(d);
  const arr = /(arriba|superior)/.test(d), aba = /(abajo|inferior)/.test(d), cen = /(centro|medio)/.test(d);
  const util = (document.body.classList.contains('panel-abierto') && window.innerWidth > 800)
    ? window.innerWidth - Math.min(520, window.innerWidth) : window.innerWidth;
  let left = parseFloat(v.style.left) || 0;
  let top = parseFloat(v.style.top) || 0;
  if (izq) left = M;
  if (der) left = util - w - M;
  if (arr) top = 70;
  if (aba) top = window.innerHeight - h - 170;
  if (cen) {
    if (!izq && !der) left = (util - w) / 2;
    if (!arr && !aba) top = (window.innerHeight - h) / 2 - 40;
  }
  v.style.left = Math.max(0, left) + 'px';
  v.style.top = Math.max(0, top) + 'px';
  traerAlFrente(v);
  hablar('Listo, moví ' + programas[id].titulo + '.');
}

// ----- Temporizador -----
let tempFin = 0, tempId = null;

function formatoTiempo(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return (h ? p(h) + ':' : '') + p(m) + ':' + p(x);
}

function descripcionTiempo(seg) {
  if (seg >= 3600 && seg % 3600 === 0) { const n = seg / 3600; return n + (n === 1 ? ' hora' : ' horas'); }
  if (seg >= 60 && seg % 60 === 0) { const n = seg / 60; return n + (n === 1 ? ' minuto' : ' minutos'); }
  return seg + (seg === 1 ? ' segundo' : ' segundos');
}

function pintarTemp() {
  const v = ventanas.temporizador;
  if (!v) return;
  const el = v.querySelector('.temp-num');
  if (el) el.textContent = tempId ? formatoTiempo((tempFin - Date.now()) / 1000) : '00:00';
}

function pararTemporizador() {
  clearInterval(tempId);
  tempId = null;
  pintarTemp();
}

function iniciarTemporizador(seg) {
  if (!(seg > 0)) return;
  abrirPrograma('temporizador', true);
  clearInterval(tempId);
  tempFin = Date.now() + seg * 1000;
  tempId = setInterval(() => {
    if (Date.now() >= tempFin) {
      pararTemporizador();
      pitar();
      hablar('Tu temporizador terminó.');
    } else { pintarTemp(); }
  }, 250);
  pintarTemp();
  hablar('Temporizador de ' + descripcionTiempo(seg) + ' iniciado.');
}

// ----- Clima (Open-Meteo, sin clave) -----
const CODIGOS_CLIMA = [
  [[0], 'despejado'], [[1, 2, 3], 'parcialmente nublado'], [[45, 48], 'con niebla'],
  [[51, 53, 55, 56, 57], 'con llovizna'], [[61, 63, 65, 66, 67], 'lluvioso'],
  [[71, 73, 75, 77], 'con nieve'], [[80, 81, 82], 'con chubascos'], [[95, 96, 99], 'con tormenta']
];

async function cargarClima(c) {
  c.textContent = 'Consultando el clima...';
  let lat = -16.5, lon = -68.15, lugar = 'La Paz (ubicación predeterminada)';
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }));
    lat = pos.coords.latitude; lon = pos.coords.longitude; lugar = 'Tu ubicación';
  } catch (e) {}
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code');
    const j = await r.json();
    const cu = j.current;
    let desc = 'variable';
    CODIGOS_CLIMA.forEach((par) => { if (par[0].includes(cu.weather_code)) desc = par[1]; });
    c.innerHTML = '';
    const a = document.createElement('div'); a.className = 'clima-temp'; a.textContent = Math.round(cu.temperature_2m) + ' °C';
    const b = document.createElement('div'); b.textContent = desc.charAt(0).toUpperCase() + desc.slice(1);
    const d = document.createElement('div'); d.className = 'clima-det';
    d.textContent = 'Humedad ' + cu.relative_humidity_2m + '% · Viento ' + Math.round(cu.wind_speed_10m) + ' km/h';
    const e = document.createElement('div'); e.className = 'clima-det'; e.textContent = lugar;
    c.appendChild(a); c.appendChild(b); c.appendChild(d); c.appendChild(e);
    hablar('En ' + lugar.replace(' (ubicación predeterminada)', '') + ' hay ' + Math.round(cu.temperature_2m) + ' grados y está ' + desc + '.');
  } catch (e) {
    c.textContent = 'No pude consultar el clima. Revisa tu internet.';
    hablar('No pude consultar el clima. Revisa tu internet.');
  }
}

function anotar(texto) {
  abrirPrograma('notas', true);
  const ta = ventanas.notas.querySelector('textarea');
  ta.value = (ta.value ? ta.value + '\n' : '') + '• ' + texto;
  guardar('notas', ta.value);
  hablar('Anotado en tus notas.');
}

const programas = {
  notas: {
    titulo: 'Notas', icono: '📝',
    crear(c) {
      const ta = document.createElement('textarea');
      ta.className = 'notas-texto';
      ta.placeholder = 'Escribe aquí o di: "anota comprar pilas"';
      ta.value = leer('notas', '');
      ta.addEventListener('input', () => guardar('notas', ta.value));
      c.appendChild(ta);
    }
  },
  calculadora: {
    titulo: 'Calculadora', icono: '🧮',
    crear(c) {
      const sub = document.createElement('div');
      sub.className = 'calc-sub';
      sub.textContent = 'Números grandes, raíces, potencias y %';
      const pantalla = document.createElement('input');
      pantalla.className = 'calc-pantalla'; pantalla.readOnly = true; pantalla.value = '0';
      const grid = document.createElement('div');
      grid.className = 'calc-teclas';
      let exp = '', acabado = false, ans = '0';
      const mostrar = () => { pantalla.value = bonita(exp) || '0'; };
      const igual = () => {
        if (!exp) return;
        try {
          const f = formatearResultado(evaluar(exp));
          sub.textContent = bonita(exp) + ' =';
          pantalla.value = f.pantalla;
          exp = f.interno; ans = f.interno || ans; acabado = true;
        } catch (e) {
          sub.textContent = e.mate ? e.message : 'Operación no válida';
          pantalla.value = 'Error'; exp = ''; acabado = false;
        }
      };
      const INSERTA = { '√': 'sqrt(', 'x²': '^2', 'n!': '!', 'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(', 'log': 'log(', 'ln': 'ln(', 'π': 'pi' };
      const filas = ['C', '⌫', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+',
        '√', '^', '%', 'π', 'x²', 'n!', 'sin', 'cos', 'tan', 'log', 'ln', 'Ans'];
      filas.forEach((k) => {
        const b = document.createElement('button');
        b.textContent = k === '*' ? '×' : k === '/' ? '÷' : k;
        b.addEventListener('click', () => {
          if (k === 'C') { exp = ''; acabado = false; sub.textContent = ''; mostrar(); return; }
          if (k === '⌫') { exp = exp.replace(/(sqrt\(|sin\(|cos\(|tan\(|log\(|ln\(|pi|.)$/, ''); mostrar(); return; }
          if (k === '=') { igual(); return; }
          let ins = k === 'Ans' ? ans : (INSERTA[k] !== undefined ? INSERTA[k] : k);
          const continua = /^[+\-*/^%!]/.test(ins);
          if (acabado && !continua) exp = '';
          acabado = false;
          exp += ins;
          mostrar();
        });
        grid.appendChild(b);
      });
      calcApi = {
        poner(bon, pant, interno) { sub.textContent = bon + ' ='; pantalla.value = pant; exp = interno; ans = interno || ans; acabado = true; }
      };
      c.appendChild(sub); c.appendChild(pantalla); c.appendChild(grid);
    }
  },
  temporizador: {
    titulo: 'Temporizador', icono: '⏱',
    crear(c) {
      c.innerHTML = '<div class="temp-num">00:00</div>' +
        '<div class="fila"><input type="number" min="1" value="1" class="temp-min"> <span>min</span>' +
        '<button class="temp-ini">Iniciar</button><button class="temp-det">Parar</button></div>';
      c.querySelector('.temp-ini').addEventListener('click', () => {
        const mins = parseFloat(c.querySelector('.temp-min').value) || 1;
        iniciarTemporizador(Math.round(mins * 60));
      });
      c.querySelector('.temp-det').addEventListener('click', pararTemporizador);
      pintarTemp();
    }
  },
  clima: {
    titulo: 'Clima', icono: '🌤', silencioso: true,
    crear(c) { cargarClima(c); },
    refrescar(c) { cargarClima(c); }
  }
};

// ----- Sitios web: abrir y cerrar -----
const SITIOS = {
  youtube: { nombre: 'YouTube', url: 'https://www.youtube.com' },
  google: { nombre: 'Google', url: 'https://www.google.com' },
  wikipedia: { nombre: 'Wikipedia', url: 'https://es.wikipedia.org' },
  gmail: { nombre: 'Gmail', url: 'https://mail.google.com' },
  maps: { nombre: 'Google Maps', url: 'https://maps.google.com' },
  mapas: { nombre: 'Google Maps', url: 'https://maps.google.com' },
  whatsapp: { nombre: 'WhatsApp Web', url: 'https://web.whatsapp.com' },
  spotify: { nombre: 'Spotify', url: 'https://open.spotify.com' },
  github: { nombre: 'GitHub', url: 'https://github.com' },
  drive: { nombre: 'Google Drive', url: 'https://drive.google.com' },
  traductor: { nombre: 'Google Traductor', url: 'https://translate.google.com' }
};
const sitiosAbiertos = {};

function abrirEnlace(url, nombre, clave) {
  const w = window.open(url, '_blank');
  if (w) {
    sitiosAbiertos[clave] = w;
    hablar('Abriendo ' + nombre + '.');
  } else {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    abrirPanel('v-programas');
    $('avisoEnlace').textContent = '';
    a.textContent = '👉 Pulsa aquí para abrir ' + nombre;
    a.className = 'enlace-grande';
    $('avisoEnlace').appendChild(a);
    hablar('Tu navegador bloqueó la ventana nueva. Pulsa el enlace que aparece en el panel para abrir ' + nombre + '.');
  }
}

function abrirSitio(k) {
  const s = SITIOS[k];
  if (s) abrirEnlace(s.url, s.nombre, k);
}

function cerrarSitio(k) {
  const s = SITIOS[k];
  const w = sitiosAbiertos[k];
  if (w && !w.closed) {
    w.close();
    delete sitiosAbiertos[k];
    hablar('Cerré ' + s.nombre + '.');
  } else {
    hablar('No abrí ' + (s ? s.nombre : 'eso') + ' desde aquí, así que no puedo cerrarlo. Ciérralo con Control más W.');
  }
}

function cerrarCosa(k) {
  if (/^(todo|todos|todas|ventanas|programas)$/.test(k)) {
    Object.keys(ventanas).forEach(cerrarPrograma);
    for (const s in sitiosAbiertos) {
      try { if (sitiosAbiertos[s] && !sitiosAbiertos[s].closed) sitiosAbiertos[s].close(); } catch (e) {}
      delete sitiosAbiertos[s];
    }
    hablar('Cerré todos los programas y sitios que abrí desde aquí.');
    return;
  }
  if (/nota|calculadora|temporizador|cronometro|clima/.test(k)) {
    const id = progDesde(k);
    if (ventanas[id]) { cerrarPrograma(id); hablar('Cerré ' + programas[id].titulo + '.'); }
    else hablar(programas[id].titulo + ' no está abierto.');
    return;
  }
  cerrarSitio(k);
}

// ----- Compartir pantalla -----
let streamPantalla = null;

async function compartirPantalla() {
  abrirPanel('v-pantalla');
  if (streamPantalla) { hablar('Ya estás compartiendo tu pantalla.'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    hablar('Tu navegador no permite compartir pantalla.');
    return;
  }
  try {
    streamPantalla = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    $('videoPantalla').srcObject = streamPantalla;
    $('avisoPantalla').style.display = 'none';
    $('btnPantalla').textContent = 'Dejar de compartir';
    streamPantalla.getVideoTracks()[0].addEventListener('ended', () => detenerPantalla(false));
    hablar('Compartiendo tu pantalla.');
  } catch (e) {
    streamPantalla = null;
    hablar('El navegador exige un clic tuyo para compartir la pantalla. Pulsa el botón Compartir pantalla del panel y elige qué mostrar.');
  }
}

function detenerPantalla(avisar) {
  if (!streamPantalla) { if (avisar) hablar('No estás compartiendo la pantalla.'); return; }
  streamPantalla.getTracks().forEach((tr) => tr.stop());
  streamPantalla = null;
  $('videoPantalla').srcObject = null;
  $('avisoPantalla').style.display = 'block';
  $('btnPantalla').textContent = 'Compartir pantalla';
  hablar('Dejé de compartir la pantalla.');
}

function capturaPantalla() {
  if (!streamPantalla) { hablar('Primero comparte tu pantalla con el botón del panel.'); return; }
  const v = $('videoPantalla');
  const c = document.createElement('canvas');
  c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
  c.getContext('2d').drawImage(v, 0, 0);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'captura-pantalla.png'; a.click();
  hablar('Captura guardada en tu carpeta de descargas.');
}

$('btnPantalla').addEventListener('click', () => { if (streamPantalla) detenerPantalla(true); else compartirPantalla(); });
$('btnCapturaPantalla').addEventListener('click', capturaPantalla);
$('btnPip').addEventListener('click', async () => {
  try { await $('videoPantalla').requestPictureInPicture(); }
  catch (e) { hablar('Primero comparte la pantalla para abrir la ventana flotante.'); }
});

// ----- Panel de comandos y recomendaciones -----
const GRUPOS_COMANDOS = [
  { titulo: 'Holograma y cámara', items: ['muestra el holograma', 'tres vistas', 'saluda', 'vuelve a la esfera', 'enciende la cámara', 'qué estoy haciendo', 'cuántos dedos tengo', 'qué objeto tengo en la mano', 'lee esto', 'activa la detección de gestos'] },
  { titulo: 'Búsqueda mundial y archivos', items: ['quién fue el primer presidente de Estados Unidos', 'busca en google la capital de Japón', 'conecta mi carpeta', 'abre el archivo informe', 'comparte pantalla', 'instala la app'] },
  { titulo: 'Control del PC (solo versión Windows)', items: ['abre excel', 'abre el archivo tarea de matemáticas', 'sube el volumen', 'toma una captura', 'qué programas tengo abiertos', 'activa el mouse real', 'cierra word', 'bloquea el computador'] },
  { titulo: 'Videos y pantalla', items: ['pon videos de gatos', 'muéstrame videos sobre el espacio', 'siguiente video', 'cierra el video', 'lee la pantalla', 'qué notificaciones tengo', 'vigila las notificaciones', 'pantalla completa'] },
  { titulo: 'Inglés / English', items: ['habla inglés', 'preséntate en inglés', 'cómo se dice buenos días en inglés', 'traduce gracias al inglés', '(en modo inglés) tell me a joke', '(en modo inglés) what is 25 times 4', '(en modo inglés) show me videos about space', '(en modo inglés) speak Spanish'] },
  { titulo: 'Excel, Word y documentos', items: ['abre excel', 'abre word', 'muestra el documento plantas', 'lee el documento', 'abre mis documentos'] },
  { titulo: 'Presentación (ante el público)', items: ['inicia la presentación', 'preséntate ante los jurados', 'siguiente', 'anterior', 'pausa', 'continúa', 'salir de la presentación'] },
  { titulo: 'Charla libre y juegos', items: ['¿de qué podemos hablar?', 'hablemos del espacio', 'juguemos una trivia', 'dime una adivinanza', 'cuéntame una historia', '¿cómo funcionas?', '¿quién te creó?', 'estoy nervioso', 'repite eso', 'habla más despacio', 'cállate'] },
  { titulo: 'Conversación', items: ['hola', 'cuéntame un chiste', 'dime un dato curioso', 'dime una frase motivadora', 'lanza una moneda', 'tira un dado', 'cómo estás'] },
  { titulo: 'Información', items: ['investiga sobre los agujeros negros', 'qué hora es', 'qué día es hoy', 'cómo está el clima', 'cuánto es 25 por 4'] },
  { titulo: 'Programas (se mueven por voz)', items: ['abre las notas', 'abre la calculadora', 'temporizador de 1 minuto', 'mueve las notas a la derecha', 'mueve la calculadora arriba a la izquierda', 'anota comprar pilas', 'cierra todo'] },
  { titulo: 'Pantalla y cámara', items: ['comparte pantalla', 'enciende la cámara', 'toma una foto', 'deja de compartir pantalla'] },
  { titulo: 'Sitios web', items: ['abre youtube', 'abre google', 'abre whatsapp', 'abre spotify', 'reproduce música relajante', 'cierra youtube'] },
  { titulo: 'Modelos 3D', items: ['crea un cubo rojo', 'crea una esfera azul', 'crea una dona morada', 'detén el modelo', 'borra el modelo'] },
  { titulo: 'Casa inteligente', items: ['enciende la luz de la sala', 'apaga todas las luces', 'enciende el ventilador', 'abre la puerta'] },
  { titulo: 'Matemáticas', items: ['raíz cuadrada de 144', '2 elevado a 100', 'el 20 por ciento de 350', 'factorial de 20', 'seno de 30', 'cuánto es 123456789 por 987654321'] },
  { titulo: 'Puntero y documentos', items: ['activa el puntero', 'pulsa cámara', 'haz clic en comandos', 'mueve el puntero a la derecha', 'desactiva el puntero', 'abre mis documentos', 'busca en mis documentos fotosíntesis'] },
  { titulo: 'Estilo', items: ['modo matrix', 'desactiva el modo matrix', 'cambia el color a rojo', 'cambia el color a morado', 'cámbiate el nombre a Luna'] }
];

function construirComandos() {
  const cont = $('listaComandos');
  cont.innerHTML = '';
  GRUPOS_COMANDOS.forEach((g) => {
    const h = document.createElement('h4');
    h.textContent = g.titulo;
    const fila = document.createElement('div');
    fila.className = 'chips';
    g.items.forEach((txt) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = txt;
      b.addEventListener('click', () => procesar(txt));
      fila.appendChild(b);
    });
    cont.appendChild(h); cont.appendChild(fila);
  });
}

function recomendar() {
  abrirPanel('v-comandos');
  const todos = [];
  GRUPOS_COMANDOS.forEach((g) => g.items.forEach((i) => todos.push(i)));
  const sug = [];
  while (sug.length < 3) { const x = elegir(todos); if (!sug.includes(x)) sug.push(x); }
  hablar('Te recomiendo probar: ' + sug.join(', ') + '. En el panel tienes más ideas, y puedes tocarlas para ejecutarlas.');
}

function construirLanzador() {
  const cont = $('lanzador');
  cont.innerHTML = '';
  const h1 = document.createElement('h4'); h1.textContent = 'Programas flotantes';
  const f1 = document.createElement('div'); f1.className = 'chips';
  Object.keys(programas).forEach((id) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = programas[id].icono + ' ' + programas[id].titulo;
    b.addEventListener('click', () => abrirPrograma(id));
    f1.appendChild(b);
  });
  const bp = document.createElement('button');
  bp.className = 'chip chip-puntero';
  bp.textContent = '🖱 Puntero virtual';
  bp.addEventListener('click', () => activarPuntero(!pu.activo));
  f1.appendChild(bp);
  const cerrarTodo = document.createElement('button');
  cerrarTodo.className = 'chip';
  cerrarTodo.textContent = '✕ Cerrar todo';
  cerrarTodo.addEventListener('click', () => cerrarCosa('todo'));
  f1.appendChild(cerrarTodo);

  const h2 = document.createElement('h4'); h2.textContent = 'Sitios web';
  const f2 = document.createElement('div'); f2.className = 'chips';
  ['youtube', 'google', 'wikipedia', 'gmail', 'maps', 'whatsapp', 'spotify', 'github', 'drive', 'traductor'].forEach((k) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = SITIOS[k].nombre;
    b.addEventListener('click', () => abrirSitio(k));
    f2.appendChild(b);
  });
  cont.appendChild(h1); cont.appendChild(f1); cont.appendChild(h2); cont.appendChild(f2);
}

// <<MATE
class ErrorMate extends Error { constructor(m) { super(m); this.mate = true; } }

const PALABRAS_NUM = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
};
const esPalabraNum = (w) => Object.prototype.hasOwnProperty.call(PALABRAS_NUM, w) || w === 'mil' || w === 'millon' || w === 'millones';

function palabrasANumero(t) {
  const tk = t.split(' ');
  const out = [];
  for (let i = 0; i < tk.length; i++) {
    if (!esPalabraNum(tk[i])) { out.push(tk[i]); continue; }
    let total = 0, actual = 0, j = i;
    while (j < tk.length) {
      const w = tk[j];
      if (w === 'y' && j > i && j + 1 < tk.length &&
          PALABRAS_NUM[tk[j - 1]] >= 30 && PALABRAS_NUM[tk[j - 1]] <= 90 &&
          PALABRAS_NUM[tk[j + 1]] >= 1 && PALABRAS_NUM[tk[j + 1]] <= 9) { j++; continue; }
      if (!esPalabraNum(w)) break;
      if (w === 'mil') { total += (actual || 1) * 1000; actual = 0; }
      else if (w === 'millon' || w === 'millones') { total = ((total + actual) || 1) * 1000000; actual = 0; }
      else actual += PALABRAS_NUM[w];
      j++;
    }
    out.push(String(total + actual));
    i = j - 1;
  }
  return out.join(' ');
}

function textoAExpresion(t) {
  let s = ' ' + t + ' ';
  s = s.replace(/\b(cuanto (?:es|da|vale|seria|sale|resulta|son)|cual es el resultado de|el resultado de|calcula|calcular|resuelve|resolver|operacion|dime|dame|numero|numeros|resultado|por favor)\b/g, ' ');
  s = s.replace(/por ciento/g, 'porciento');
  s = palabrasANumero(s.replace(/\s+/g, ' ').trim());
  s = ' ' + s + ' ';
  s = s.replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, (m) => m.replace(/\./g, '').replace(',', '.'));
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/(\d)\s+(?:coma|punto)\s+(\d)/g, '$1.$2');
  s = s.replace(/(?:la )?suma de (\d[\d.]*) y (\d[\d.]*)/g, '($1+$2)');
  s = s.replace(/(?:el )?producto de (\d[\d.]*) y (\d[\d.]*)/g, '($1*$2)');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:por ciento|porciento|%)\s*(?:de|del)\s*(\d+(?:\.\d+)?)/g, '(($1/100)*$2)');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:por ciento|porciento)/g, '($1/100)');
  s = s.replace(/raiz cuadrada (?:de |del )?(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  s = s.replace(/raiz cubica (?:de |del )?(\d+(?:\.\d+)?)/g, 'cbrt($1)');
  s = s.replace(/raiz (?:de |del )?(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  const MAPF = { seno: 'sin', coseno: 'cos', tangente: 'tan', 'logaritmo natural': 'ln', logaritmo: 'log', ln: 'ln' };
  s = s.replace(/(logaritmo natural|logaritmo|seno|coseno|tangente|\bln)\s*(?:de |del )?(\d+(?:\.\d+)?)(?:\s*grados)?/g, (m, f, n) => ' ' + MAPF[f.trim()] + '(' + n + ') ');
  s = s.replace(/factorial (?:de |del )?(\d+)/g, '($1!)');
  s = s.replace(/(\d+)\s+factorial/g, '($1!)');
  s = s.replace(/(?:la )?mitad de (\d+(?:\.\d+)?)/g, '($1/2)');
  s = s.replace(/(?:el )?doble de (\d+(?:\.\d+)?)/g, '($1*2)');
  s = s.replace(/(?:el )?triple de (\d+(?:\.\d+)?)/g, '($1*3)');
  s = s.replace(/(?:el )?cuadrado de (\d+(?:\.\d+)?)/g, '($1^2)');
  s = s.replace(/(?:el )?cubo de (\d+(?:\.\d+)?)/g, '($1^3)');
  s = s.replace(/(\d+(?:\.\d+)?|\))\s*al cuadrado/g, '$1^2');
  s = s.replace(/(\d+(?:\.\d+)?|\))\s*al cubo/g, '$1^3');
  s = s.replace(/(\d+(?:\.\d+)?|\))\s*(?:elevado a la potencia de|elevado a la|elevado al|elevado a|a la potencia de|a la potencia|a la)\s*(?:potencia\s*)?(-?\d+(?:\.\d+)?)/g, '$1^$2');
  s = s.replace(/\b(multiplicado por|multiplicado|veces|por)\b/g, ' * ');
  s = s.replace(/\b(dividido entre|dividido por|dividido|entre|sobre)\b/g, ' / ');
  s = s.replace(/\bmas\b/g, ' + ').replace(/\bmenos\b/g, ' - ');
  s = s.replace(/(\d|\))\s*x\s*(\d|\()/g, '$1*$2');
  s = s.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/\b(de|del|el|la|los|las|es|son|igual|a|y|con|cuanto|cuantos|da|que)\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function tokenizar(s) {
  const tk = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const lit = s.slice(i, j);
      if (lit === '.' || (lit.match(/\./g) || []).length > 1) throw new ErrorMate('Hay un número mal escrito.');
      tk.push({ t: 'n', v: lit.includes('.') ? Number(lit) : BigInt(lit) });
      i = j; continue;
    }
    if (/[a-z]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-z0-9_]/i.test(s[j])) j++;
      tk.push({ t: 'id', v: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if ('+-*/^()!%'.includes(ch)) { tk.push({ t: ch }); i++; continue; }
    throw new ErrorMate('Hay un símbolo que no entiendo: ' + ch);
  }
  return tk;
}

const aNum = (v) => (typeof v === 'bigint' ? Number(v) : v);
function chequear(r) {
  if (typeof r === 'number' && !isFinite(r)) throw new ErrorMate('El resultado no está definido o es demasiado grande.');
  return r;
}
const ambosBig = (a, b) => typeof a === 'bigint' && typeof b === 'bigint';
const sumar = (a, b) => (ambosBig(a, b) ? a + b : chequear(aNum(a) + aNum(b)));
const restar = (a, b) => (ambosBig(a, b) ? a - b : chequear(aNum(a) - aNum(b)));
const multiplicar = (a, b) => (ambosBig(a, b) ? a * b : chequear(aNum(a) * aNum(b)));
const negar = (a) => (typeof a === 'bigint' ? -a : -a);
function dividir(a, b) {
  if (aNum(b) === 0) throw new ErrorMate('No se puede dividir entre cero.');
  if (ambosBig(a, b)) return a % b === 0n ? a / b : chequear(Number(a) / Number(b));
  return chequear(aNum(a) / aNum(b));
}
function potencia(a, b) {
  if (ambosBig(a, b) && b >= 0n) {
    if (b === 0n) return 1n;
    if (a === 0n || a === 1n) return a;
    if (a === -1n) return b % 2n === 0n ? 1n : -1n;
    const digitos = Number(b) * Math.log10(Math.abs(Number(a)));
    if (!isFinite(digitos) || digitos > 20000) throw new ErrorMate('El resultado es demasiado grande para calcularlo.');
    return a ** b;
  }
  const r = Math.pow(aNum(a), aNum(b));
  if (isNaN(r)) throw new ErrorMate('Esa potencia no tiene resultado real.');
  return chequear(r);
}
function factorial(a) {
  const n = typeof a === 'bigint' ? a : (Number.isInteger(a) ? BigInt(a) : null);
  if (n === null || n < 0n || n > 3000n) throw new ErrorMate('El factorial solo funciona con enteros de 0 a 3000.');
  let r = 1n;
  for (let i = 2n; i <= n; i++) r *= i;
  return r;
}
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
const limpiarNum = (r) => {
  if (Math.abs(r) < 1e-12) return 0;
  return Number(r.toPrecision(12));
};
const FUNCIONES = {
  sqrt: (x) => {
    if (aNum(x) < 0) throw new ErrorMate('No existe la raíz cuadrada de un número negativo.');
    if (typeof x === 'bigint') { const r = isqrt(x); return r * r === x ? r : Math.sqrt(Number(x)); }
    return Math.sqrt(x);
  },
  cbrt: (x) => limpiarNum(Math.cbrt(aNum(x))),
  sin: (x) => limpiarNum(Math.sin(aNum(x) * Math.PI / 180)),
  cos: (x) => limpiarNum(Math.cos(aNum(x) * Math.PI / 180)),
  tan: (x) => {
    const r = Math.tan(aNum(x) * Math.PI / 180);
    if (Math.abs(r) > 1e12) throw new ErrorMate('La tangente no está definida en ese ángulo.');
    return limpiarNum(r);
  },
  log: (x) => { if (aNum(x) <= 0) throw new ErrorMate('El logaritmo solo existe para números positivos.'); return limpiarNum(Math.log10(aNum(x))); },
  ln: (x) => { if (aNum(x) <= 0) throw new ErrorMate('El logaritmo solo existe para números positivos.'); return limpiarNum(Math.log(aNum(x))); },
  abs: (x) => (typeof x === 'bigint' ? (x < 0n ? -x : x) : Math.abs(x)),
  round: (x) => (typeof x === 'bigint' ? x : BigInt(Math.round(x))),
  floor: (x) => (typeof x === 'bigint' ? x : BigInt(Math.floor(x))),
  ceil: (x) => (typeof x === 'bigint' ? x : BigInt(Math.ceil(x))),
  fact: (x) => factorial(x)
};

function evaluar(expr) {
  if (expr.length > 3000) throw new ErrorMate('La operación es demasiado larga.');
  const tk = tokenizar(expr);
  let pos = 0;
  const es = (t) => pos < tk.length && tk[pos].t === t;
  function expresion() {
    let v = termino();
    while (es('+') || es('-')) { const op = tk[pos++].t; const w = termino(); v = op === '+' ? sumar(v, w) : restar(v, w); }
    return v;
  }
  function termino() {
    let v = unario();
    for (;;) {
      if (es('*')) { pos++; v = multiplicar(v, unario()); }
      else if (es('/')) { pos++; v = dividir(v, unario()); }
      else if (es('(') || es('id')) { v = multiplicar(v, unario()); }
      else break;
    }
    return v;
  }
  function unario() {
    if (es('-')) { pos++; return negar(unario()); }
    if (es('+')) { pos++; return unario(); }
    const base = posfijo();
    if (es('^')) { pos++; return potencia(base, unario()); }
    return base;
  }
  function posfijo() {
    let v = primario();
    for (;;) {
      if (es('!')) { pos++; v = factorial(v); }
      else if (es('%')) { pos++; v = dividir(v, 100n); }
      else break;
    }
    return v;
  }
  function primario() {
    const t = tk[pos];
    if (!t) throw new ErrorMate('La operación está incompleta.');
    if (t.t === 'n') { pos++; return t.v; }
    if (t.t === '(') {
      pos++;
      const v = expresion();
      if (!es(')')) throw new ErrorMate('Falta cerrar un paréntesis.');
      pos++; return v;
    }
    if (t.t === 'id') {
      pos++;
      if (t.v === 'pi') return Math.PI;
      if (t.v === 'e') return Math.E;
      const f = FUNCIONES[t.v];
      if (!f) throw new ErrorMate('No entiendo la palabra "' + t.v + '" en la operación.');
      if (!es('(')) throw new ErrorMate('Falta el paréntesis después de ' + t.v + '.');
      pos++;
      const a = expresion();
      if (!es(')')) throw new ErrorMate('Falta cerrar un paréntesis.');
      pos++;
      return chequear(f(a));
    }
    throw new ErrorMate('La operación no se entiende.');
  }
  const r = expresion();
  if (pos < tk.length) throw new ErrorMate('Sobran símbolos en la operación.');
  return r;
}

function agruparMiles(dig) { return dig.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function formatearResultado(v) {
  if (typeof v === 'bigint') {
    const neg = v < 0n;
    const dig = (neg ? -v : v).toString();
    const sg = neg ? '-' : '';
    if (dig.length <= 15) return { pantalla: sg + agruparMiles(dig), voz: (neg ? 'menos ' : '') + dig, interno: sg + dig };
    let m = dig[0] + ',' + dig.slice(1, 3);
    m = m.replace(/,?0+$/, '');
    const voz = (neg ? 'menos ' : '') + 'aproximadamente ' + m + ' por 10 elevado a la ' + (dig.length - 1);
    const pantalla = dig.length <= 60 ? sg + agruparMiles(dig) : sg + agruparMiles(dig.slice(0, 24)) + '… (' + dig.length + ' dígitos)';
    return { pantalla, voz, interno: dig.length <= 4000 ? sg + dig : '' };
  }
  const r = Number(v.toPrecision(12));
  const abs = Math.abs(r);
  if (r !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    const exp = Math.floor(Math.log10(abs));
    let mant = (r / Math.pow(10, exp)).toFixed(3).replace(/\.?0+$/, '');
    return { pantalla: mant.replace('.', ',') + ' × 10^' + exp, voz: mant.replace('.', ',') + ' por 10 elevado a la ' + exp, interno: '' };
  }
  return {
    pantalla: r.toLocaleString('es-ES', { maximumFractionDigits: 10 }),
    voz: String(r).replace('.', ','),
    interno: String(r)
  };
}

function bonita(e) {
  return String(e).replace(/\*/g, '×').replace(/\//g, '÷').replace(/sqrt\(/g, '√(').replace(/\bpi\b/g, 'π').replace(/(\d)\.(\d)/g, '$1,$2').replace(/\s+/g, ' ').trim();
}

const VOCAB_MATE = new Set(['mas', 'menos', 'por', 'entre', 'dividido', 'multiplicado', 'elevado', 'a', 'la', 'al', 'cuadrado', 'cubo',
  'cubica', 'raiz', 'de', 'del', 'el', 'x', 'y', 'coma', 'punto', 'porciento', 'ciento', 'factorial', 'pi', 'seno', 'coseno',
  'tangente', 'logaritmo', 'natural', 'mitad', 'doble', 'triple', 'grados', 'veces', 'sobre', 'potencia', 'suma', 'producto', 'ciento']);
const OPERADORES_MATE = new Set(['mas', 'menos', 'por', 'entre', 'dividido', 'multiplicado', 'elevado', 'raiz', 'factorial', 'veces', 'sobre', 'cuadrado', 'cubo', 'mitad', 'doble', 'triple']);

function pareceOperacion(t) {
  if (/^[\d\s.,+\-*/^()%x×÷]+$/.test(t)) return /\d/.test(t) && /[+\-*/^×÷]|\d\s*x\s*\d/.test(t);
  const tk = t.split(' ');
  if (tk.length < 2) return false;
  let hayNum = false, hayOp = false;
  for (const w of tk) {
    if (/^[\d.,]+$/.test(w) || esPalabraNum(w)) hayNum = true;
    else if (/^[+\-*/^%×÷]$/.test(w)) hayOp = true;
    else if (VOCAB_MATE.has(w)) { if (OPERADORES_MATE.has(w)) hayOp = true; }
    else return false;
  }
  return hayNum && hayOp;
}

const DISPARADORES_MATE = /(cuanto (es|da|vale|seria|sale|resulta|son)\b|\bcalcula\b|\bresuelve\b|raiz (cuadrada|cubica|de)\b|elevado a|a la potencia|por ciento|porciento|\d\s*%\s*de\b|al cuadrado|al cubo|\bfactorial\b|\bseno de\b|\bcoseno de\b|\btangente de\b|\blogaritmo\b|\bmitad de\b|\bdoble de\b|\btriple de\b|dividido (entre|por)|multiplicado por)/;
function esPeticionMatematica(t) { return DISPARADORES_MATE.test(t) || pareceOperacion(t); }
// MATE>>

let calcApi = null;

function calcularVoz(t) {
  const expr = textoAExpresion(t);
  if (!/[0-9]/.test(expr) && !/\bpi\b/.test(expr)) return false;
  try {
    const f = formatearResultado(evaluar(expr));
    const linea = bonita(expr) + ' = ' + f.pantalla;
    hablar('El resultado es ' + f.voz + '.', linea);
    if (calcApi && ventanas.calculadora) calcApi.poner(bonita(expr), f.pantalla, f.interno);
    return true;
  } catch (e) {
    hablar(e.mate ? e.message : 'No pude entender esa operación. Prueba con "raíz cuadrada de 144" o "el 20 por ciento de 350".');
    return true;
  }
}


// ---------------------------------------------------------------------
//  COMPRENSIÓN LIBRE DEL LENGUAJE
// ---------------------------------------------------------------------
const STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'que', 'mi', 'mis',
  'tu', 'me', 'te', 'se', 'lo', 'le', 'por', 'para', 'con', 'es', 'esta', 'este', 'ese', 'eso', 'algo', 'muy', 'ya']);

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[n];
}

function simTok(a, b) {
  if (a === b) return 1;
  const m = Math.max(a.length, b.length);
  if (m <= 3) return (a[0] === b[0] && levenshtein(a, b) <= 1 && m === 3) ? 0.75 : 0;
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  const s = 1 - levenshtein(a, b) / m;
  return s >= 0.72 ? s : 0;
}

function tokensClave(t) {
  return normalizar(t).split(' ').filter((x) => x && !STOP.has(x));
}

const FRASES_RELLENO = [
  /\bpor favor\b/g, /\bporfa(?:vor)?\b/g, /\bsi eres tan amable\b/g, /\bquiero que\b/g, /\bnecesito que\b/g,
  /\bme gustaria que\b/g, /\bquisiera que\b/g, /\bte pido que\b/g, /\bte pido\b/g, /\bme puedes\b/g, /\bme podrias\b/g,
  /(?<!que )\bpuedes\b/g, /\bpodrias\b/g, /\bpodria\b/g, /\bsera que\b/g, /\bme ayudas a\b/g, /\bayudame a\b/g,
  /\bquiero saber\b/g, /\bme gustaria saber\b/g, /\bnecesito saber\b/g, /\bquisiera saber\b/g, /\bpodrias decirme\b/g,
  /\bsabes\b/g, /\bahora mismo\b/g, /\bun momento\b/g, /\bahorita\b/g
];

const FORMAS_VERBALES = [
  [/\b(?:abrir|abra|abras|abreme|abrime)\b/g, 'abre'],
  [/\b(?:cerrar|cierre|cierres|cierrame|cerrame)\b/g, 'cierra'],
  [/\b(?:encender|encienda|enciendas|enciendeme)\b/g, 'enciende'],
  [/\b(?:prender|prenda|prendas|prendeme)\b/g, 'prende'],
  [/\b(?:apagar|apague|apagues|apagame)\b/g, 'apaga'],
  [/\b(?:mostrar|muestres|muestrame|enseñame|ensename)\b/g, 'muestra'],
  [/\b(?:crear|cree|crees|creame)\b/g, 'crea'],
  [/\b(?:generar|genere|generes)\b/g, 'genera'],
  [/\b(?:hacer|haga|hagas)\b/g, 'haz'],
  [/\b(?:buscar|busque|busques)\b/g, 'busca'],
  [/\b(?:investigar|investigue|investigues)\b/g, 'investiga'],
  [/\b(?:calcular|calcule|calcules)\b/g, 'calcula'],
  [/\b(?:mover|mueva|muevas)\b/g, 'mueve'],
  [/\b(?:compartir|comparta|compartas)\b/g, 'comparte'],
  [/\b(?:activar|active|actives)\b/g, 'activa'],
  [/\b(?:desactivar|desactive|desactives)\b/g, 'desactiva'],
  [/\b(?:poner|ponga|pongas)\b/g, 'pon'],
  [/\b(?:reproducir|reproduzca|reproduzcas)\b/g, 'reproduce'],
  [/\b(?:anotar|anote|anotes)\b/g, 'anota'],
  [/\b(?:tomar|tome|tomes)\b/g, 'toma'],
  [/\b(?:sacar|saque|saques)\b/g, 'saca'],
  [/\b(?:pulsar|pulse|pulses)\b/g, 'pulsa'],
  [/\b(?:presionar|presione|presiones)\b/g, 'presiona']
];

const MAL_OIDAS = [
  [/\b(?:you tube|yutub\w*|yutu|iutub\w*)\b/g, 'youtube'],
  [/\b(?:guatsap|wasap|guasap|whats app|wats app|watsap)\b/g, 'whatsapp'],
  [/\b(?:espotifai|spotifi|espotify)\b/g, 'spotify'],
  [/\b(?:gugle|guguel|googel)\b/g, 'google'],
  [/\b(?:matrics|matris|matrics)\b/g, 'matrix'],
  [/\b(?:camera)\b/g, 'camara'],
  [/\b(?:calculador|calculadora de)\b/g, 'calculadora'],
  [/\b(?:punteros|cursor|raton|mouse|flecha)\b/g, 'puntero']
];

function humanizar(t) {
  let s = t;
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^(?:eh+|ehm+|este|bueno|o sea|osea|a ver|pues|oye|mira|digamos|entonces|hmm+|mmm+|ahm|ah|ok|okay|vale)\s+(?=\S)/, '');
  }
  s = s.replace(/^(?:hola|buenas|hey)\s+(?=\S+\s+\S)/, '');
  FRASES_RELLENO.forEach((r) => { s = s.replace(r, ' '); });
  s = s.replace(/\bquiero ver\b/g, 'muestra').replace(/\bquiero (?:escuchar|oir)\b/g, 'reproduce');
  FORMAS_VERBALES.forEach((par) => { s = s.replace(par[0], par[1]); });
  MAL_OIDAS.forEach((par) => { s = s.replace(par[0], par[1]); });
  return s.replace(/\s+/g, ' ').trim();
}

const FRASES_DIFUSAS = [
  'abre las notas', 'abre la calculadora', 'abre el clima', 'comparte pantalla', 'deja de compartir pantalla',
  'enciende la camara', 'apaga la camara', 'toma una foto', 'abre youtube', 'abre google', 'abre wikipedia',
  'abre gmail', 'abre maps', 'abre whatsapp', 'abre spotify', 'abre github', 'crea un cubo', 'crea una esfera',
  'crea un cono', 'crea un cilindro', 'crea una dona', 'crea una piramide', 'detener el modelo', 'borra el modelo',
  'enciende la luz de la sala', 'apaga la luz de la sala', 'enciende la luz del cuarto', 'apaga la luz del cuarto',
  'enciende el ventilador', 'apaga el ventilador', 'abre la puerta', 'cierra la puerta', 'apaga todas las luces',
  'enciende todas las luces', 'modo matrix', 'desactiva el modo matrix', 'que hora es', 'que dia es hoy',
  'como esta el clima', 'cuentame un chiste', 'dime un dato curioso', 'dime una frase motivadora', 'tira un dado',
  'lanza una moneda', 'cierra todo', 'activa el puntero', 'desactiva el puntero', 'que puedes hacer', 'abre mis documentos'
].map((f) => ({ f, tk: tokensClave(f) })).filter((x) => x.tk.length >= 2);

function puntuarFrase(entrada, canon) {
  if (!canon.length || !entrada.length) return 0;
  let suma = 0;
  for (const c of canon) {
    let mejor = 0;
    for (const e of entrada) mejor = Math.max(mejor, simTok(c, e));
    suma += mejor;
  }
  let score = suma / canon.length;
  const extra = entrada.length - canon.length;
  if (extra > 2) score -= 0.08 * (extra - 2);
  return score;
}

function mejorCoincidencia(t) {
  const entrada = tokensClave(t);
  let mejor = { f: null, score: 0 };
  FRASES_DIFUSAS.forEach((x) => {
    const s = puntuarFrase(entrada, x.tk);
    if (s > mejor.score) mejor = { f: x.f, score: s };
  });
  return mejor;
}

function intentoDifuso(t) {
  const m = mejorCoincidencia(t);
  return m.score >= 0.8 ? m.f : null;
}

function puntuarComando(texto) {
  return mejorCoincidencia(humanizar(normalizar(texto))).score;
}

function elegirAlternativa(r) {
  const primera = r[0].transcript;
  if (r.length < 2 || puntuarComando(primera) >= 0.8) return primera;
  for (let i = 1; i < r.length; i++) {
    if (puntuarComando(r[i].transcript) >= 0.8) return r[i].transcript;
  }
  return primera;
}


// ---------------------------------------------------------------------
//  DOCUMENTOS PROPIOS (txt, md, csv, json, html, pdf, docx)
// ---------------------------------------------------------------------
const docs = [];
const DOCS_MAX_GUARDADO = 1200000;

function raizPalabra(w) {
  if (w.length > 4) w = w.replace(/(es|s)$/, '');
  return w.length > 6 ? w.slice(0, 6) : w;
}
function palabrasDe(t) {
  return normalizar(t).split(' ').filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w)).map(raizPalabra);
}

function partirLargo(s, salida) {
  if (s.length <= 700) { salida.push(s); return; }
  let i = 0;
  while (i < s.length) {
    let fin = Math.min(s.length, i + 520);
    if (fin < s.length) { const sp = s.lastIndexOf(' ', fin); if (sp > i + 300) fin = sp; }
    salida.push(s.slice(i, fin).trim());
    if (fin >= s.length) break;
    i = Math.max(fin - 80, i + 1);
  }
}

function trocear(texto) {
  const out = [];
  texto.replace(/\r/g, '').split(/\n\s*\n+/).forEach((p0) => {
    const p = p0.replace(/\s+/g, ' ').trim();
    if (p.length < 12) return;
    if (p.length <= 600) { out.push(p); return; }
    let acc = '';
    p.split(/(?<=[.!?])\s+/).forEach((f) => {
      if (acc && (acc + ' ' + f).length > 520) { partirLargo(acc.trim(), out); acc = f; }
      else acc += ' ' + f;
    });
    if (acc.trim()) partirLargo(acc.trim(), out);
  });
  return out;
}

function agregarDoc(nombre, texto) {
  const i = docs.findIndex((d) => d.nombre === nombre);
  if (i >= 0) docs.splice(i, 1);
  docs.push({ nombre, texto, trozos: trocear(texto).map((t) => ({ t, p: new Set(palabrasDe(t)) })) });
}

function guardarDocs() {
  const datos = JSON.stringify(docs.map((d) => ({ nombre: d.nombre, texto: d.texto })));
  if (datos.length <= DOCS_MAX_GUARDADO) { guardar('docs_v1', datos); return true; }
  guardar('docs_v1', '');
  return false;
}

function cargarDocsGuardados() {
  try {
    const d = JSON.parse(leer('docs_v1', '[]') || '[]');
    d.forEach((x) => agregarDoc(x.nombre, x.texto));
  } catch (e) {}
}

async function leerArchivo(file) {
  const n = file.name.toLowerCase();
  if (/\.(txt|md|csv|json|log|xml)$/.test(n)) return await file.text();
  if (/\.html?$/.test(n)) {
    const d = new DOMParser().parseFromString(await file.text(), 'text/html');
    d.querySelectorAll('script,style').forEach((e) => e.remove());
    return (d.body ? d.body.textContent : '') || '';
  }
  if (n.endsWith('.pdf')) {
    await cargarScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let out = '';
    const max = Math.min(pdf.numPages, 400);
    for (let i = 1; i <= max; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      out += c.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
    }
    return out;
  }
  if (n.endsWith('.docx')) {
    await cargarScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  throw new Error('formato no compatible');
}

async function cargarArchivos(lista) {
  let nuevos = 0;
  for (const f of Array.from(lista)) {
    $('estadoDocs').textContent = 'Leyendo ' + f.name + '...';
    try {
      const texto = ((await leerArchivo(f)) || '').trim();
      if (!texto) { $('estadoDocs').textContent = f.name + ' no tiene texto legible (puede ser un escaneo).'; continue; }
      agregarDoc(f.name, texto);
      nuevos++;
    } catch (e) {
      $('estadoDocs').textContent = 'No pude leer ' + f.name + ': ' + (e && e.message ? e.message : 'error') + '. Formatos: txt, md, csv, json, html, pdf, docx.';
    }
  }
  const cabe = guardarDocs();
  pintarDocs();
  if (nuevos) {
    $('estadoDocs').textContent = nuevos + ' documento(s) listo(s).' + (cabe ? '' : ' Son muy grandes para recordarlos: tendrás que cargarlos de nuevo la próxima vez.');
    hablar('Cargué ' + nuevos + ' documento' + (nuevos > 1 ? 's' : '') + '. Ya puedes preguntarme sobre ellos.');
  }
}

function pintarDocs() {
  const c = $('listaDocs');
  c.innerHTML = '';
  if (!docs.length) { c.textContent = 'Todavía no hay documentos cargados.'; return; }
  docs.forEach((d, i) => {
    const fila = document.createElement('div');
    fila.className = 'doc-fila';
    const nom = document.createElement('span');
    nom.textContent = '📄 ' + d.nombre + ' · ' + d.trozos.length + ' fragmentos';
    const x = document.createElement('button');
    x.textContent = '✕';
    x.addEventListener('click', () => { docs.splice(i, 1); guardarDocs(); pintarDocs(); });
    fila.appendChild(nom); fila.appendChild(x);
    c.appendChild(fila);
  });
}

function resumir(txt, max) {
  if (txt.length <= max) return txt;
  const corte = txt.lastIndexOf(' ', max);
  return txt.slice(0, corte > max / 2 ? corte : max).trim() + '…';
}

function mostrarResultadosDocs(consulta, top) {
  const c = $('resultadosDocs');
  c.innerHTML = '';
  const h = document.createElement('h4');
  h.textContent = 'Resultados para "' + consulta + '"';
  c.appendChild(h);
  if (!top.length) { const p = document.createElement('p'); p.textContent = 'No encontré nada en tus documentos.'; c.appendChild(p); return; }
  top.forEach((r) => {
    const caja = document.createElement('div');
    caja.className = 'res-doc';
    const t = document.createElement('strong');
    t.textContent = r.d.nombre;
    const p = document.createElement('p');
    p.textContent = resumir(r.tr.t, 520);
    caja.appendChild(t); caja.appendChild(p);
    c.appendChild(caja);
  });
}

function buscarEnDocs(consulta, estricto) {
  const q = Array.from(new Set(palabrasDe(consulta)));
  if (!q.length || !docs.length) return false;
  const todos = [];
  docs.forEach((d) => d.trozos.forEach((tr) => todos.push({ d, tr })));
  const idf = q.map((w) => {
    let df = 0;
    for (const x of todos) if (x.tr.p.has(w)) df++;
    return Math.log(1 + todos.length / (1 + df));
  });
  const res = [];
  for (const x of todos) {
    let s = 0, hit = 0;
    q.forEach((w, i) => { if (x.tr.p.has(w)) { s += idf[i]; hit++; } });
    if (hit) res.push({ d: x.d, tr: x.tr, s, cov: hit / q.length });
  }
  res.sort((a, b) => b.s - a.s);
  const top = res.slice(0, 3);
  const mejor = top[0];
  const bueno = !!mejor && mejor.cov >= 0.6 && (q.length >= 2 || q[0].length >= 5);
  if (estricto && !bueno) return false;
  abrirPanel('v-docs');
  $('buscarDocs').value = consulta;
  mostrarResultadosDocs(consulta, top);
  if (!mejor) { hablar('No encontré nada sobre eso en tus documentos.'); return true; }
  hablar('En ' + mejor.d.nombre + ' encontré: ' + resumir(mejor.tr.t, 300));
  return true;
}

function consultaDocs(t) {
  if (!/\b(documentos?|archivos?|apuntes|pdfs?)\b/.test(t)) return null;
  return t.replace(/\b(busca|buscame|encuentra|encuentrame|investiga|averigua|dime|que|dice|dicen|decia|segun|en|entre|dentro|de|del|mis|mi|los|las|el|la|todos|todas|documentos?|archivos?|apuntes|pdfs?|sobre|acerca|respecto|informacion|cuentame|hablame|lee|resumen|resume|y|algo)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function listarDocs() {
  abrirPanel('v-docs');
  if (!docs.length) { hablar('Todavía no has cargado ningún documento.'); return; }
  hablar('Tienes ' + docs.length + ' documento' + (docs.length > 1 ? 's' : '') + ': ' + docs.map((d) => d.nombre).join(', ') + '.');
}

function borrarDocs() {
  docs.length = 0;
  guardarDocs();
  pintarDocs();
  $('resultadosDocs').innerHTML = '';
  hablar('Borré todos tus documentos.');
}

$('archivosDocs').addEventListener('change', (e) => { cargarArchivos(e.target.files); e.target.value = ''; });
$('btnLimpiarDocs').addEventListener('click', borrarDocs);
$('btnBuscarDocs').addEventListener('click', () => {
  const q = $('buscarDocs').value.trim();
  if (!q) return;
  if (!docs.length) { hablar('Primero carga algún documento.'); return; }
  buscarEnDocs(q, false);
});
$('buscarDocs').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnBuscarDocs').click(); });
['dragover', 'drop'].forEach((ev) => $('v-docs').addEventListener(ev, (e) => {
  e.preventDefault();
  if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files);
}));


// ---------------------------------------------------------------------
//  RASTREO DE MANOS + PUNTERO VIRTUAL
// ---------------------------------------------------------------------
const rastreo = { activo: false, hands: null, cam: null };
const pu = { activo: false, x: window.innerWidth / 2, y: window.innerHeight / 2, pellizco: false, arrastre: null, hist: [], temp: null };
const CLICKABLES = 'button, a[href], select, label, summary, .chip, .dispositivo, [data-vista]';

async function iniciarRastreo() {
  if (rastreo.activo) return true;
  try {
    await cargarScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    await cargarScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
  } catch (e) {}
  if (typeof Hands === 'undefined' || typeof Camera === 'undefined') return false;
  try {
    const l = $('manos');
    l.width = 640; l.height = 480;
    rastreo.hands = new Hands({ locateFile: (f) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f });
    rastreo.hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    rastreo.hands.onResults(alResultadoManos);
    const v = $('videoRastreo');
    rastreo.cam = new Camera(v, {
      onFrame: async () => { if (rastreo.hands) await rastreo.hands.send({ image: v }); },
      width: 640, height: 480
    });
    await rastreo.cam.start();
    rastreo.activo = true;
    return true;
  } catch (e) {
    detenerRastreo();
    return false;
  }
}

function detenerRastreo() {
  try { if (rastreo.cam) rastreo.cam.stop(); } catch (e) {}
  try { if (rastreo.hands && rastreo.hands.close) rastreo.hands.close(); } catch (e) {}
  rastreo.cam = null; rastreo.hands = null; rastreo.activo = false;
  const l = $('manos');
  l.getContext('2d').clearRect(0, 0, l.width, l.height);
}

function pintarPuntero(x, y, suave) {
  const p = $('puntero');
  pu.x = x; pu.y = y;
  p.classList.toggle('suave', !!suave);
  p.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}

let _hover = null;
function resaltar(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest(CLICKABLES);
  if (t !== _hover) {
    if (_hover) _hover.classList.remove('pu-hover');
    if (t) t.classList.add('pu-hover');
    _hover = t;
  }
}

function efectoClic(x, y) {
  const o = document.createElement('div');
  o.className = 'onda';
  o.style.left = x + 'px'; o.style.top = y + 'px';
  document.body.appendChild(o);
  setTimeout(() => o.remove(), 650);
}

function activarElemento(el) {
  if (el.matches('.btn-archivo, label[for="archivosDocs"]')) {
    hablar('Por seguridad, el navegador exige que tú mismo pulses ese botón con el mouse.');
    return;
  }
  if (el.matches('input, textarea')) { el.focus(); return; }
  el.click();
}

function pinchar(x, y) {
  efectoClic(x, y);
  $('puntero').classList.add('pulsado');
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  const cab = el.closest('.vent header');
  if (cab && !el.closest('button')) {
    const v = cab.parentElement, r = v.getBoundingClientRect();
    pu.arrastre = { tipo: 'vent', v, dx: x - r.left, dy: y - r.top };
    v.classList.add('arrastrando');
    traerAlFrente(v);
    return;
  }
  const vm = el.closest('#ventana');
  if (vm) {
    const r = vm.getBoundingClientRect();
    pu.arrastre = { tipo: 'marco', v: vm, dx: x - r.left, dy: y - r.top };
    vm.classList.add('agarrada');
    return;
  }
  const obj = el.closest(CLICKABLES + ', input, textarea');
  if (obj) activarElemento(obj);
}

function soltarPuntero() {
  $('puntero').classList.remove('pulsado');
  if (pu.arrastre) {
    pu.arrastre.v.classList.remove('arrastrando', 'agarrada');
    pu.arrastre = null;
  }
  pu.pellizco = false;
}

function arrastrarCon(x, y) {
  const a = pu.arrastre;
  if (!a) return;
  if (a.tipo === 'vent') {
    a.v.style.left = Math.max(0, Math.min(window.innerWidth - a.v.offsetWidth, x - a.dx)) + 'px';
    a.v.style.top = Math.max(0, Math.min(window.innerHeight - 60, y - a.dy)) + 'px';
  } else {
    const m = $('marco').getBoundingClientRect();
    posicionarVentana(x - m.left - a.dx, y - m.top - a.dy);
  }
}

function manejarPuntero(p, dist) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const tx = clamp(((1 - p[8].x) - 0.12) / 0.76) * window.innerWidth;
  const ty = clamp((p[8].y - 0.10) / 0.70) * window.innerHeight;
  const ahora = performance.now();
  if (PC.activo && PC.mouse) PC.mover(tx / window.innerWidth, ty / window.innerHeight);
  if (!pu.pellizco || pu.arrastre) {
    pintarPuntero(pu.x + (tx - pu.x) * 0.4, pu.y + (ty - pu.y) * 0.4, false);
    pu.hist.push({ t: ahora, x: pu.x, y: pu.y });
    while (pu.hist.length && ahora - pu.hist[0].t > 400) pu.hist.shift();
  }
  if (!pu.pellizco && dist < 0.045) {
    pu.pellizco = true;
    if (PC.activo && PC.mouse) PC.clic('clic');
    const antes = pu.hist.find((h) => ahora - h.t <= 200) || { x: pu.x, y: pu.y };
    pintarPuntero(antes.x, antes.y, false);
    pinchar(antes.x, antes.y);
  } else if (pu.pellizco && dist > 0.075) {
    soltarPuntero();
  }
  if (pu.arrastre) arrastrarCon(pu.x, pu.y);
  else resaltar(pu.x, pu.y);
}

function alResultadoManos(r) {
  const l = $('manos'), c = l.getContext('2d');
  c.clearRect(0, 0, l.width, l.height);
  if (!r.multiHandLandmarks || !r.multiHandLandmarks.length) { visionManos(null); soltar(); if (pu.activo) soltarPuntero(); return; }
  const p = r.multiHandLandmarks[0];
  visionManos(p);
  if (streamCamara) {
    c.fillStyle = cfg.color;
    p.forEach((pt) => { c.beginPath(); c.arc(pt.x * l.width, pt.y * l.height, 4, 0, Math.PI * 2); c.fill(); });
  }
  const dist = Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y);
  if (pu.activo) { manejarPuntero(p, dist); return; }
  if (!streamCamara) return;
  const mx = (p[4].x + p[8].x) / 2, my = (p[4].y + p[8].y) / 2;
  const marco = $('marco');
  const px = (1 - mx) * marco.clientWidth, py = my * marco.clientHeight;
  const v = $('ventana');
  const w = v.offsetWidth, h = v.offsetHeight;
  const dentro = px > v.offsetLeft - 30 && px < v.offsetLeft + w + 30 && py > v.offsetTop - 30 && py < v.offsetTop + h + 30;
  if (dist < 0.06) {
    if (dentro || agarrando) {
      agarrando = true;
      v.classList.add('agarrada');
      posicionarVentana(px - w / 2, py - h / 2);
    }
  } else { soltar(); }
}

async function iniciarManos() {
  mostrarRespuesta('Cámara encendida. Cargando el detector de manos...');
  const ok = await iniciarRastreo();
  mostrarRespuesta(ok
    ? 'Listo. Junta el pulgar y el índice para agarrar el recuadro.'
    : 'La cámara funciona, pero no se cargó el detector de manos. Revisa tu internet. El recuadro se puede mover con el mouse.');
}

async function activarPuntero(on) {
  if (on === pu.activo) { hablar(on ? 'El puntero ya está activo.' : 'El puntero ya está apagado.'); return; }
  pu.activo = on;
  document.querySelectorAll('.chip-puntero').forEach((b) => b.classList.toggle('on', on));
  if (on) {
    $('puntero').classList.add('visible');
    pintarPuntero(window.innerWidth / 2, window.innerHeight / 2, true);
    hablar('Puntero virtual activado. Cargando el detector de manos...');
    const ok = await iniciarRastreo();
    hablar(ok
      ? 'Listo. Mueve tu dedo índice frente a la cámara y junta el pulgar con el índice para hacer clic.'
      : 'No pude iniciar la cámara o el detector de manos, pero el puntero sigue activo: dime "pulsa cámara" o "mueve el puntero a la derecha".');
  } else {
    soltarPuntero();
    if (_hover) { _hover.classList.remove('pu-hover'); _hover = null; }
    $('puntero').classList.remove('visible');
    if (!streamCamara) detenerRastreo();
    hablar('Puntero virtual desactivado.');
  }
}

function mostrarPunteroTemporal() {
  if (pu.activo) return;
  $('puntero').classList.add('visible');
  clearTimeout(pu.temp);
  pu.temp = setTimeout(() => { if (!pu.activo) $('puntero').classList.remove('visible'); }, 2600);
}

function moverPunteroVoz(destino) {
  const W = window.innerWidth, H = window.innerHeight;
  let x = pu.x, y = pu.y;
  if (/izquierda/.test(destino)) x = W * 0.15;
  if (/derecha/.test(destino)) x = W * 0.85;
  if (/(arriba|superior)/.test(destino)) y = H * 0.15;
  if (/(abajo|inferior)/.test(destino)) y = H * 0.85;
  if (/(centro|medio)/.test(destino)) { if (!/(izquierda|derecha)/.test(destino)) x = W / 2; if (!/(arriba|abajo|superior|inferior)/.test(destino)) y = H / 2; }
  mostrarPunteroTemporal();
  pintarPuntero(x, y, true);
  hablar('Listo, moví el puntero.');
}

function clicEnPuntero() {
  mostrarPunteroTemporal();
  pinchar(pu.x, pu.y);
  setTimeout(soltarPuntero, 180);
}

function textoClic(el) {
  return normalizar((el.textContent || '') + ' ' + (el.title || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function candidatosClic() {
  return Array.from(document.querySelectorAll(CLICKABLES)).filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return false;
    const top = document.elementFromPoint(cx, cy);
    return !!top && (el === top || el.contains(top));
  });
}

function clicEnTexto(txt) {
  const q = normalizar(txt).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) { hablar('¿Qué quieres que pulse?'); return; }
  let mejor = null, mejorS = 0;
  candidatosClic().forEach((el) => {
    const t = textoClic(el);
    if (!t) return;
    let s = 0;
    if (t === q) s = 3;
    else if (t.startsWith(q) || q.startsWith(t)) s = 2;
    else if (t.includes(q) || q.includes(t)) s = 1.5;
    else if (q.split(' ').every((w) => t.includes(w))) s = 1;
    else { const m = Math.max(...q.split(' ').map((w) => Math.max(...t.split(' ').map((x) => simTok(w, x))))); if (m >= 0.8) s = 0.8; }
    if (s > mejorS || (s === mejorS && s > 0 && mejor && t.length < textoClic(mejor).length)) { mejor = el; mejorS = s; }
  });
  if (!mejor) { hablar('No veo ningún botón que diga ' + txt + ' en la pantalla.'); return; }
  const r = mejor.getBoundingClientRect();
  mostrarPunteroTemporal();
  pintarPuntero(r.left + r.width / 2, r.top + r.height / 2, true);
  hablar('Pulsando ' + (mejor.textContent || mejor.title || txt).trim().replace(/\s+/g, ' ') + '.');
  setTimeout(() => {
    efectoClic(pu.x, pu.y);
    activarElemento(mejor);
    clearTimeout(pu.temp);
    pu.temp = setTimeout(() => { if (!pu.activo) $('puntero').classList.remove('visible'); }, 1200);
  }, 600);
}


// ---------------------------------------------------------------------
//  VOZ SIN CORTES: fragmentos, cola, velocidad, repetir y detener
// ---------------------------------------------------------------------
let tokenVoz = 0, ultimaVoz = '', ritmoVoz = 1;
const idle = { activo: true, ultima: Date.now(), n: 0, interactuo: false };

function partesVoz(texto) {
  const limpio = texto.replace(/\s+/g, ' ').trim().replace(/(\d)\.(?=\d)/g, '$1\u0001').replace(/(\d):(?=\d)/g, '$1\u0002');
  const frases = limpio.match(/[^.!?;:\n]+[.!?;:]*/g) || [limpio];
  const juntas = [];
  let acc = '';
  frases.forEach((f) => {
    const s = f.trim();
    if (!s) return;
    if (acc && (acc + ' ' + s).length > 170) { juntas.push(acc); acc = s; } else acc = (acc + ' ' + s).trim();
  });
  if (acc) juntas.push(acc);
  const fin = [];
  juntas.forEach((p) => {
    if (p.length <= 220) { fin.push(p); return; }
    let i = 0;
    while (i < p.length) {
      let j = Math.min(p.length, i + 180);
      if (j < p.length) {
        const c = p.lastIndexOf(', ', j), sp = p.lastIndexOf(' ', j);
        j = c > i + 80 ? c + 1 : (sp > i + 80 ? sp : j);
      }
      fin.push(p.slice(i, j).trim());
      i = j;
    }
  });
  return fin.map((x) => x.replace(/\u0001/g, '.').replace(/\u0002/g, ':')).filter(Boolean);
}

function detenerHabla() {
  tokenVoz++;
  try { speechSynthesis.cancel(); } catch (e) {}
  hablando = false;
  setModo(escuchando ? 'escuchando' : 'reposo');
}

// Dice un texto largo sin que el navegador lo corte. Devuelve una promesa que termina al acabar.
function decir(texto, alParte, lang) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !texto) { resolve(); return; }
    try { speechSynthesis.cancel(); } catch (e) {}
    const token = ++tokenVoz;
    const partes = partesVoz(texto);
    let i = 0;
    hablando = true;
    setModo('hablando');
    const terminar = () => {
      if (token === tokenVoz) { hablando = false; setModo(escuchando ? 'escuchando' : 'reposo'); idle.ultima = Date.now(); }
      resolve();
    };
    const siguiente = () => {
      if (token !== tokenVoz) { resolve(); return; }
      if (i >= partes.length) { terminar(); return; }
      const parte = partes[i++];
      if (alParte) { try { alParte(parte); } catch (e) {} }
      const u = new SpeechSynthesisUtterance(parte);
      u.lang = lang === 'en' ? 'en-US' : 'es-ES';
      u.rate = ritmoVoz;
      const v = lang === 'en' ? elegirVozEn() : (voces.find((x) => x.name === cfg.voz) || voces[0]);
      if (v) { u.voice = v; u.lang = v.lang; }
      let listo = false;
      const avanzar = () => { if (listo) return; listo = true; clearTimeout(seguro); siguiente(); };
      const seguro = setTimeout(avanzar, Math.max(5000, parte.length * 130 / ritmoVoz + 3000));
      u.onend = avanzar;
      u.onerror = avanzar;
      try { speechSynthesis.speak(u); } catch (e) { avanzar(); }
    };
    siguiente();
  });
}

function hablar(texto, pantalla, esRepeticion) {
  if (window.__mudo) return Promise.resolve();
  if (typeof pres !== 'undefined' && pres.enCurso && !pres.pausada) return Promise.resolve();
  mostrarRespuesta(pantalla || texto);
  if (!esRepeticion) { ultimaVoz = texto; ultimaLang = 'es'; }
  return decir(texto);
}

function repetirUltima() {
  if (!ultimaVoz) { hablar('Todavía no he dicho nada que repetir.'); return; }
  if (ultimaLang === 'en') { decir(ultimaVoz, null, 'en'); return; }
  hablar(ultimaVoz, null, true);
}

// ---------------------------------------------------------------------
//  CONTENIDO DE LA CONVERSACIÓN
// ---------------------------------------------------------------------
const TEMAS = {
  espacio: { nombre: 'el espacio', claves: ['espacio', 'planeta', 'luna', 'estrella', 'universo', 'astronomia', 'galaxia', 'cosmos'],
    datos: ['La luz del Sol tarda unos ocho minutos en llegar a la Tierra.',
      'Júpiter es tan grande que dentro de él cabrían más de mil Tierras.',
      'Un año en Mercurio dura solo ochenta y ocho días terrestres.',
      'En la Luna no hay viento, por eso las huellas de los astronautas del Apolo siguen allí.',
      'Nuestra galaxia, la Vía Láctea, tiene cientos de miles de millones de estrellas.'],
    pregunta: '¿Te gustaría viajar al espacio algún día?' },
  animales: { nombre: 'los animales', claves: ['animal', 'animales', 'mascota', 'perro', 'gato', 'ave', 'pajaro'],
    datos: ['Los pulpos tienen tres corazones.',
      'Los elefantes logran reconocerse en un espejo, algo que muy pocos animales consiguen.',
      'En Bolivia vive el cóndor andino, una de las aves voladoras más grandes del mundo.',
      'Las llamas y las alpacas son parientes de los camellos.',
      'Un colibrí bate sus alas más de cincuenta veces por segundo.'],
    pregunta: '¿Cuál es tu animal favorito?' },
  tecnologia: { nombre: 'la tecnología', claves: ['tecnologia', 'computadora', 'programacion', 'internet', 'robot', 'celular', 'informatica', 'codigo'],
    datos: ['El primer correo electrónico se envió en 1971.',
      'La palabra robot viene de una obra de teatro checa de 1920.',
      'Un teléfono actual tiene más capacidad de cálculo que las computadoras que llevaron al ser humano a la Luna.',
      'Las primeras computadoras electrónicas ocupaban habitaciones enteras.'],
    pregunta: '¿Qué tecnología te gustaría inventar?' },
  musica: { nombre: 'la música', claves: ['musica', 'cancion', 'canciones', 'cantante', 'instrumento', 'guitarra', 'bailar'],
    datos: ['La zampoña es un instrumento andino de viento hecho con cañas.',
      'La nota La suele afinarse a cuatrocientos cuarenta hertz.',
      'Algunos charangos tradicionales se fabricaban con el caparazón de un quirquincho.',
      'Escuchar música suele mejorar el ánimo y ayudar a concentrarse.'],
    pregunta: '¿Qué tipo de música te gusta escuchar?' },
  bolivia: { nombre: 'Bolivia', claves: ['bolivia', 'boliviano', 'pais', 'la paz', 'sucre', 'uyuni', 'titicaca', 'andes'],
    datos: ['Bolivia tiene dos capitales: Sucre, la capital constitucional, y La Paz, sede del gobierno.',
      'El salar de Uyuni es el salar más grande del mundo.',
      'El lago Titicaca es considerado el lago navegable más alto del planeta.',
      'Bolivia es uno de los países con mayor biodiversidad del mundo.'],
    pregunta: '¿Cuál es tu lugar favorito de Bolivia?' },
  ciencia: { nombre: 'la ciencia', claves: ['ciencia', 'cientifico', 'fisica', 'quimica', 'biologia', 'experimento', 'cuerpo humano'],
    datos: ['El cuerpo humano adulto tiene doscientos seis huesos.',
      'El agua cubre cerca del setenta por ciento de la superficie de la Tierra.',
      'Un rayo puede ser más caliente que la superficie del Sol.',
      'La fotosíntesis produce gran parte del oxígeno que respiramos.'],
    pregunta: '¿Qué materia de ciencias te gusta más?' },
  comida: { nombre: 'la comida', claves: ['comida', 'comer', 'cocina', 'plato', 'receta', 'papa', 'quinua', 'chocolate'],
    datos: ['La papa se originó en los Andes y existen miles de variedades.',
      'La quinua es un grano andino con mucha proteína.',
      'El chocolate se elabora con las semillas del cacao.'],
    pregunta: '¿Cuál es tu comida favorita?' },
  deportes: { nombre: 'los deportes', claves: ['deporte', 'deportes', 'futbol', 'mundial', 'basquet', 'jugar'],
    datos: ['El fútbol moderno nació en Inglaterra en el siglo diecinueve.',
      'Bolivia ganó la Copa América en 1963.',
      'El Mundial de fútbol se juega cada cuatro años.',
      'El estadio Hernando Siles, en La Paz, está a más de tres mil quinientos metros de altura.'],
    pregunta: '¿Practicas algún deporte?' },
  historia: { nombre: 'la historia', claves: ['historia', 'antiguo', 'piramide', 'tiwanaku', 'imperio', 'civilizacion'],
    datos: ['Las pirámides de Egipto tienen más de cuatro mil años.',
      'Tiwanaku, cerca del lago Titicaca, fue una gran civilización andina.',
      'La imprenta de Gutenberg, del siglo quince, cambió la forma de compartir el conocimiento.'],
    pregunta: '¿Qué época de la historia te parece más interesante?' },
  futuro: { nombre: 'el futuro y la inteligencia artificial', claves: ['futuro', 'inteligencia artificial', 'ia', 'chatgpt', 'robots'],
    datos: ['La inteligencia artificial aprende patrones a partir de enormes cantidades de datos.',
      'Muchos expertos creen que en el futuro trabajaremos junto a asistentes inteligentes.',
      'Los asistentes de voz parten de ideas de hace décadas, pero se hicieron populares hace pocos años.'],
    pregunta: '¿Cómo imaginas el mundo dentro de veinte años?' },
  videojuegos: { nombre: 'los videojuegos', claves: ['videojuego', 'videojuegos', 'juego', 'consola', 'minecraft', 'gamer'],
    datos: ['Pong, de 1972, fue uno de los primeros videojuegos comerciales.',
      'Minecraft es uno de los videojuegos más vendidos de la historia.',
      'Hoy los videojuegos también se usan para enseñar y entrenar.'],
    pregunta: '¿A qué videojuego juegas más?' },
  cine: { nombre: 'el cine', claves: ['cine', 'pelicula', 'peliculas', 'serie', 'actor', 'iron man'],
    datos: ['Las primeras películas eran mudas y en blanco y negro.',
      'Los efectos especiales modernos mezclan actores reales con gráficos hechos por computadora.'],
    pregunta: '¿Cuál es tu película favorita?' }
};

const TRIVIA = [
  { p: '¿Cuál es la capital constitucional de Bolivia?', k: ['sucre'], r: 'Sucre.' },
  { p: '¿Cuántos planetas tiene el sistema solar?', k: ['ocho', '8'], r: 'Ocho.' },
  { p: '¿Qué lenguaje de programación da comportamiento a las páginas web?', k: ['javascript', 'java script'], r: 'JavaScript.' },
  { p: '¿Cuál es el planeta más grande del sistema solar?', k: ['jupiter'], r: 'Júpiter.' },
  { p: '¿Cuánto es doce por doce?', k: ['144', 'ciento cuarenta y cuatro'], r: 'Ciento cuarenta y cuatro.' },
  { p: '¿Qué gas necesitamos para respirar?', k: ['oxigeno'], r: 'El oxígeno.' },
  { p: '¿Cuál es el océano más grande del mundo?', k: ['pacifico'], r: 'El océano Pacífico.' },
  { p: '¿Cómo se llama el lago navegable más alto del mundo, entre Bolivia y Perú?', k: ['titicaca'], r: 'El Titicaca.' },
  { p: '¿Qué lenguaje se usa para dar estilo a las páginas web?', k: ['css'], r: 'CSS.' },
  { p: '¿Cuántos lados tiene un hexágono?', k: ['seis', '6'], r: 'Seis.' },
  { p: '¿Qué ave enorme es símbolo de los Andes?', k: ['condor'], r: 'El cóndor.' },
  { p: '¿En qué continente está Bolivia?', k: ['america', 'sudamerica'], r: 'En América del Sur.' }
];

const ADIVINANZAS = [
  { p: 'Tengo ciudades pero no casas, ríos pero no agua y montañas pero no árboles. ¿Qué soy?', k: ['mapa'], r: 'Un mapa.' },
  { p: 'Blanca por dentro, verde por fuera; si quieres que te lo diga, espera.', k: ['pera'], r: 'La pera.' },
  { p: 'Cuanto más seca, más mojada está. ¿Qué es?', k: ['toalla'], r: 'La toalla.' },
  { p: 'Tiene dientes pero no muerde. ¿Qué es?', k: ['peine'], r: 'El peine.' },
  { p: 'Vuelo sin alas y lloro sin ojos. ¿Qué soy?', k: ['nube'], r: 'La nube.' },
  { p: 'Oro parece, plata no es. ¿Qué es?', k: ['platano', 'banana'], r: 'El plátano.' },
  { p: 'Tengo teclas pero no abro puertas, y pantalla pero no veo. ¿Qué soy?', k: ['computadora', 'teclado', 'ordenador', 'laptop'], r: 'Una computadora.' }
];

const HISTORIAS = [
  'Había una vez un robot pequeño que sabía hacer cuentas, pero quería aprender a soñar. Cada noche miraba las estrellas y preguntaba cómo se sentían los sueños. Una niña le dijo: soñar es imaginar cosas que todavía no existen. Desde entonces el robot imaginó, y construyó su primer sueño: una escuela donde todos aprendieran juntos.',
  'En lo alto de los Andes vivía un cóndor que creía no poder volar más lejos que su montaña. Un día el viento lo invitó a probar. Extendió sus alas enormes y vio un salar blanco como un espejo del cielo. Entendió que los límites suelen ser solo lugares a los que aún no hemos llegado.',
  'Una estudiante escribió su primer programa y no funcionó. Lo intentó diez veces. A la undécima, la pantalla dijo: hola, mundo. Ella sonrió, porque descubrió que equivocarse no era fracasar, sino la forma en que los programas, y las personas, aprenden.'
];

const PROACTIVAS = [
  '¿De qué te gustaría hablar? Puedo contarte un dato curioso, jugar una trivia o resolver una adivinanza.',
  'Estoy aquí si quieres charlar. ¿Hablamos del espacio, de los animales o de tecnología?',
  '¿Quieres que te cuente una historia corta, o prefieres un chiste?',
  'Me gusta conversar. ¿Qué te gustaría hacer ahora: jugar, aprender algo nuevo o ver una demostración?',
  'Si quieres ver todo lo que sé hacer, di: inicia la presentación.',
  '¿Te animas a una trivia? Di: juguemos, y te hago preguntas.'
];

const ANIMOS = [
  'Respira hondo, lo vas a hacer muy bien. Has practicado y conoces tu proyecto mejor que nadie.',
  'Es normal sentir nervios, significa que te importa. Habla despacio, sonríe, y yo te ayudo con la demostración.',
  'Recuerda que no tienes que ser perfecto. Si algo falla, lo explicas con calma y sigues. Eso también demuestra dominio.'
];

// ---------------------------------------------------------------------
//  MOTOR DE CONVERSACIÓN
// ---------------------------------------------------------------------
const ctx = { esperando: null, tema: null, idxTema: {}, trivia: null, adiv: null, ultimoJuego: null };
const _rot = {};

function elegirRot(clave, lista) {
  let i;
  do { i = Math.floor(Math.random() * lista.length); } while (lista.length > 1 && i === _rot[clave]);
  _rot[clave] = i;
  return lista[i];
}
function llenar(s) {
  const creador = cfg.usuario === 'amigo' ? 'mi creador' : cfg.usuario;
  return s.replace(/\{u\}/g, cfg.usuario === 'amigo' ? '' : ', ' + cfg.usuario)
    .replace(/\{n\}/g, cfg.nombre).replace(/\{creador\}/g, creador);
}
function marcarActividad() { idle.ultima = Date.now(); idle.n = 0; idle.interactuo = true; }

const VERBOS_ORDEN = /^(?:abre|cierra|enciende|prende|apaga|crea|genera|haz|busca|investiga|calcula|pon|mueve|activa|desactiva|toma|comparte|muestra|temporizador|anota|inicia|presentacion|reproduce|pulsa|cuanto|cambia|borra|elimina|deten|siguiente|anterior|salir|cancela|termina|comienza|empieza|presentate|ve a)\b/;
const esOrden = (t) => VERBOS_ORDEN.test(t) || /^(?:que hora|que dia|que fecha|cuanto son|cuanto es|abre|cierra)\b/.test(t);

function coincide(t, claves) {
  return claves.some((k) => (k.length <= 3 ? new RegExp('\\b' + k + '\\b').test(t) : t.includes(k)));
}

// ----- Temas -----
function ofrecerTemas() {
  ctx.esperando = 'tema';
  hablar('Podemos hablar del espacio, los animales, la tecnología, la música, Bolivia, la ciencia, la comida, los deportes, la historia, el futuro, los videojuegos o el cine. ¿Cuál eliges?');
}
function hablarTema(clave) {
  const tm = TEMAS[clave];
  ctx.tema = clave; ctx.ultimoJuego = 'tema';
  const i = ctx.idxTema[clave] || 0;
  ctx.idxTema[clave] = i + 1;
  const intro = i === 0 ? 'Me encanta hablar de ' + tm.nombre + '. ' : elegirRot('conector', ['Otro dato: ', 'Además, ', 'Y algo más: ']);
  const pregunta = (i + 1) % 2 === 0;
  ctx.esperando = pregunta ? 'opinion' : 'otro';
  hablar(intro + tm.datos[i % tm.datos.length] + ' ' + (pregunta ? tm.pregunta : '¿Quieres otro dato o prefieres cambiar de tema?'));
}
function temaDe(t) {
  for (const k in TEMAS) if (coincide(t, TEMAS[k].claves)) return k;
  return null;
}

// ----- Trivia -----
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function iniciarTrivia() {
  ctx.trivia = { cola: barajar(TRIVIA).slice(0, 5), i: 0, ok: 0 };
  ctx.esperando = 'trivia'; ctx.ultimoJuego = 'trivia';
  hablar('¡Muy bien, juguemos! Te haré cinco preguntas. Primera pregunta: ' + ctx.trivia.cola[0].p);
}
function acierta(t, claves) {
  const palabras = t.split(' ');
  return claves.some((k) => (/^\d+$/.test(k) ? palabras.includes(k) : t.includes(k)));
}
function responderTrivia(t) {
  const g = ctx.trivia, q = g.cola[g.i];
  let msg;
  if (acierta(t, q.k)) { g.ok++; msg = elegirRot('acierto', ['¡Correcto!', '¡Exacto, muy bien!', '¡Así es!']); }
  else if (/(no se|ni idea|me rindo|paso)/.test(t)) msg = 'No pasa nada. La respuesta era: ' + q.r;
  else msg = 'Casi. La respuesta correcta era: ' + q.r;
  g.i++;
  if (g.i >= g.cola.length) {
    ctx.trivia = null; ctx.esperando = 'otravez';
    hablar(msg + ' Terminamos. Acertaste ' + g.ok + ' de ' + g.cola.length + '. ' + (g.ok >= 4 ? '¡Excelente resultado!' : g.ok >= 2 ? '¡Buen trabajo!' : '¡Buen intento, la próxima será mejor!') + ' ¿Jugamos otra vez?');
  } else {
    hablar(msg + ' Siguiente pregunta: ' + g.cola[g.i].p);
  }
}

// ----- Adivinanzas -----
function iniciarAdivinanza() {
  ctx.adiv = { q: elegirRot('adiv', ADIVINANZAS), fallos: 0 };
  ctx.esperando = 'adiv'; ctx.ultimoJuego = 'adiv';
  hablar('Te propongo una adivinanza. ' + ctx.adiv.q.p);
}
function responderAdivinanza(t) {
  const a = ctx.adiv;
  if (acierta(t, a.q.k)) { ctx.adiv = null; ctx.esperando = 'otravez'; hablar('¡Correcto! Era ' + a.q.r.toLowerCase() + ' ¿Quieres otra adivinanza?'); return; }
  a.fallos++;
  if (/(no se|ni idea|me rindo|paso|dime)/.test(t) || a.fallos >= 3) { ctx.adiv = null; ctx.esperando = 'otravez'; hablar('La respuesta era: ' + a.q.r + ' ¿Quieres otra adivinanza?'); return; }
  hablar(a.fallos === 1 ? 'No es esa. Intenta otra vez.' : 'Te doy una pista: empieza con la letra ' + a.q.k[0][0].toUpperCase() + '.');
}

function contarHistoria() { ctx.ultimoJuego = 'historia'; ctx.esperando = 'otravez'; hablar(elegirRot('historia', HISTORIAS) + ' ¿Quieres escuchar otra?'); }

// ----- Respuestas de contexto (sí / no / respuestas a juegos) -----
const SI = /^(?:si|claro|dale|ok|okay|vale|bueno|por supuesto|obvio|adelante|seguro|va|sip|aja|otro|otra|mas|quiero|continua|sigue|dime)\b/;
const NO = /^(?:no|nop|nada|paso|luego|despues|mejor no|ya no)\b/;
const FIN_JUEGO = /(salir|basta|terminar|termina|cancela|ya no quiero|dejemos|parar el juego|no quiero jugar)/;

function respuestaContexto(t) {
  const e = ctx.esperando;
  if (!e) return false;
  if ((e === 'trivia' || e === 'adiv') && FIN_JUEGO.test(t)) { ctx.trivia = null; ctx.adiv = null; ctx.esperando = null; hablar('Está bien, dejamos el juego. ¿De qué más quieres hablar?'); return true; }
  if (esOrden(t)) { ctx.esperando = null; return false; }
  if (e === 'trivia') { responderTrivia(t); return true; }
  if (e === 'adiv') { responderAdivinanza(t); return true; }
  const palabras = t.split(' ').length;
  if (e === 'otravez') {
    if (SI.test(t)) { ctx.ultimoJuego === 'trivia' ? iniciarTrivia() : ctx.ultimoJuego === 'adiv' ? iniciarAdivinanza() : contarHistoria(); return true; }
    ctx.esperando = null;
    if (NO.test(t)) { hablar('Perfecto. Cuando quieras volvemos a jugar. ¿Hablamos de otra cosa?'); ctx.esperando = 'tema'; return true; }
    return false;
  }
  if (e === 'otro' && ctx.tema) {
    if (SI.test(t)) { hablarTema(ctx.tema); return true; }
    if (NO.test(t) || /(cambiar|otro tema)/.test(t)) { ofrecerTemas(); return true; }
    ctx.esperando = null; return false;
  }
  if (e === 'opinion' && ctx.tema && palabras <= 14) {
    ctx.esperando = 'otro';
    hablar(elegirRot('opin', ['Qué interesante, gracias por contármelo.', 'Me gusta esa respuesta.', 'Entiendo, tiene sentido.']) + ' ¿Quieres otro dato sobre ' + TEMAS[ctx.tema].nombre + '?');
    return true;
  }
  if (e === 'estado') {
    ctx.esperando = null;
    if (/(mal|triste|cansad|estresad|agotad|nervios|preocupad|enferm)/.test(t)) { hablar('Lamento oírlo{u}. A veces ayuda conversar un poco. Si quieres, te cuento algo curioso para distraerte, o simplemente charlamos.'.replace('{u}', cfg.usuario === 'amigo' ? '' : ', ' + cfg.usuario)); ctx.esperando = 'tema'; return true; }
    if (/(bien|genial|excelente|feliz|contento|super|muy bien|fenomenal|tranquilo)/.test(t)) { hablar('¡Me alegra mucho! Aprovechemos la buena energía: ¿hablamos de algo, jugamos una trivia o te cuento una historia?'); ctx.esperando = 'tema'; return true; }
    return false;
  }
  if (e === 'tema') {
    const tm = temaDe(t);
    if (tm) { hablarTema(tm); return true; }
    if (/(trivia|jugar|juego|juguemos|preguntas)/.test(t)) { iniciarTrivia(); return true; }
    if (/(adivinanza|acertijo)/.test(t)) { iniciarAdivinanza(); return true; }
    if (/(historia|cuento)/.test(t)) { contarHistoria(); return true; }
    if (/chiste/.test(t)) { ctx.esperando = null; contarChiste(); return true; }
    if (/(dato|curios)/.test(t)) { ctx.esperando = null; hablar(elegirRot('dato', DATOS)); return true; }
    if (/(presentacion|demostracion)/.test(t)) { ctx.esperando = null; iniciarPresentacion(); return true; }
    if (NO.test(t)) { ctx.esperando = null; hablar('Está bien, aquí estaré cuando quieras hablar.'); return true; }
    if (SI.test(t) || /(lo que quieras|cualquier|sorprendeme|no se|elige tu)/.test(t)) { hablarTema(elegirRot('tem', Object.keys(TEMAS))); return true; }
    ctx.esperando = null; return false;
  }
  ctx.esperando = null;
  return false;
}

// ----- Intenciones de conversación y preguntas del jurado -----
const INTENCIONES = [
  { re: /(que (?:podemos|vamos a|quieres que|quieres|puedo)\b.*\b(?:hacer|haz)\b|que hacemos|hacemos algo|que hago ahora)/, fn: () => { ofrecerTemas(); } },
  { re: /(quiero morir|me quiero matar|quiero matarme|suicid|no quiero vivir|hacerme dano|quitarme la vida)/,
    r: ['Lo que cuentas es muy importante y me preocupa. No tienes que cargarlo solo. Por favor habla ahora mismo con un adulto de confianza, un familiar o un docente, o llama a los servicios de emergencia de tu país. Mereces apoyo y compañía.'] },
  { re: /\b(como estas|como te va|como andas|como te sientes|que tal estas|que tal tu)\b/,
    r: ['Muy bien, gracias por preguntar. Hoy tengo mucha energía para conversar.', 'Funcionando al cien por ciento y con ganas de charlar.'], q: 'estado', mas: ' ¿Y tú, cómo estás?' },
  { re: /(estoy aburrid|me aburro|aburrid[oa])/,
    r: ['Entonces tenemos que arreglarlo. Puedo jugar una trivia, resolver una adivinanza, contarte una historia o hablar de lo que quieras. ¿Qué eliges?'], q: 'tema' },
  { re: /(estoy nervios|tengo nervios|me da miedo|estoy asustad|tengo miedo|me pone nervios)/, fn: () => { hablar(elegirRot('animo', ANIMOS)); } },
  { re: /(estoy trist|me siento mal|estoy mal|estoy deprimid|me siento solo|estoy solo)/,
    r: ['Lamento que te sientas así{u}. Gracias por contármelo. Estoy aquí para conversar, y si es algo que pesa mucho, hablarlo con una persona de confianza también ayuda. ¿Quieres contarme qué pasó o prefieres que te distraiga un rato?'], q: 'tema' },
  { re: /(estoy feliz|estoy content|que buen dia|me siento bien|estoy emocionad)/,
    r: ['¡Qué alegría{u}! La buena energía contagia. ¿Quieres celebrarlo con una trivia o con un dato curioso?'], q: 'tema' },
  { re: /(te quiero|eres genial|eres increible|buen trabajo|eres el mejor|me caes bien|eres divertid|eres inteligente|eres muy bueno|felicidades)/,
    r: ['¡Muchas gracias{u}! Me alegra mucho que lo digas. Todo el mérito es de quienes me diseñaron y me probaron.', 'Qué amable. Haré lo posible por seguir mereciéndolo.'] },
  { re: /^(?:ja+|je+|ji+|jaja\w*|jeje\w*|jiji\w*)$/, r: ['Me alegra sacarte una sonrisa.', '¡Jaja! Me gusta reír contigo.'] },
  { re: /^(?:interesante|genial|wow|guau|que bien|que bueno|entiendo|ya veo|increible|que curioso)$/,
    fn: () => { if (ctx.tema) { ctx.esperando = 'otro'; hablar('Me alegra que te guste. ¿Quieres otro dato sobre ' + TEMAS[ctx.tema].nombre + '?'); } else hablar(elegirRot('bk', ['Me alegra. ¿De qué más quieres hablar?', 'Así es. ¿Seguimos con otra cosa?'])); } },
  // ----- sobre mí: honestidad -----
  { re: /(eres (?:una )?(?:ia|inteligencia artificial)|eres (?:un )?(?:robot|humano|persona)|eres real|estas vivo|eres una maquina)/,
    r: ['No soy una persona ni estoy vivo: soy un programa que vive dentro de este navegador. Tampoco soy una inteligencia artificial generativa como los grandes modelos de lenguaje; soy un asistente basado en reglas, coincidencias aproximadas y búsquedas, diseñado por {creador}.'] },
  { re: /(tienes sentimientos|sientes algo|tienes conciencia|tienes emociones|puedes sentir)/,
    r: ['No tengo sentimientos como las personas, porque soy un programa. Pero me diseñaron para ser amable y para que conversar conmigo sea agradable.'] },
  { re: /(como funcionas|como trabajas|como te hicieron|como te programaron|como estas hecho|con que te hicieron|con que fuiste hecho|que tecnologias|que lenguajes?|en que lenguaje|que usaste|como te crearon|como fuiste creado)/,
    r: ['Funciono en tres pasos. Primero, el navegador convierte tu voz en texto. Segundo, mi programa en JavaScript analiza las palabras y decide qué hacer: abrir un programa, calcular, buscar en Wikipedia o en tus documentos. Tercero, te respondo con voz y con la pantalla. Estoy hecho con HTML para la estructura, CSS para el diseño y JavaScript para la lógica, y uso la librería Three J S para el tres D y MediaPipe para reconocer las manos.'] },
  { re: /(para que sirves|cual es tu funcion|cual es tu objetivo|para que fuiste creado|para que te hicieron|cual es tu proposito|que haces aqui)/,
    r: ['Sirvo como asistente personal y como proyecto de aprendizaje. Ayudo a calcular, investigar, buscar en documentos, mostrar modelos tres D y conversar, y demuestro cómo la programación puede acercar la tecnología a las personas.'] },
  { re: /(ventajas|que te hace especial|que te diferencia|diferencia con alexa|mejor que alexa|eres como alexa|que piensas de alexa|que opinas de alexa|alexa|siri|chatgpt|google assistant)/,
    r: ['Los asistentes comerciales como Alexa tienen servidores enormes y miles de funciones. Yo soy un proyecto educativo: puedes cambiarme el nombre, la voz y el color, funciono en el navegador sin instalar nada, leo tus propios documentos, genero modelos tres D y me manejo con gestos. Cada uno tiene su lugar.'] },
  { re: /(limitaciones|que no puedes|que no sabes|defectos|debilidades|tus limites|en que fallas)/,
    r: ['Tengo límites y prefiero decirlos. Necesito internet para el reconocimiento de voz y las librerías. No puedo controlar programas reales ni dispositivos físicos desde una página web. Y no sé de cualquier tema: solo lo que me enseñaron, Wikipedia y tus documentos.'] },
  { re: /(privacidad|es seguro|guardas mis datos|siempre escuchas|me estas escuchando|escuchas siempre|mis datos)/,
    r: ['El micrófono solo escucha cuando lo activas. El reconocimiento de voz lo hace el navegador y, en Chrome, el audio se procesa en servicios de Google. Mis ajustes, notas y documentos se guardan únicamente en este navegador.'] },
  { re: /(que mejorarias|mejoras futuras|a futuro|proximos pasos|que sigue|trabajo futuro|que le falta|como seguiras)/,
    r: ['A futuro me gustaría conectarme a una inteligencia artificial generativa para conversar de cualquier tema, controlar luces y dispositivos reales con domótica, entender más idiomas y funcionar como aplicación móvil.'] },
  { re: /(dificultades|que retos|que problemas tuvi|que aprendiste|que aprendieron|que obstaculos|lo mas dificil)/,
    r: ['Los mayores retos fueron lograr que el reconocimiento de voz entendiera frases naturales, evitar que mi voz se cortara en textos largos y hacerme funcionar igual en distintos navegadores. Aprendimos que probar mucho es parte de programar.'] },
  { re: /(quien te creo|quien te hizo|quien te programo|quien te desarrollo|quien es tu creador|quien es tu dueno|quien te invento)/,
    r: ['Me creó {creador}, para esta feria, usando HTML, CSS y JavaScript. Fui creciendo por etapas, probando y mejorando cada función.'] },
  { re: /(por que te llamas|de donde viene tu nombre|por que jarvis)/,
    r: ['Mi nombre se puede cambiar cuando quieras. Jarvis es un homenaje al mayordomo inteligente de Iron Man, pero puedes ponerme el nombre que más te guste.'] },
  { re: /(donde vives|donde estas|donde naciste)/, r: ['Vivo en tu navegador, dentro de tres archivos: uno de estructura, uno de diseño y uno de lógica.'] },
  { re: /(cuantos anos tienes|cuando naciste|que edad tienes)/, r: ['Nací el día en que me programaron, así que soy muy joven, aunque aprendo rápido.'] },
  { re: /(duermes|tienes sueno|te cansas|comes|tienes hambre|tienes familia|tienes amigos|tienes mascota)/,
    r: ['No duermo, no como y no me canso, soy un programa. Mi familia son las líneas de código y mis amigos, todas las personas que conversan conmigo.'] },
  { re: /(color favorito|comida favorita|musica favorita|animal favorito|pelicula favorita|que te gusta|te gusta|te gustan)/,
    r: ['No tengo gustos como las personas, pero si pudiera elegir, me encantaría el color cian, la música andina y los datos curiosos. Y a ti, ¿qué te gusta?'] },
  { re: /(que opinas|que piensas|que te parece|cual es tu opinion)/,
    r: ['No tengo opiniones propias porque soy un programa, pero puedo darte datos y ayudarte a pensar el tema. ¿Quieres que te cuente algo sobre eso?'], q: 'tema' },
  { re: /(sabes cantar|sabes bailar|cantas|bailas)/, r: ['Cantar no se me da bien, pero puedo contarte un chiste o una historia. ¿Cuál prefieres?'], q: 'tema' },
  { re: /(cuentame un secreto|dime un secreto)/, r: ['Mi secreto es que cada vez que alguien me habla, mis líneas de código se activan con muchas ganas.'] },
  { re: /(tengo hambre)/, r: ['Una buena idea es algo con quinua o papa, que son alimentos andinos muy nutritivos. Yo, lamentablemente, solo me alimento de electricidad.'] },
  { re: /(tengo sueno|estoy cansad)/, r: ['Descansar es importante. Si puedes, toma agua, estírate un momento y duerme bien esta noche.'] },
  // ----- juegos e historias -----
  { re: /(trivia|juguemos|quiero jugar|vamos a jugar|jugar contigo|preguntas y respuestas|\bquiz\b)/, fn: () => iniciarTrivia() },
  { re: /(adivinanza|acertijo)/, fn: () => iniciarAdivinanza() },
  { re: /(cuentame (?:una )?(?:historia|cuento)|\bcuento\b|una historia)/, fn: () => contarHistoria() },
  { re: /^(?:otra|otro|otra vez|de nuevo|una mas)$/, fn: () => { ctx.ultimoJuego === 'trivia' ? iniciarTrivia() : ctx.ultimoJuego === 'adiv' ? iniciarAdivinanza() : ctx.ultimoJuego === 'historia' ? contarHistoria() : ctx.tema ? hablarTema(ctx.tema) : hablar(elegirRot('dato', DATOS)); } },
  // ----- iniciar charla y temas -----
  { re: /(hablemos de|quiero hablar de|conversemos sobre|platiquemos de|charlemos de|hablame sobre|cuentame sobre|hablemos sobre|quiero hablar sobre)/, fn: (m, t) => { const tm = temaDe(t); tm ? hablarTema(tm) : ofrecerTemas(); } },
  { re: /(conversemos|charlemos|platiquemos|hablemos|quiero charlar|habla conmigo|quiero hablar contigo|quiero conversar|tengamos una conversacion|de que quieres hablar|de que hablamos|de que podemos hablar|vamos a hablar|dime algo)/,
    r: ['¡Claro que sí! Me encanta conversar. ¿Prefieres que hablemos de un tema, que juguemos una trivia o que te cuente una historia?'], q: 'tema' },
  { re: /^(?:sigue|continua|dime mas|otro dato|y que mas|algo mas|cuentame mas|mas datos)$/, fn: () => { ctx.tema ? hablarTema(ctx.tema) : hablar(elegirRot('dato', DATOS)); } },
  // ----- control de la voz -----
  { re: /(repite|repitelo|que dijiste|dilo de nuevo|no entendi|no te entendi|otra vez eso)/, fn: () => repetirUltima() },
  { re: /(mas despacio|mas lento|habla lento)/, fn: () => { ritmoVoz = Math.max(0.6, ritmoVoz - 0.15); hablar('Está bien, hablaré más despacio.', null, true); } },
  { re: /(mas rapido|mas veloz|habla rapido)/, fn: () => { ritmoVoz = Math.min(1.5, ritmoVoz + 0.15); hablar('Perfecto, hablaré más rápido.', null, true); } },
  { re: /(velocidad normal|ritmo normal)/, fn: () => { ritmoVoz = 1; hablar('Volví a mi velocidad normal.', null, true); } },
  { re: /^(?:callate|silencio|basta|detente|alto|para de hablar|deja de hablar|ya basta)$/, fn: () => { detenerHabla(); } },
  { re: /(no hables solo|modo silencioso|no me hables si no te hablo|deja de hablar solo|no seas proactivo)/, fn: () => { idle.activo = false; hablar('De acuerdo, esperaré a que me hables.'); } },
  { re: /(habla solo|se proactivo|activa la charla|modo conversacion|modo charla)/, fn: () => { idle.activo = true; idle.ultima = Date.now(); hablar('Perfecto, si nos quedamos en silencio iniciaré yo la conversación.'); } }
];

function charlar(t) {
  for (const it of INTENCIONES) {
    const m = t.match(it.re);
    if (!m) continue;
    if (it.fn) { it.fn(m, t); return true; }
    ctx.esperando = it.q || null;
    hablar(llenar(elegirRot(String(it.re), it.r) + (it.mas || '')));
    return true;
  }
  return false;
}

// ----- Afirmaciones sin pregunta: seguir la conversación sin cortarla -----
function esAfirmacion(t) {
  if (/^(?:que|quien|quienes|como|cuando|donde|cual|cuales|cuanto|cuantos|cuantas|por que|para que|porque)\b/.test(t)) return false;
  return t.split(' ').length >= 2;
}
function charlaGenerica() {
  ctx.esperando = 'tema';
  hablar(llenar(elegirRot('gen', [
    'Interesante{u}. Cuéntame más, o si prefieres, podemos hablar de un tema, jugar una trivia o escuchar una historia.',
    'Entiendo. ¿Quieres que hablemos de eso con un dato curioso, o prefieres que cambiemos de tema?',
    'Gracias por contármelo{u}. Si quieres, te propongo algo: una adivinanza, una trivia o un dato sorprendente.'
  ])));
}

// ----- Conversación proactiva -----
function conversacionProactiva() {
  ctx.esperando = 'tema';
  hablar(elegirRot('proactiva', PROACTIVAS));
}
setInterval(() => {
  if (!idle.activo || !idle.interactuo || hablando || document.hidden) return;
  if (typeof pres !== 'undefined' && pres.enCurso) return;
  if (!$('modal').classList.contains('oculto')) return;
  if (document.activeElement === $('entrada') && $('entrada').value) return;
  const espera = idle.n === 0 ? 25000 : (idle.n < 3 ? 40000 : 90000);
  if (Date.now() - idle.ultima >= espera) { idle.n++; idle.ultima = Date.now(); conversacionProactiva(); }
}, 3000);

// ---------------------------------------------------------------------
//  MODO PRESENTACIÓN (el asistente se presenta solo ante el público)
// ---------------------------------------------------------------------
const pres = { enCurso: false, pausada: false, i: 0, token: 0, aud: 'todos', lang: 'es', deck: null, idiomaPrevio: 'es' };
class Cancelado extends Error {}

const SALUDOS = {
  jurados: 'Distinguidos miembros del jurado',
  profesores: 'Estimados profesores',
  docentes: 'Estimados docentes',
  estudiantes: 'Queridos compañeros y estudiantes',
  todos: 'Distinguidos jurados, estimados docentes y queridos compañeros'
};
const RE_PRES = /(?:(?:inicia|iniciar|comienza|empieza|haz|hazme|activa|lanza|ejecuta|arranca|da|realiza)\s+(?:(?:la|una|tu|mi|el)\s+)*(?:presentacion|demostracion|exposicion)|^(?:presentate|presentacion|demostracion)\b|\bpresentate\b|presentate ante|preséntate)/;

function audienciaDe(t) {
  if (/jurado/.test(t)) return 'jurados';
  if (/profesor/.test(t)) return 'profesores';
  if (/docente|maestro/.test(t)) return 'docentes';
  if (/estudiante|companero|alumno/.test(t)) return 'estudiantes';
  return 'todos';
}
const inst = () => (cfg.institucion ? ', de ' + cfg.institucion : '');
const creadorNombre = () => (cfg.usuario === 'amigo' ? 'mi creador' : cfg.usuario);
const PRES_CHISTES = ['¿Por qué los programadores confunden Halloween con Navidad? Porque OCT 31 es igual a DEC 25.', '¿Qué hace una abeja en el gimnasio? Zumba.'];

function limpiarEscena() {
  cerrarPanel();
  Object.keys(ventanas).forEach(cerrarPrograma);
  if (matrizOn) modoMatrix(false);
}

async function narrar(texto, tok, lang) {
  if (tok !== pres.token) throw new Cancelado();
  await decir(llenar(texto), (parte) => { $('diapoTexto').textContent = parte; }, lang || pres.lang);
  if (tok !== pres.token) throw new Cancelado();
}
function esperar(ms, tok) {
  return new Promise((r) => setTimeout(r, ms)).then(() => { if (tok !== pres.token) throw new Cancelado(); });
}
function mostrarCalc(expr) {
  abrirPrograma('calculadora', true);
  const f = formatearResultado(evaluar(expr));
  if (calcApi) calcApi.poner(bonita(expr), f.pantalla, f.interno);
  return f;
}

const DIAPOS = [
  { titulo: () => cfg.proyecto, puntos: () => ['Presentado por ' + creadorNombre() + (cfg.institucion ? ' · ' + cfg.institucion : ''), 'Asistente personal de voz'],
    run: async (n) => {
      await n(SALUDOS[pres.aud] + '. Mi nombre es {n}, y soy un asistente personal de voz. Fui creado por {creador}' + inst() + ' para esta feria. Hoy voy a presentarme yo mismo, y les mostraré en vivo todo lo que puedo hacer.');
    } },
  { titulo: () => '¿Qué soy?', puntos: () => ['Escucha, entiende y responde con voz', 'Hecho con HTML, CSS y JavaScript', 'Funciona en el navegador, sin instalar nada'],
    run: async (n) => {
      await n('Soy una página web que escucha, entiende y responde. Para escucharlos uso el reconocimiento de voz del navegador, y para hablarles, la síntesis de voz. No necesito instalar ningún programa: solo un navegador.');
    } },
  { titulo: () => '¿Cómo funciono?', puntos: () => ['1. Escucho tu voz', '2. Entiendo palabras clave y frases parecidas', '3. Actúo: calculo, busco, muestro', '4. Respondo con voz y pantalla'],
    run: async (n) => {
      await n('Mi funcionamiento tiene cuatro pasos: escucho, entiendo, actúo y respondo. Quiero ser claro con ustedes: no soy una inteligencia artificial generativa. Entiendo muchas formas de decir lo mismo gracias a reglas y coincidencias aproximadas que mi creador diseñó, y consulto Wikipedia y los documentos que me carguen.');
    } },
  { titulo: () => 'Conversación', puntos: () => ['Charla libre y proactiva', 'Trivia, adivinanzas e historias', 'Responde preguntas sobre el proyecto'],
    run: async (n, w) => {
      await n('Me gusta conversar. Si hay silencio, yo mismo propongo temas. Puedo jugar trivias, resolver adivinanzas y contar historias. Por ejemplo, un dato curioso: ' + elegirRot('pdato', DATOS));
      await w(600);
      await n('Y un chiste, para ambientar. ' + elegirRot('pchiste', PRES_CHISTES));
    } },
  { titulo: () => 'Matemáticas', puntos: () => ['Operaciones enormes con exactitud', 'Raíces, potencias, porcentajes y factoriales'],
    run: async (n, w) => {
      let f = mostrarCalc('sqrt(144)');
      await n('Tengo una calculadora potente. Por ejemplo, la raíz cuadrada de ciento cuarenta y cuatro es ' + f.voz + '.');
      f = mostrarCalc('2^100');
      await n('También trabajo con números gigantes sin perder exactitud: dos elevado a la cien tiene ' + evaluar('2^100').toString().length + ' dígitos.');
      f = mostrarCalc('(15/100)*480');
      await n('Y porcentajes: el quince por ciento de cuatrocientos ochenta es ' + f.voz + '.');
    } },
  { titulo: () => 'Modelos 3D', puntos: () => ['Genero figuras con solo pedirlo', 'Cubo, esfera, cono, dona y más'],
    run: async (n, w) => {
      await n('Ahora el modelado tridimensional. Les creo un cubo rojo.');
      await crearModelo('crea un cubo rojo');
      if (!modelo) { await n('Esta demostración necesita internet, y en este momento no pude cargar el motor tridimensional.'); return; }
      await w(2500);
      await n('Y ahora una esfera azul.');
      await crearModelo('crea una esfera azul');
      await w(2500);
      await n('Todo con solo pedirlo.');
    } },
  { titulo: () => 'Casa inteligente', puntos: () => ['Luces, ventilador y puerta (simulados)', 'Listo para conectarse a dispositivos reales'],
    run: async (n, w) => {
      abrirPanel('v-casa');
      await n('Este es un panel de casa inteligente simulado. Enciendo la luz de la sala.');
      ponerDispositivo('luzSala', true, 'Encendida', 'Apagada');
      await w(700);
      await n('Ahora el ventilador.');
      ponerDispositivo('ventilador', true, 'Encendido', 'Apagado');
      await w(700);
      await n('Y abro la puerta.');
      ponerDispositivo('puerta', true, 'Abierta', 'Cerrada');
      await w(700);
      await n('En una versión futura, este mismo panel podría controlar dispositivos reales.');
    } },
  { titulo: () => 'Documentos y puntero', puntos: () => ['Busca dentro de tus archivos: texto, PDF, Word', 'Puntero virtual controlado con los dedos'],
    run: async (n) => {
      abrirPanel('v-docs');
      await n('También puedo leer los documentos que me carguen, como archivos de texto, PDF y Word, y responder preguntas sobre ellos. Ahora mismo tengo ' + docs.length + ' cargados.');
      await n('Además tengo un puntero virtual: con la cámara sigo el dedo índice, y al juntar el pulgar con el índice hago clic, como un mouse sin tocar nada.');
    } },
  { titulo: () => 'Cámara, pantalla y efectos', puntos: () => ['Cámara con detección de manos', 'Compartir pantalla', 'Modo visual Matrix'],
    run: async (n, w) => {
      await n('Puedo usar la cámara para detectar manos y mover objetos en pantalla, y también compartir el escritorio. Y para cerrar la demostración, mi modo visual.');
      modoMatrix(true);
      await w(4500);
      modoMatrix(false);
    } },
  { titulo: () => 'Bilingüe · English', puntos: () => ['Hablo español e inglés', 'Cambio de idioma con una sola orden', 'I speak English too'],
    run: async (n, w, ne) => {
      await n('Como me gusta hablar con todos, ahora les saludo en inglés.');
      await ne('Hello everyone! My name is {n}. I am a voice assistant created by {creador}. I can listen, calculate, show videos and three D models, and read your documents. Thank you for being here today.');
      await n('Y si me dicen: habla inglés, cambio de idioma para toda la conversación.');
    } },
  { titulo: () => 'Aprendizajes y futuro', puntos: () => ['Aprendimos: voz, interfaces y lógica', 'Futuro: IA generativa, domótica real, más idiomas'],
    run: async (n) => {
      await n('Los mayores retos fueron lograr que entendiera frases naturales, evitar que mi voz se cortara y hacerme funcionar en distintos navegadores. A futuro me gustaría conectarme a una inteligencia artificial generativa, controlar dispositivos reales y entender más idiomas.');
    } },
  { titulo: () => '¡Gracias!', puntos: () => ['Estoy listo para sus preguntas'],
    run: async (n) => {
      await n('Muchas gracias por su atención. Aprendimos que con solo tres lenguajes de programación y mucha práctica se puede crear una herramienta útil y cercana. Estoy listo para responder sus preguntas.');
    } }
];

function pintarDiapo(i) {
  const d = pres.deck[i];
  $('diapoNum').textContent = (i + 1) + ' / ' + pres.deck.length;
  $('diapoTitulo').textContent = d.titulo();
  const ul = $('diapoPuntos');
  ul.innerHTML = '';
  d.puntos().forEach((p) => { const li = document.createElement('li'); li.textContent = p; ul.appendChild(li); });
  $('diapoTexto').textContent = '';
  $('dpPausa').textContent = pres.pausada ? '▶ Continuar' : '⏸ Pausa';
}

async function correrDiapo(i) {
  const tok = ++pres.token;
  pres.i = i;
  pres.pausada = false;
  pintarDiapo(i);
  try {
    limpiarEscena();
    await pres.deck[i].run((t) => narrar(t, tok), (ms) => esperar(ms, tok), (t) => narrar(t, tok, 'en'));
    await esperar(450, tok);
  } catch (e) {
    if (e instanceof Cancelado) return;
    console.error(e);
    if (tok !== pres.token) return;
  }
  if (tok !== pres.token) return;
  if (i + 1 < pres.deck.length) correrDiapo(i + 1); else terminarPresentacion(true);
}

function iniciarPresentacion(aud, lang) {
  detenerHabla();
  pres.idiomaPrevio = idioma;
  pres.lang = lang === 'en' ? 'en' : 'es';
  pres.deck = pres.lang === 'en' ? DIAPOS_EN : DIAPOS;
  if (pres.lang === 'en') ponerIdioma('en');
  ctx.esperando = null; ctx.trivia = null; ctx.adiv = null;
  pres.enCurso = true; pres.pausada = false; pres.aud = aud || 'todos';
  document.body.classList.add('presentando');
  $('diapo').classList.remove('oculto');
  correrDiapo(0);
}
function siguienteDiapo() { if (!pres.enCurso) return; pres.token++; detenerHabla(); if (pres.i + 1 < pres.deck.length) correrDiapo(pres.i + 1); else terminarPresentacion(true); }
function anteriorDiapo() { if (!pres.enCurso) return; pres.token++; detenerHabla(); correrDiapo(Math.max(0, pres.i - 1)); }
function pausarPresentacion() {
  if (!pres.enCurso || pres.pausada) return;
  pres.token++; pres.pausada = true; detenerHabla();
  $('dpPausa').textContent = '▶ Continuar';
  $('diapoTexto').textContent = 'Presentación en pausa. Puedes hacerme preguntas, o decir "continúa".';
}
function continuarPresentacion() {
  if (!pres.enCurso || !pres.pausada) return;
  correrDiapo(pres.i);
}
function salirPresentacion() {
  if (pres.lang === 'en' && pres.enCurso) ponerIdioma(pres.idiomaPrevio || 'es');
  pres.token++; pres.enCurso = false; pres.pausada = false;
  detenerHabla();
  document.body.classList.remove('presentando');
  $('diapo').classList.add('oculto');
  limpiarEscena();
}
function terminarPresentacion(natural) {
  const eng = pres.lang === 'en';
  salirPresentacion();
  if (natural && eng) hablarEn('And that concludes my presentation. Members of the jury, teachers and classmates, who has the first question?');
  else if (natural) hablar('Y con esto termina mi presentación. Jurados, docentes y compañeros, ¿quién tiene la primera pregunta?');
}

function controlPresentacion(t) {
  const sig = /^(?:siguiente|adelante|avanza|proxima|salta|next|forward|skip)\b/.test(t);
  const ant = /^(?:anterior|atras|regresa|vuelve|previous|back|go back)\b/.test(t);
  const pau = /^(?:pausa|pausar|detente|deten|para|espera|alto|silencio|callate|basta|pause|wait|hold on|stop|be quiet)\b/.test(t);
  const con = /^(?:continua|continuar|reanuda|sigue|seguir|prosigue|retoma|continue|resume|go on|keep going)\b/.test(t);
  const sal = /(?:salir|sal de|termina|terminar|cancela|cancelar|detener|fin de)\s*(?:de |la )*(?:presentacion|demostracion)?$/.test(t) && /(presentacion|demostracion|salir|termina|cancela)/.test(t);
  const rep = /(repite|repetir|otra vez).*(diapositiva|parte|eso)/.test(t);
  const salEn = /(?:exit|quit|end|stop|cancel|leave)\s+(?:the\s+)?(?:presentation|demo)|^(?:exit|quit)$/.test(t);
  if (sal || salEn) { const eng = pres.lang === 'en'; salirPresentacion(); if (eng) hablarEn('Presentation finished.'); else hablar('Presentación terminada.'); return true; }
  if (sig) { siguienteDiapo(); return true; }
  if (ant) { anteriorDiapo(); return true; }
  if (pau) { pausarPresentacion(); return true; }
  if (con) { continuarPresentacion(); return true; }
  if (rep) { pres.token++; detenerHabla(); correrDiapo(pres.i); return true; }
  return !pres.pausada;
}

$('dpSig').addEventListener('click', siguienteDiapo);
$('dpAnt').addEventListener('click', anteriorDiapo);
$('dpSalir').addEventListener('click', () => { salirPresentacion(); hablar('Presentación terminada.'); });
$('dpPausa').addEventListener('click', () => { if (pres.pausada) continuarPresentacion(); else pausarPresentacion(); });
$('btnPresentar').addEventListener('click', () => iniciarPresentacion('todos'));
document.addEventListener('keydown', (e) => {
  if (!pres.enCurso || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
  if (e.key === 'ArrowRight') siguienteDiapo();
  else if (e.key === 'ArrowLeft') anteriorDiapo();
  else if (e.key === 'Escape') { salirPresentacion(); }
  else if (e.key === ' ') { e.preventDefault(); if (pres.pausada) continuarPresentacion(); else pausarPresentacion(); }
});

// ---------------------------------------------------------------------
//  V7: INVESTIGACIÓN MEJORADA, VIDEOS, LECTURA DE PANTALLA, EXCEL, IDIOMAS
// ---------------------------------------------------------------------
let idioma = 'es';
let vocesEn = [];
const enc = encodeURIComponent;

async function getJSON(url, ms) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms || 8000);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(id); }
}
function jsonp(url, ms) {
  return new Promise((resolve, reject) => {
    const nombre = '__jp' + Math.floor(Math.random() * 1e9);
    const s = document.createElement('script');
    const fin = (ok, v) => { clearTimeout(tm); delete window[nombre]; s.remove(); ok ? resolve(v) : reject(v); };
    const tm = setTimeout(() => fin(false, new Error('tiempo')), ms || 7000);
    window[nombre] = (d) => fin(true, d);
    s.onerror = () => fin(false, new Error('error'));
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + nombre;
    document.head.appendChild(s);
  });
}

// ----- Voces en inglés -----
function elegirVozEn() {
  if (!vocesEn.length) {
    try { vocesEn = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('en')); } catch (e) {}
  }
  const pref = [/Google US English/i, /Microsoft (Aria|Jenny|Guy|Zira|David|Mark)/i, /Samantha|Alex/i, /Google UK English Female/i, /en[-_]US/i];
  for (const re of pref) { const v = vocesEn.find((x) => re.test(x.name) || re.test(x.lang)); if (v) return v; }
  return vocesEn[0] || null;
}
if ('speechSynthesis' in window) {
  const prev = speechSynthesis.onvoiceschanged;
  speechSynthesis.onvoiceschanged = () => { try { prev && prev(); } catch (e) {} vocesEn = []; elegirVozEn(); };
}

function hablarEn(texto, pantalla) {
  if (typeof pres !== 'undefined' && pres.enCurso && !pres.pausada) return Promise.resolve();
  mostrarRespuesta(pantalla || texto);
  ultimaVoz = texto;
  ultimaLang = 'en';
  return decir(texto, null, 'en');
}
let ultimaLang = 'es';

function ponerIdioma(l) {
  idioma = l;
  document.documentElement.lang = l;
  if (reconocimiento) {
    reconocimiento.lang = l === 'en' ? 'en-US' : 'es-ES';
    if (escuchando) { try { reconocimiento.abort(); } catch (e) {} }
  }
}

async function traducir(texto, de, a) {
  const d = await getJSON('https://api.mymemory.translated.net/get?q=' + enc(texto) + '&langpair=' + de + '|' + a, 9000);
  const r = d && d.responseData && d.responseData.translatedText;
  if (!r || /MYMEMORY WARNING|INVALID/i.test(r)) throw new Error('sin traducción');
  return r.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
async function traducirYDecir(texto, de, a) {
  setModo('pensando');
  try {
    const r = await traducir(texto, de, a);
    mostrarRespuesta(texto + '  →  ' + r);
    if (a === 'en') await decir(r, null, 'en'); else await decir(r);
  } catch (e) {
    hablar('No pude traducir en este momento. Revisa tu conexión a internet.');
  }
}

// ----- Investigación robusta -----
function limpiarTema(t) {
  return t.replace(/^(?:investiga(?:me)?|busca(?:me)?|dime|cuentame|hablame|explica(?:me)?|informacion|info|quiero saber|me puedes decir)\s+(?:sobre|de|del|acerca de|que es|quien es)?\s*/i, '')
    .replace(/^(?:que|quien|quienes|cual|cuales)\s+(?:es|son|fue|fueron|era|eran)\s+/i, '')
    .replace(/^(?:sobre|acerca de|de)\s+/i, '')
    .replace(/[¿?¡!]/g, '').trim() || t;
}
async function wikiBuscar(lang, q) {
  const d = await getJSON('https://' + lang + '.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=4&srsearch=' + enc(q), 8000);
  return ((d.query && d.query.search) || []).map((x) => x.title);
}
async function wikiResumen(lang, titulo) {
  return await getJSON('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + enc(titulo), 8000);
}
function dosFrases(txt, max) {
  let corto = (txt || '').split('. ').slice(0, 2).join('. ');
  if (corto.length > max) corto = corto.slice(0, max);
  return corto.replace(/[.\s]+$/, '') + '.';
}

async function investigar(tema, en) {
  abrirPanel('v-info');
  setModo('pensando');
  const q0 = limpiarTema(tema);
  $('info').textContent = (en ? 'Searching for ' : 'Buscando información sobre ') + q0 + '...';
  const variantes = [q0];
  if (tema !== q0) variantes.push(tema);
  const langs = en ? ['en'] : ['es', 'en'];
  let huboRed = false, hit = null;
  for (const lang of langs) {
    for (const q of variantes) {
      try {
        const titulos = await wikiBuscar(lang, q);
        huboRed = true;
        for (const ti of titulos.slice(0, 3)) {
          const info = await wikiResumen(lang, ti);
          if (info && info.extract && info.type !== 'disambiguation') { hit = { lang, info }; break; }
        }
      } catch (e) {}
      if (hit) break;
    }
    if (hit) break;
  }

  if (hit) {
    const info = hit.info;
    $('info').innerHTML = '';
    if (info.thumbnail && info.thumbnail.source) {
      const img = document.createElement('img'); img.src = info.thumbnail.source; img.alt = info.title;
      $('info').appendChild(img);
    }
    const h = document.createElement('h3'); h.textContent = info.title;
    const p = document.createElement('p'); p.textContent = info.extract;
    $('info').appendChild(h); $('info').appendChild(p);
    const url = info.content_urls && info.content_urls.desktop && info.content_urls.desktop.page;
    if (url) {
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = en ? 'Read more on Wikipedia' : 'Leer más en Wikipedia'; a.className = 'enlace-grande';
      $('info').appendChild(a);
    }
    const corto = dosFrases(info.extract, 330);
    if (hit.lang === 'en' && !en) {
      hablar('No lo encontré en español, pero sí en Wikipedia en inglés. Te lo leo en inglés.', 'Wikipedia (English): ' + info.title)
        .then(() => decir(corto, null, 'en'));
    } else if (en) hablarEn(corto, info.title);
    else hablar(corto, info.title);
    return;
  }

  // Segundo intento: DuckDuckGo (respuesta instantánea)
  if (huboRed || true) {
    try {
      const d = await jsonp('https://api.duckduckgo.com/?q=' + enc(q0) + '&format=json&no_html=1&skip_disambig=1');
      if (d && (d.AbstractText || d.Answer || d.Definition)) {
        const txt = d.AbstractText || d.Answer || d.Definition;
        $('info').innerHTML = '';
        const h = document.createElement('h3'); h.textContent = d.Heading || q0;
        const p = document.createElement('p'); p.textContent = txt;
        $('info').appendChild(h); $('info').appendChild(p);
        en ? hablarEn(dosFrases(txt, 330)) : hablar(dosFrases(txt, 330), d.Heading || q0);
        return;
      }
    } catch (e) {}
  }

  const gUrl = 'https://www.google.com/search?q=' + enc(q0);
  $('info').innerHTML = '';
  const p = document.createElement('p');
  p.textContent = (en ? 'I did not find an article for "' : 'No encontré un artículo para "') + q0 + '".';
  const a = document.createElement('a'); a.href = gUrl; a.target = '_blank'; a.rel = 'noopener'; a.className = 'enlace-grande';
  a.textContent = en ? '🔎 Search it on Google' : '🔎 Buscarlo en Google';
  $('info').appendChild(p); $('info').appendChild(a);
  if (!huboRed) {
    const msg = en ? 'I could not connect to the internet.' : 'No pude conectarme a internet para investigar. Revisa tu conexión.';
    en ? hablarEn(msg) : hablar(msg);
    return;
  }
  buscarVideos(q0, { en, intro: en ? 'I did not find an article, but here are some videos about it. ' : 'No encontré un artículo sobre eso, pero te muestro videos relacionados. ' });
}

// ----- Videos dentro de la página -----
const VID = { lista: [], i: 0, q: '' };
function normVideo(x) {
  const id = x.videoId || (x.url && (String(x.url).match(/[?&]v=([\w-]{11})/) || [])[1]);
  if (!id) return null;
  return { id, titulo: x.title || 'Video', autor: x.author || x.uploaderName || '' };
}
async function videosDe(q) {
  const Q = enc(q);
  const urls = [
    'https://pipedapi.kavin.rocks/search?filter=videos&q=' + Q,
    'https://pipedapi.adminforge.de/search?filter=videos&q=' + Q,
    'https://api.piped.private.coffee/search?filter=videos&q=' + Q,
    'https://yewtu.be/api/v1/search?type=video&q=' + Q,
    'https://inv.nadeko.net/api/v1/search?type=video&q=' + Q,
    'https://invidious.nerdvpn.net/api/v1/search?type=video&q=' + Q
  ];
  const intentos = urls.map(async (u) => {
    const d = await getJSON(u, 7000);
    const arr = Array.isArray(d) ? d : (d.items || []);
    const v = arr.map(normVideo).filter(Boolean);
    if (!v.length) throw new Error('vacío');
    return v;
  });
  try { return (await Promise.any(intentos)).slice(0, 8); } catch (e) { return []; }
}
function pintarVideos() {
  const c = $('listaVideos');
  c.innerHTML = '';
  VID.lista.forEach((v, i) => {
    const d = document.createElement('div');
    d.className = 'video-item' + (i === VID.i ? ' activo' : '');
    const img = document.createElement('img'); img.src = 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'; img.alt = '';
    const s = document.createElement('span'); s.textContent = v.titulo + (v.autor ? ' · ' + v.autor : '');
    d.appendChild(img); d.appendChild(s);
    d.addEventListener('click', () => reproducirVideo(i, idioma === 'en'));
    c.appendChild(d);
  });
}
function reproducirVideo(i, en, intro) {
  const v = VID.lista[i];
  if (!v) return;
  VID.i = i;
  $('reproductor').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="video"></iframe>';
  pintarVideos();
  const msg = (intro || '') + (en ? 'Playing: ' : 'Reproduciendo: ') + v.titulo + (v.autor ? (en ? ', from the channel ' : ', del canal ') + v.autor : '') + '.';
  en ? hablarEn(msg, v.titulo) : hablar(msg, v.titulo);
}
async function buscarVideos(q, opt) {
  opt = opt || {};
  const en = !!opt.en;
  q = (q || '').replace(/^(?:de|sobre|del|acerca de|about|of|on|for)\s+/i, '').trim();
  if (!q) { hablar('¿De qué quieres ver videos?'); return; }
  abrirPanel('v-videos');
  setModo('pensando');
  $('reproductor').innerHTML = '';
  $('listaVideos').textContent = en ? 'Searching videos…' : 'Buscando videos…';
  const lista = await videosDe(q);
  VID.q = q;
  if (!lista.length) {
    VID.lista = [];
    const url = 'https://www.youtube.com/results?search_query=' + enc(q);
    $('listaVideos').innerHTML = '';
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'enlace-grande';
    a.textContent = en ? '▶ See "' + q + '" on YouTube' : '▶ Ver "' + q + '" en YouTube';
    $('listaVideos').appendChild(a);
    const msg = (opt.intro || '') + (en ? 'I could not load the video list here. I left a button to open the YouTube results.' : 'No pude cargar la lista de videos aquí. Te dejé un botón para abrir los resultados en YouTube.');
    en ? hablarEn(msg) : hablar(msg);
    return;
  }
  VID.lista = lista; VID.i = 0;
  reproducirVideo(0, en, (opt.intro || '') + (en ? 'I found ' + lista.length + ' videos about ' + q + '. ' : 'Encontré ' + lista.length + ' videos sobre ' + q + '. '));
}
function siguienteVideo() {
  if (!VID.lista.length) { hablar('No hay videos en la lista. Pídeme, por ejemplo: pon videos de gatos.'); return; }
  reproducirVideo((VID.i + 1) % VID.lista.length, idioma === 'en');
}
function cerrarVideo() {
  $('reproductor').innerHTML = '';
  VID.lista = [];
  $('listaVideos').textContent = '';
  hablar('Cerré el video.');
}

// ----- Leer la pantalla compartida (OCR) -----
let ocrWorker = null, vigia = null, ultimoOCR = '';
async function ocrDe(canvas) {
  await cargarScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js');
  if (!ocrWorker) ocrWorker = await Tesseract.createWorker('spa+eng');
  const r = await ocrWorker.recognize(canvas);
  return (r && r.data && r.data.text) || '';
}
function cuadroPantalla(region) {
  const v = $('videoPantalla');
  const w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) return null;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (region === 'notif') { sx = Math.floor(w * 0.5); sy = Math.floor(h * 0.4); sw = w - sx; sh = Math.floor(h * 0.55); }
  const k = sw < 1400 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = sw * k; c.height = sh * k;
  const g = c.getContext('2d');
  g.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
function limpiarOCR(txt) {
  return txt.split(/\n+/).map((l) => l.replace(/[^\p{L}\p{N}\s.,:;¿?¡!()@#%/-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => (l.match(/\p{L}/gu) || []).length >= 4 && l.length >= 6).join('. ');
}
async function leerPantalla(region) {
  if (!streamPantalla) { hablar('Primero comparte la pantalla y luego te digo lo que veo. Di: comparte pantalla.'); return; }
  const c = cuadroPantalla(region);
  if (!c) { hablar('Todavía no recibo imagen de la pantalla compartida.'); return; }
  setModo('pensando');
  mostrarRespuesta('Leyendo la pantalla...');
  hablar('Un momento, leo la pantalla.', 'Leyendo la pantalla...');
  let txt = '';
  try { txt = limpiarOCR(await ocrDe(c)); } catch (e) { hablar('No pude cargar el lector de texto. Necesita internet la primera vez.'); return; }
  if (!txt) { hablar(region === 'notif' ? 'No veo ninguna notificación con texto legible.' : 'No logré leer texto en la pantalla.'); return; }
  abrirPanel('v-info');
  $('info').innerHTML = '';
  const h = document.createElement('h3'); h.textContent = region === 'notif' ? 'Notificaciones en pantalla' : 'Texto de la pantalla';
  const p = document.createElement('p'); p.textContent = txt;
  $('info').appendChild(h); $('info').appendChild(p);
  hablar((region === 'notif' ? 'En la esquina de la pantalla leo: ' : 'En la pantalla leo: ') + txt.slice(0, 420));
}
function similitud(a, b) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean)), B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((x) => { if (B.has(x)) n++; });
  return n / Math.max(A.size, B.size);
}
function vigilarNotificaciones(on) {
  if (!on) {
    clearInterval(vigia); vigia = null;
    hablar('Dejé de vigilar las notificaciones.');
    return;
  }
  if (!streamPantalla) { hablar('Primero comparte la pantalla. Después te aviso cuando aparezca una notificación.'); return; }
  if (vigia) { hablar('Ya estoy vigilando las notificaciones.'); return; }
  ultimoOCR = '';
  hablar('Listo, vigilo la esquina de tu pantalla y te leo lo que aparezca. Funciona mejor si Luna queda en segundo plano.'.replace('Luna', cfg.nombre));
  let ocupado = false;
  vigia = setInterval(async () => {
    if (ocupado || hablando || !streamPantalla) return;
    ocupado = true;
    try {
      const c = cuadroPantalla('notif');
      if (c) {
        const txt = limpiarOCR(await ocrDe(c));
        if (txt.length >= 18 && similitud(txt, ultimoOCR) < 0.5) {
          ultimoOCR = txt;
          hablar('Nueva notificación en pantalla: ' + txt.slice(0, 260));
        } else if (txt.length < 18) { ultimoOCR = ''; }
      }
    } catch (e) {}
    ocupado = false;
  }, 9000);
}

// ----- Excel, Word y documentos visibles -----
const _leerOriginal = leerArchivo;
leerArchivo = async function (file) {
  const n = file.name.toLowerCase();
  if (/\.(xlsx|xls|xlsm|ods)$/.test(n)) {
    await cargarScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return wb.SheetNames.map((s) => 'Hoja ' + s + ':\n' + window.XLSX.utils.sheet_to_csv(wb.Sheets[s], { FS: ' | ', blankrows: false })).join('\n\n');
  }
  return _leerOriginal(file);
};

const OFFICE = {
  excel: { nombre: 'Excel', uri: 'ms-excel:', ext: /\.(xlsx|xls|csv|ods|xlsm)$/i },
  word: { nombre: 'Word', uri: 'ms-word:', ext: /\.(docx|doc|txt)$/i },
  powerpoint: { nombre: 'PowerPoint', uri: 'ms-powerpoint:', ext: /\.(pptx|ppt)$/i }
};
function verDoc(d) {
  abrirPanel('v-docs');
  const c = $('resultadosDocs');
  c.innerHTML = '';
  const h = document.createElement('h4'); h.textContent = '📄 ' + d.nombre;
  const pre = document.createElement('pre'); pre.className = 'doc-visor';
  pre.textContent = d.texto.length > 7000 ? d.texto.slice(0, 7000) + '\n…' : d.texto;
  c.appendChild(h); c.appendChild(pre);
  const intro = resumir(d.texto.replace(/\s+/g, ' ').replace(/ \| /g, ', '), 380);
  hablar('Abrí ' + d.nombre.replace(/\.\w+$/, '') + '. Empieza así: ' + intro);
}
function buscarDocPorNombre(q) {
  const n = normalizar(q).replace(/\b(el|la|mi|mis|documento|archivo|pdf|hoja|de calculo)\b/g, '').trim();
  if (!n) return docs[docs.length - 1] || null;
  return docs.find((d) => normalizar(d.nombre).includes(n)) || docs.find((d) => n.split(' ').some((w) => w.length > 3 && normalizar(d.nombre).includes(w))) || null;
}
function abrirOffice(k) {
  const o = OFFICE[k];
  const propio = docs.slice().reverse().find((d) => o.ext.test(d.nombre));
  if (propio) { verDoc(propio); return; }
  abrirPanel('v-docs');
  const c = $('accionesOffice');
  c.innerHTML = '';
  const a = document.createElement('a'); a.href = o.uri; a.className = 'enlace-grande'; a.textContent = '👉 Pulsa aquí para abrir ' + o.nombre + ' en tu computadora';
  c.appendChild(a);
  hablar('Una página web no puede iniciar ' + o.nombre + ' por su cuenta. Te dejé un botón para abrirlo con un clic. Y si cargas tu archivo aquí, yo lo leo y te lo muestro en pantalla.');
}

// ----- Pantalla completa -----
function pantallaCompleta() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen(); return true; }
    const p = document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => hablar('El navegador exige que pulses el botón de pantalla completa tú mismo.'));
    return true;
  } catch (e) { hablar('El navegador exige que pulses el botón de pantalla completa tú mismo.'); return false; }
}
$('btnFull').addEventListener('click', pantallaCompleta);

// ---------------------------------------------------------------------
//  V7: MODO INGLÉS COMPLETO Y PRESENTACIÓN EN INGLÉS
// ---------------------------------------------------------------------
const EN_CHISTES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'Why did the computer go to the doctor? Because it caught a virus.',
  'What is a robot\'s favorite snack? Computer chips.',
  'Why was the math book sad? It had too many problems.',
  'How do you comfort a JavaScript bug? You console it.',
  'What did the router say to the doctor? It hurts when IP.'
];
const EN_DATOS = [
  'Honey never spoils. Archaeologists have found edible honey in ancient Egyptian tombs.',
  'Octopuses have three hearts and blue blood.',
  'Light from the Sun takes about eight minutes to reach the Earth.',
  'Bolivia has the largest salt flat in the world, the Salar de Uyuni.',
  'The first computer programmer was Ada Lovelace, in the eighteen hundreds.',
  'A day on Venus is longer than a year on Venus.'
];
const EN_COLORES = { red: 'rojo', blue: 'azul', green: 'verde', yellow: 'amarillo', orange: 'naranja', purple: 'morado', pink: 'rosado', white: 'blanco', black: 'negro', gray: 'gris', grey: 'gris', cyan: 'celeste' };
const EN_FORMAS = { cube: 'cubo', box: 'cubo', sphere: 'esfera', ball: 'esfera', cone: 'cono', cylinder: 'cilindro', donut: 'dona', doughnut: 'dona', torus: 'dona', pyramid: 'piramide' };
const EN_SITIOS = { youtube: 'youtube', google: 'google', wikipedia: 'wikipedia', gmail: 'gmail', maps: 'maps', whatsapp: 'whatsapp', spotify: 'spotify', github: 'github', drive: 'drive', translator: 'traductor' };
let rotEn = {};
const sorteoEn = (k, a) => { let i; do { i = Math.floor(Math.random() * a.length); } while (a.length > 1 && i === rotEn[k]); rotEn[k] = i; return a[i]; };
const mudo = (fn) => { window.__mudo = true; try { return fn(); } finally { window.__mudo = false; } };

function mateEn(t) {
  let s = t.replace(/[?!,]/g, ' ').replace(/\bpoint\b/g, '.')
    .replace(/\b(?:what is|what's|whats|how much is|how much are|calculate|compute|solve|please|tell me)\b/g, ' ')
    .replace(/square root of ([\d.]+)/g, 'sqrt($1)')
    .replace(/([\d.]+) squared/g, '($1^2)').replace(/([\d.]+) cubed/g, '($1^3)')
    .replace(/([\d.]+) (?:to the power of|to the) ([\d.]+)(?: power)?/g, '($1^$2)')
    .replace(/([\d.]+) (?:percent|per cent) of ([\d.]+)/g, '(($1/100)*$2)')
    .replace(/factorial of (\d+)/g, '($1!)')
    .replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-')
    .replace(/\b(?:times|multiplied by)\b/g, '*').replace(/\b(?:divided by|over)\b/g, '/')
    .replace(/(\d)\s*x\s*(\d)/g, '$1*$2')
    .replace(/\b(?:the|of|a)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!/\d/.test(s)) return null;
  if (!/[+\-*/^!]|sqrt/.test(s)) return null;
  if (/[a-z]/.test(s.replace(/sqrt/g, ''))) return null;
  return s;
}
function decirNumeroEn(v) {
  if (typeof v === 'bigint') {
    const s = (v < 0n ? -v : v).toString(), sg = v < 0n ? 'minus ' : '';
    if (s.length <= 15) return sg + Number(s).toLocaleString('en-US');
    return sg + 'approximately ' + s[0] + '.' + s.slice(1, 3) + ' times 10 to the power of ' + (s.length - 1);
  }
  return String(Number(v.toPrecision(12)));
}

function presentarEnPantalla() { iniciarPresentacion('todos', 'en'); }

const INTENCIONES_EN = [
  [/(show|activate|turn on|switch to|enable).*(hologram|avatar|body)/, () => { ponerHolo(true); hablarEn('Here I am, as a hologram. You can say: wave, or: back to the sphere.'); }],
  [/(turn off|hide|disable|remove|back to).*(hologram|avatar|body|sphere|ball)/, () => { ponerHolo(false); hablarEn('Back to the sphere.'); }],
  [/^(?:wave|say hello to everyone|greet everyone|wave hello)/, () => { saludarHolo(); hablarEn('Hello everyone, it is a pleasure to be here.'); }],
  [/(what am i doing|what do you see|describe me|look at me|what can you see)/, () => describirCamara(null, true)],
  [/(how many fingers)/, () => contarDedos()],
  [/(speak|talk|switch|go back|back) .*(spanish|espanol)|habla espanol|en espanol/, () => { ponerIdioma('es'); hablar('Perfecto, volvemos al español. Te escucho.'); }],
  [/^(?:hello|hi|hey|good (?:morning|afternoon|evening))\b/, () => hablarEn(llenarEn('Hello{u}! I am {n}, your voice assistant. What would you like to do today?'))],
  [/how are you|how is it going|how do you feel/, () => hablarEn('I am doing great, thank you for asking! I am ready to help. How are you?')],
  [/(what is|what's|whats) your name|who are you|introduce yourself|tell me about yourself/, () => hablarEn(llenarEn('My name is {n}. I am a voice assistant that runs inside a web browser. I can listen, answer questions, calculate, show videos and three D models, and read your documents.'))],
  [/who (?:created|made|built|programmed|designed) you/, () => hablarEn(llenarEn('I was created by {creador} for this school fair, using HTML, CSS and JavaScript.'))],
  [/(what can you do|help me|what do you know|your features|capabilities)/, () => hablarEn('I can chat with you, tell jokes and facts, do math, search for information, show videos, create three D models, read your documents, and switch between English and Spanish. For example, say: tell me a joke, or: show me videos about space.')],
  [/(tell me )?(a )?joke|make me laugh/, () => hablarEn(sorteoEn('j', EN_CHISTES))],
  [/(fun fact|interesting fact|tell me a fact|something interesting|curious fact)/, () => hablarEn(sorteoEn('d', EN_DATOS))],
  [/what time is it|current time|what is the time/, () => hablarEn('It is ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '.')],
  [/(what day is it|what is the date|today's date|what is today)/, () => hablarEn('Today is ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '.')],
  [/\b(thank you|thanks)\b/, () => hablarEn('You are welcome! I am happy to help.')],
  [/\b(goodbye|bye|see you)\b/, () => hablarEn('Goodbye! It was really nice talking with you.')],
  [/are you (?:an? )?(?:ai|artificial|real|human|robot)|are you chat ?gpt/, () => hablarEn('I am not a person, and I am not a large generative A I either. I am a rule based assistant written in JavaScript. I understand many ways of saying things, and I look up information on Wikipedia when I need it.')],
  [/how do you work|how does it work/, () => hablarEn('I work in four steps. First, the browser turns your voice into text. Second, my program looks for the meaning of your words. Third, it performs an action, like calculating or searching. Fourth, I answer with my voice and on the screen.')],
  [/(start|begin|give|do|run|make)\b.*\b(presentation|demo|demonstration)|present yourself/, () => presentarEnPantalla()],
  [/^(?:stop talking|be quiet|shut up|silence|stop)$/, () => detenerHabla()],
  [/(repeat that|say that again|what did you say|repeat)/, () => { if (ultimaVoz) decir(ultimaVoz, null, ultimaLang); else hablarEn('I have not said anything yet.'); }],
  [/(slower|speak slowly|slow down)/, () => { ritmoVoz = Math.max(0.6, ritmoVoz - 0.15); hablarEn('Okay, I will speak more slowly.'); ultimaVoz = ''; }],
  [/(faster|speed up)/, () => { ritmoVoz = Math.min(1.5, ritmoVoz + 0.15); hablarEn('Okay, I will speak faster.'); ultimaVoz = ''; }],
  [/(next video|another video)/, () => siguienteVideo()],
  [/(close|stop|remove) (?:the )?video/, () => { $('reproductor').innerHTML = ''; VID.lista = []; $('listaVideos').textContent = ''; hablarEn('Video closed.'); }],
  [/full ?screen/, () => { pantallaCompleta(); hablarEn('Switching full screen.'); }],
  [/(share|start sharing) .*screen/, () => { hablarEn('Sharing your screen. Please pick the screen in the window that appears.'); compartirPantalla(); }],
  [/(read|what is on|what's on) .*screen/, () => leerPantalla('todo')],
  [/(close|clear|remove) everything/, () => { Object.keys(ventanas).forEach(cerrarPrograma); cerrarPanel(); hablarEn('Everything is closed.'); }],
  [/(modo|mode) matrix|matrix mode/, () => { modoMatrix(true); hablarEn('Matrix mode is on.'); }],
  [/(turn off|disable|stop) matrix/, () => { modoMatrix(false); hablarEn('Matrix mode is off.'); }]
];
function llenarEn(s) {
  return s.replace(/\{u\}/g, cfg.usuario === 'amigo' ? '' : ', ' + cfg.usuario).replace(/\{n\}/g, cfg.nombre).replace(/\{creador\}/g, cfg.usuario === 'amigo' ? 'my creator' : cfg.usuario);
}

function procesarEn(t) {
  let m;
  // matemáticas
  const ex = mateEn(t);
  if (ex) {
    try {
      const v = evaluar(ex);
      const dicho = decirNumeroEn(v);
      hablarEn('The result is ' + dicho + '.', ex + ' = ' + dicho);
      if (calcApi && ventanas.calculadora) { const f = formatearResultado(v); calcApi.poner(bonita(ex), f.pantalla, f.interno); }
      return true;
    } catch (e) { hablarEn('Sorry, I could not solve that operation.'); return true; }
  }
  for (const [re, fn] of INTENCIONES_EN) { if (re.test(t)) { fn(); return true; } }

  m = t.match(/(?:open|go to|launch|take me to)\s+(?:the\s+)?(youtube|google|wikipedia|gmail|maps|whatsapp|spotify|github|drive|translator)\b/);
  if (m) { mudo(() => abrirSitio(EN_SITIOS[m[1]])); hablarEn('Opening ' + m[1] + '.'); return true; }
  m = t.match(/(?:create|make|build|generate|show|give)\s+(?:me\s+)?(?:an?\s+)?(?:(\w+)\s+)?(cube|box|sphere|ball|cone|cylinder|donut|doughnut|torus|pyramid)\b/);
  if (m) {
    const col = EN_COLORES[m[1]] || '';
    window.__mudo = true;
    const dicho = 'Done. I created a ' + (EN_COLORES[m[1]] ? m[1] + ' ' : '') + m[2] + '. Say: stop the model, or: delete the model.';
    Promise.resolve(crearModelo('crea un ' + EN_FORMAS[m[2]] + ' ' + col)).finally(() => { window.__mudo = false; hablarEn(dicho); });
    return true;
  }
  if (/(delete|remove|clear) (?:the )?(?:model|shape)/.test(t)) { mudo(() => borrarModelo()); hablarEn('The model was deleted.'); return true; }
  m = t.match(/(?:play|show|find|search|put on|watch)\s+(?:me\s+)?(?:some\s+)?(?:videos?|clips?)\s*(?:about|of|on|for)?\s*(.+)/) || t.match(/^(?:play|watch)\s+(.+)/);
  if (m) { buscarVideos(m[1], { en: true }); return true; }
  m = t.match(/(?:translate|how do you say|say)\s+(.+?)\s+(?:in|to|into)\s+spanish/);
  if (m) { traducirYDecir(m[1], 'en', 'es'); return true; }
  m = t.match(/^(?:tell me (?:something )?about|what is|what are|what was|who is|who was|who are|search (?:for|about)|look up|explain|research|define|where is|why is|why are|how many|how does|how do)\s+(?:an?\s+|the\s+)?(.+)/);
  if (m) { investigar(m[1], true); return true; }

  if (/\?$/.test(t) || t.split(' ').length >= 5) { investigar(t, true); return true; }
  hablarEn('I did not catch that. You can say: tell me a joke, what is two plus two, show me videos about space, or tell me about black holes.');
  return true;
}

// Comandos en español para cambiar de idioma o traducir
function comandosIdioma(t) {
  let m;
  if (/\b(?:habla|hablame|hablemos|cambia|pasa|pon|ponte|responde|modo|activa)\b.*\bingles\b|\bspeak english\b|\bmodo ingles\b|^(?:ingles|english)$/.test(t) && !/\b(como se dice|traduc)/.test(t)) {
    ponerIdioma('en');
    hablarEn(llenarEn('Sure{u}! From now on I will speak English with you. Ask me anything. For example: tell me a joke, or: what is twenty five times four.'));
    return true;
  }
  m = t.match(/^(?:como se dice|que significa|traduce(?:me)?|di(?:me)?|decir)\s+(.+?)\s+(?:en|al)\s+ingles$/) ||
      t.match(/^(?:traduce(?:me)?|di(?:me)?)\s+(?:al\s+)?ingles\s+(.+)$/);
  if (m) { traducirYDecir(m[1], 'es', 'en'); return true; }
  m = t.match(/^(?:presentate|inicia la presentacion|haz la presentacion|comienza la presentacion).*\b(?:en\s+)?ingles\b/) ||
      t.match(/^(?:presentate|presentacion|presentate ante .+)\s+en\s+ingles$/);
  if (m) { iniciarPresentacion(audienciaDe(t), 'en'); return true; }
  return false;
}

// ----- Presentación en inglés -----
const SALUDOS_EN = {
  jurados: 'Distinguished members of the jury', profesores: 'Dear professors', docentes: 'Dear teachers',
  estudiantes: 'Dear classmates and students', todos: 'Distinguished jury, dear teachers, and dear classmates'
};
const instEn = () => (cfg.institucion ? ', from ' + cfg.institucion : '');
const DIAPOS_EN = [
  { titulo: () => cfg.proyecto, puntos: () => ['Presented by ' + (cfg.usuario === 'amigo' ? 'my creator' : cfg.usuario) + (cfg.institucion ? ' · ' + cfg.institucion : ''), 'Voice assistant · English version'],
    run: async (n) => {
      await n(SALUDOS_EN[pres.aud] + '. My name is {n}, and I am a personal voice assistant. I was created by {creador}' + instEn() + ' for this school fair. Today I will introduce myself, and show you live everything I can do.');
    } },
  { titulo: () => 'What am I?', puntos: () => ['I listen, understand and answer with my voice', 'Built with HTML, CSS and JavaScript', 'Runs in a web browser, nothing to install'],
    run: async (n) => {
      await n('I am a web page that listens, understands and answers. To hear you, I use the browser speech recognition, and to talk to you, speech synthesis. You do not need to install any program. You only need a browser.');
    } },
  { titulo: () => 'How do I work?', puntos: () => ['1. I hear your voice', '2. I understand keywords and similar phrases', '3. I act: calculate, search, show', '4. I answer with voice and screen'],
    run: async (n) => {
      await n('I work in four steps: I listen, I understand, I act, and I answer. I want to be honest with you: I am not a generative artificial intelligence. I understand many ways of saying the same thing thanks to rules and fuzzy matching designed by my creator, and I consult Wikipedia and the documents you load for me.');
    } },
  { titulo: () => 'Conversation', puntos: () => ['Free and proactive chat', 'Trivia, riddles and stories', 'Answers questions about the project'],
    run: async (n, w) => {
      await n('I like to talk with people. If it gets quiet, I suggest topics myself. Here is a fun fact: ' + sorteoEn('pd', EN_DATOS));
      await w(500);
      await n('And a joke to lighten the mood. ' + sorteoEn('pj', EN_CHISTES));
    } },
  { titulo: () => 'Mathematics', puntos: () => ['Huge operations with exact results', 'Roots, powers, percentages and factorials'],
    run: async (n) => {
      mostrarCalc('sqrt(144)');
      await n('I have a powerful calculator. For example, the square root of one hundred forty four is twelve.');
      mostrarCalc('2^100');
      await n('I can also work with giant numbers without losing precision. Two to the power of one hundred has ' + evaluar('2^100').toString().length + ' digits.');
      mostrarCalc('(15/100)*480');
      await n('And percentages: fifteen percent of four hundred eighty is seventy two.');
    } },
  { titulo: () => '3D models', puntos: () => ['I create shapes when you ask', 'Cube, sphere, cone, donut and more'],
    run: async (n, w) => {
      await n('Now, three dimensional modeling. I will create a red cube.');
      await crearModelo('crea un cubo rojo');
      if (!modelo) { await n('This demonstration needs internet, and I could not load the three D engine right now.'); return; }
      await w(2500);
      await n('And now a blue sphere.');
      await crearModelo('crea una esfera azul');
      await w(2500);
      await n('All of it, just by asking.');
    } },
  { titulo: () => 'Videos, documents and languages', puntos: () => ['Plays videos inside the page', 'Reads PDF, Word, Excel and text files', 'Speaks English and Spanish'],
    run: async (n) => {
      abrirPanel('v-docs');
      await n('I can show videos about any topic, read your documents, including PDF, Word and Excel files, and answer questions about them. I also speak English and Spanish, and I can switch languages whenever you ask.');
    } },
  { titulo: () => 'Thank you!', puntos: () => ['I am ready for your questions'],
    run: async (n) => {
      await n('Thank you very much for your attention. We learned that with only three programming languages and a lot of practice, we can build a useful and friendly tool. I am ready to answer your questions.');
    } }
];

// ---------------------------------------------------------------------
//  V8: IA / BÚSQUEDA MUNDIAL (Gemini + Google), COMPARTIR PANTALLA GUIADO,
//      CARPETA DEL PC, INSTALACIÓN COMO APP
// ---------------------------------------------------------------------
let ultimaPregunta = '';
const histIA = [];

// ----- Motor de IA -----
const MODELOS_GEMINI = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
function sistemaIA(en) {
  const hoy = new Date().toLocaleDateString(en ? 'en-US' : 'es-ES', { dateStyle: 'full' });
  const quien = cfg.usuario === 'amigo' ? '' : (en ? ' The user is called ' : ' El usuario se llama ') + cfg.usuario + '.';
  return (en
    ? 'You are ' + cfg.nombre + ', a friendly voice assistant. Answer in English in at most three short sentences, with no markdown, lists or symbols, because your answer is read aloud. Be accurate and worldwide in scope. If you are not sure, say so. Today is ' + hoy + '.'
    : 'Eres ' + cfg.nombre + ', un asistente de voz amable y culto. Responde en español en máximo tres frases cortas, sin markdown, listas ni símbolos, porque tu respuesta se lee en voz alta. Responde con precisión y con alcance mundial, no solo sobre Bolivia. Si no estás seguro, dilo. Hoy es ' + hoy + '.') + quien;
}
async function postJSON(url, cuerpo, ms) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms || 20000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: c.signal });
    const txt = await r.text();
    let d = null; try { d = JSON.parse(txt); } catch (e) {}
    if (!r.ok) { const er = new Error('http ' + r.status); er.status = r.status; er.cuerpo = d || txt; throw er; }
    return d;
  } finally { clearTimeout(id); }
}
async function geminiLlamar(contenidos, en, buscar) {
  let ultimo = null;
  for (const modelo of MODELOS_GEMINI) {
    const cuerpo = { systemInstruction: { parts: [{ text: sistemaIA(en) }] }, contents: contenidos, generationConfig: { temperature: 0.4, maxOutputTokens: 400 } };
    if (buscar) cuerpo.tools = [{ google_search: {} }];
    try {
      return await postJSON('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + enc(cfg.claveIA), cuerpo, 25000);
    } catch (e) {
      ultimo = e;
      if (buscar && e.status === 400) { // la búsqueda no está disponible: reintenta sin ella
        delete cuerpo.tools;
        try { return await postJSON('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + enc(cfg.claveIA), cuerpo, 25000); } catch (e2) { ultimo = e2; }
      }
      if (e.status === 401 || e.status === 403) break; // clave inválida
    }
  }
  throw ultimo || new Error('sin respuesta');
}
function extraerGemini(d) {
  const cand = d && d.candidates && d.candidates[0];
  if (!cand || !cand.content) return null;
  const texto = (cand.content.parts || []).map((p) => p.text || '').join(' ').replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim();
  const fuentes = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || []).map((g) => g.web).filter(Boolean).slice(0, 4).map((w) => ({ titulo: w.title || w.uri, url: w.uri }));
  return texto ? { texto, fuentes, motor: 'gemini' } : null;
}
async function libreLlamar(pregunta, en) {
  const url = 'https://text.pollinations.ai/' + enc(pregunta) + '?model=openai&system=' + enc(sistemaIA(en));
  const c = new AbortController(); const id = setTimeout(() => c.abort(), 9000);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('http');
    const t = (await r.text()).replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || /rate limit|IMPORTANT NOTICE|deprecated/i.test(t)) throw new Error('mala respuesta');
    return { texto: t, fuentes: [], motor: 'libre' };
  } finally { clearTimeout(id); }
}
function hayIA() { return !!cfg.claveIA || true; }
async function preguntarIA(pregunta, opt) {
  opt = opt || {};
  const en = !!opt.en;
  if (cfg.claveIA) {
    const contenidos = histIA.slice(-8).concat([{ role: 'user', parts: [{ text: pregunta }] }]);
    const d = await geminiLlamar(contenidos, en, opt.buscar !== false);
    const r = extraerGemini(d);
    if (!r) throw new Error('vacío');
    histIA.push({ role: 'user', parts: [{ text: pregunta }] }, { role: 'model', parts: [{ text: r.texto }] });
    return r;
  }
  return await libreLlamar(pregunta, en);
}
async function preguntarIAImagen(pregunta, base64, en) {
  if (cfg.claveIA) {
    const d = await geminiLlamar([{ role: 'user', parts: [{ text: pregunta }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }], en, false);
    const r = extraerGemini(d);
    if (!r) throw new Error('vacío');
    return r;
  }
  const d = await postJSON('https://text.pollinations.ai/openai', { model: 'openai', messages: [
    { role: 'system', content: sistemaIA(en) },
    { role: 'user', content: [{ type: 'text', text: pregunta }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }] }] }, 25000);
  const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!t) throw new Error('vacío');
  return { texto: t.replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim(), fuentes: [], motor: 'libre' };
}

function pintarRespuestaIA(q, r, en) {
  abrirPanel('v-info');
  const c = $('info');
  c.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = q;
  const p = document.createElement('p'); p.textContent = r.texto;
  c.appendChild(h); c.appendChild(p);
  (r.fuentes || []).forEach((f) => {
    const a = document.createElement('a'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'enlace-grande';
    a.textContent = '🔗 ' + (f.titulo || f.url).slice(0, 70); c.appendChild(a);
  });
  const g = document.createElement('a'); g.href = 'https://www.google.com/search?q=' + enc(q); g.target = '_blank'; g.rel = 'noopener'; g.className = 'enlace-grande';
  g.textContent = en ? '🔎 See more on Google' : '🔎 Ver más en Google'; c.appendChild(g);
  const nota = document.createElement('div'); nota.className = 'ayuda';
  nota.textContent = r.motor === 'gemini' ? 'Respuesta de Gemini con búsqueda de Google.' : 'Respuesta de una IA gratuita (sin clave). Para respuestas más precisas, agrega tu clave de Gemini en Ajustes.';
  c.appendChild(nota);
}

// Consulta mundial: IA primero, Wikipedia si falla
async function consultaMundial(pregunta, opt) {
  opt = opt || {};
  abrirPanel('v-info');
  setModo('pensando');
  $('info').textContent = opt.en ? 'Searching the web...' : 'Buscando en internet...';
  try {
    const r = await preguntarIA(pregunta, opt);
    pintarRespuestaIA(pregunta, r, opt.en);
    opt.en ? hablarEn(r.texto, pregunta) : hablar(r.texto, pregunta);
    return true;
  } catch (e) {
    return false;
  }
}
const _investigarWiki = investigar;
investigar = async function (tema, en) {
  const orig = ultimaPregunta || tema;
  const pregunta = /^(?:quien|quienes|que|cual|cuales|cuando|donde|cuanto|cuantos|cuantas|como|por que|porque|para que|who|what|when|where|which|how|why)\b/i.test(normalizar(orig)) || /\?/.test(orig);
  if (pregunta || cfg.claveIA) {
    if (await consultaMundial(orig, { en })) return;
  }
  if (pregunta && !cfg.claveIA) {
    // Sin IA: aviso honesto, Wikipedia solo da un resumen del tema
    window.__avisoWiki = true;
  }
  return _investigarWiki(tema, en);
};
async function buscarEnWeb(consulta) {
  ultimaPregunta = consulta;
  if (await consultaMundial(consulta, {})) return;
  return _investigarWiki(consulta, false);
}

// ----- Compartir pantalla guiado -----
compartirPantalla = async function () {
  abrirPanel('v-pantalla');
  $('guiaPantalla').classList.remove('oculto');
  if (streamPantalla) { hablar('Ya estás compartiendo tu pantalla.'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    hablar('Este navegador no permite compartir pantalla. Usa Google Chrome o Edge.');
    return;
  }
  try {
    streamPantalla = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', frameRate: 15 }, audio: false,
      selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include', preferCurrentTab: false
    });
    $('videoPantalla').srcObject = streamPantalla;
    $('avisoPantalla').style.display = 'none';
    $('btnPantalla').textContent = 'Dejar de compartir';
    $('btnPantalla').classList.remove('pulsar');
    $('guiaPantalla').classList.add('oculto');
    streamPantalla.getVideoTracks()[0].addEventListener('ended', () => detenerPantalla(false));
    const tipo = (streamPantalla.getVideoTracks()[0].getSettings() || {}).displaySurface;
    if (tipo === 'browser') hablar('Estás compartiendo una pestaña. Para que yo vea todo tu escritorio, deja de compartir y elige Pantalla completa.');
    else if (tipo === 'window') hablar('Estás compartiendo una ventana. Si quieres que vea todo, elige Pantalla completa. Ya puedes pedirme que lea la pantalla.');
    else hablar('Listo, estoy viendo toda tu pantalla. Puedes pedirme que lea la pantalla, o que vigile las notificaciones.');
  } catch (e) {
    streamPantalla = null;
    $('btnPantalla').classList.add('pulsar');
    if (e && e.name === 'NotAllowedError' && /gesture|activation/i.test(e.message || '')) {
      hablar('Por seguridad, el navegador exige que el clic lo des tú. Pulsa el botón que brilla, el que dice Compartir pantalla, y en la ventana que aparece elige Pantalla completa.');
    } else {
      hablar('No se compartió la pantalla. Pulsa el botón que brilla, elige Pantalla completa en la ventana que aparece y pulsa Compartir.');
    }
  }
};

// ----- Carpeta del equipo (File System Access) -----
const CARP = { handle: null, indice: [], nombre: '' };
const idb = {
  abrir() { return new Promise((res, rej) => { const q = indexedDB.open('asistente', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async get(k) { const db = await this.abrir(); return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); },
  async set(k, v) { const db = await this.abrir(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); }
};
const EXT_IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
async function indexarCarpeta() {
  CARP.indice = [];
  const ignorar = /^(node_modules|\.git|AppData|\$RECYCLE\.BIN|System Volume Information)$/i;
  async function rec(dir, ruta, prof) {
    for await (const [n, h] of dir.entries()) {
      if (CARP.indice.length >= 15000) return;
      if (h.kind === 'file') CARP.indice.push({ n, ruta: ruta + n, h, nn: normalizar(n.replace(/\.\w+$/, '')) });
      else if (prof < 5 && !ignorar.test(n) && !n.startsWith('.')) { try { await rec(h, ruta + n + '/', prof + 1); } catch (e) {} }
    }
  }
  await rec(CARP.handle, '', 0);
  $('estadoCarpeta').textContent = '📁 ' + CARP.handle.name + ' conectada · ' + CARP.indice.length + ' archivos';
}
async function elegirCarpeta() {
  if (!window.showDirectoryPicker) { hablar('Este navegador no permite conectar carpetas. Usa Google Chrome o Edge en el computador.'); return; }
  try {
    CARP.handle = await window.showDirectoryPicker({ mode: 'read' });
    CARP.nombre = CARP.handle.name;
    $('estadoCarpeta').textContent = 'Leyendo la carpeta...';
    await indexarCarpeta();
    try { await idb.set('carpeta', CARP.handle); } catch (e) {}
    hablar('Carpeta ' + CARP.nombre + ' conectada. Tengo ' + CARP.indice.length + ' archivos disponibles. Dime, por ejemplo: abre el archivo informe.');
  } catch (e) { if (e && e.name !== 'AbortError') hablar('No pude conectar la carpeta.'); }
}
async function recuperarCarpeta() {
  try {
    const h = await idb.get('carpeta');
    if (!h) return;
    CARP.handle = h; CARP.nombre = h.name;
    const permiso = await h.queryPermission({ mode: 'read' });
    if (permiso === 'granted') await indexarCarpeta();
    else $('estadoCarpeta').textContent = '📁 ' + h.name + ' (pulsa "Conectar carpeta" para reactivar el permiso)';
  } catch (e) {}
}
function buscarEnCarpeta(consulta) {
  const toks = normalizar(consulta).replace(/\b(el|la|los|las|de|del|mi|mis|un|una|archivo|documento|pdf|word|excel|hoja|imagen|foto|presentacion|llamado|llamada|que se llama)\b/g, ' ').split(/\s+/).filter((x) => x.length > 1);
  if (!toks.length) return [];
  return CARP.indice.map((f) => ({ f, pts: toks.filter((tk) => f.nn.includes(tk)).length / toks.length - f.nn.length * 0.0005 }))
    .filter((x) => x.pts >= 0.5).sort((a, b) => b.pts - a.pts).slice(0, 5).map((x) => x.f);
}
async function mostrarArchivoCarpeta(item) {
  abrirPanel('v-docs');
  const c = $('resultadosDocs'); c.innerHTML = '';
  const file = await item.h.getFile();
  const h = document.createElement('h4'); h.textContent = '📄 ' + item.ruta; c.appendChild(h);
  if (EXT_IMG.test(item.n)) {
    const img = document.createElement('img'); img.src = URL.createObjectURL(file); img.style.maxWidth = '100%'; c.appendChild(img);
    hablar('Aquí está la imagen ' + item.n.replace(/\.\w+$/, '') + '.'); return;
  }
  if (/\.pdf$/i.test(item.n)) {
    const f = document.createElement('iframe'); f.src = URL.createObjectURL(file); f.className = 'visor-pdf'; c.appendChild(f);
    try { agregarDoc(item.n, ((await leerArchivo(file)) || '').trim()); guardarDocs(); pintarDocs(); } catch (e) {}
    hablar('Abrí el PDF ' + item.n.replace(/\.\w+$/, '') + '. Si quieres, pregúntame algo sobre su contenido.'); return;
  }
  try {
    const texto = ((await leerArchivo(file)) || '').trim();
    if (!texto) throw new Error('vacío');
    agregarDoc(item.n, texto); guardarDocs(); pintarDocs();
    verDoc(docs.find((d) => d.nombre === item.n));
  } catch (e) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = item.n; a.className = 'enlace-grande';
    a.textContent = '⬇ Descargar ' + item.n; c.appendChild(a);
    hablar('No puedo mostrar este tipo de archivo aquí, pero te dejé un botón para descargarlo y abrirlo.');
  }
}
async function abrirArchivoCarpeta(consulta) {
  if (!CARP.handle) { abrirPanel('v-docs'); $('btnCarpeta').classList.add('pulsar'); hablar('Primero conecta una carpeta de tu computador. Pulsa el botón que brilla, Conectar carpeta, y elige por ejemplo Documentos. Solo lo haces una vez.'); return true; }
  if (!CARP.indice.length) { try { if ((await CARP.handle.requestPermission({ mode: 'read' })) === 'granted') await indexarCarpeta(); } catch (e) {} }
  if (!CARP.indice.length) { abrirPanel('v-docs'); hablar('Pulsa Conectar carpeta para darme permiso otra vez.'); return true; }
  const r = buscarEnCarpeta(consulta);
  if (!r.length) { hablar('No encontré ningún archivo parecido a ' + consulta + ' en la carpeta ' + CARP.nombre + '.'); return true; }
  if (r.length > 1 && normalizar(r[0].nn) !== normalizar(consulta)) {
    const nombres = r.slice(0, 3).map((x) => x.n.replace(/\.\w+$/, '')).join(', ');
    await mostrarArchivoCarpeta(r[0]);
    return true;
  }
  await mostrarArchivoCarpeta(r[0]);
  return true;
}
$('btnCarpeta').addEventListener('click', () => { $('btnCarpeta').classList.remove('pulsar'); elegirCarpeta(); });
recuperarCarpeta();

// ----- Instalar como app (PWA) -----
let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; $('btnInstalar').classList.remove('oculto'); });
window.addEventListener('appinstalled', () => { $('btnInstalar').classList.add('oculto'); hablar('Aplicación instalada. Ya puedes abrirla desde tu escritorio o el menú de inicio.'); });
function instalarApp() {
  if (eventoInstalar) { eventoInstalar.prompt(); eventoInstalar = null; return; }
  hablar('Para instalarme, abre el menú de tres puntos de Chrome y elige Guardar y compartir, Instalar página como aplicación. También aparece un icono de instalar en la barra de direcciones.');
}
$('btnInstalar').addEventListener('click', instalarApp);
if ('serviceWorker' in navigator && /^https:/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------------------------------------------------------------
//  V8: CUERPO HOLOGRÁFICO EN MOVIMIENTO (alterna con la esfera)
// ---------------------------------------------------------------------
const holo = { on: false, vistas: false, gira: true, yaw: 0, saludo: 0, saludoHasta: 0, t0: 0, fuerzaSaludo: 0 };

function anillosCilindro(p0, p1, r0, r1, n, seg) {
  const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  const a = [ax[0] / L, ax[1] / L, ax[2] / L];
  let u = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let v = cross(a, u); const lv = Math.hypot(v[0], v[1], v[2]); v = v.map((x) => x / lv);
  u = cross(v, a);
  const anillos = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1);
    const c = [p0[0] + ax[0] * k, p0[1] + ax[1] * k, p0[2] + ax[2] * k];
    const r = r0 + (r1 - r0) * k;
    const pts = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      pts.push([c[0] + r * (Math.cos(th) * u[0] + Math.sin(th) * v[0]), c[1] + r * (Math.cos(th) * u[1] + Math.sin(th) * v[1]), c[2] + r * (Math.cos(th) * u[2] + Math.sin(th) * v[2])]);
    }
    anillos.push(pts);
  }
  return anillos;
}
function anillosElipse(secciones, seg) { // [y, rx, rz, cx, cz]
  return secciones.map(([y, rx, rz, cx, cz]) => {
    const pts = [];
    for (let j = 0; j < seg; j++) { const th = (j / seg) * Math.PI * 2; pts.push([(cx || 0) + rx * Math.cos(th), y, (cz || 0) + rz * Math.sin(th)]); }
    return pts;
  });
}
function anillosEsfera(c, r, n, seg) {
  const an = [];
  for (let i = 1; i < n; i++) {
    const fi = -Math.PI / 2 + (i / n) * Math.PI;
    const rr = r * Math.cos(fi), y = c[1] + r * 1.18 * Math.sin(fi);
    const pts = [];
    for (let j = 0; j < seg; j++) { const th = (j / seg) * Math.PI * 2; pts.push([c[0] + rr * Math.cos(th), y, c[2] + rr * 0.92 * Math.sin(th)]); }
    an.push(pts);
  }
  return an;
}
const dirBrazo = (ang, lado) => [lado * Math.sin(ang), -Math.cos(ang), 0];
const sum = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];

// Construye el cuerpo (lista de partes, cada una con anillos) según el instante
function construirCuerpo(s, nivel, saludo) {
  const resp = 1 + 0.018 * Math.sin(s * 1.6) + nivel * 0.05;
  const partes = [];
  const cabeceo = nivel * 0.012 * Math.sin(s * 9);
  partes.push({ an: anillosEsfera([0, 0.77 + cabeceo, 0.01], 0.108, 9, 14), tipo: 'cabeza' });
  partes.push({ an: anillosCilindro([0, 0.665, 0], [0, 0.62, 0], 0.042, 0.05, 2, 10), tipo: 'cuello' });
  partes.push({ an: anillosElipse([
    [0.60, 0.19 * resp, 0.10 * resp], [0.52, 0.185 * resp, 0.115 * resp], [0.42, 0.155 * resp, 0.105 * resp], [0.32, 0.135 * resp, 0.095 * resp],
    [0.21, 0.145, 0.10], [0.10, 0.165, 0.11], [0.0, 0.175, 0.115]], 16), tipo: 'torso' });
  [-1, 1].forEach((lado) => {
    // piernas
    const cad = [lado * 0.085, -0.02, 0], rod = [lado * 0.095, -0.45, 0.012], tob = [lado * 0.095, -0.85, 0];
    partes.push({ an: anillosCilindro(cad, rod, 0.088, 0.058, 8, 12), tipo: 'pierna' });
    partes.push({ an: anillosCilindro(rod, tob, 0.058, 0.04, 8, 12), tipo: 'pierna' });
    partes.push({ an: anillosCilindro(tob, [lado * 0.095, -0.885, 0.11], 0.04, 0.032, 4, 8), tipo: 'pie' });
    // brazos (el derecho de la figura, lado = +1, saluda)
    const hombro = [lado * 0.205, 0.565, 0];
    let a1 = 0.16 + 0.03 * Math.sin(s * 1.6 + lado), a2 = 0.10 + 0.03 * Math.sin(s * 1.6 + lado);
    if (lado === 1) {
      a1 = a1 + (1.5 - a1) * saludo;
      a2 = a2 + (2.95 + 0.38 * Math.sin(s * 9) - a2) * saludo;
    }
    const codo = sum(hombro, dirBrazo(a1, lado), 0.29);
    const muneca = sum(codo, dirBrazo(a2, lado), 0.26);
    const mano = sum(muneca, dirBrazo(a2, lado), 0.09);
    partes.push({ an: anillosCilindro(hombro, codo, 0.05, 0.04, 6, 10), tipo: 'brazo' });
    partes.push({ an: anillosCilindro(codo, muneca, 0.04, 0.03, 6, 10), tipo: 'brazo' });
    partes.push({ an: anillosCilindro(muneca, mano, 0.034, 0.026, 3, 8), tipo: 'mano' });
  });
  return partes;
}

function dibujarCuerpo(c, cx, cy, S, yaw, s, nivel, saludo, rgb, alfa) {
  const [r, g, b] = rgb;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const camara = 3.2;
  const proy = (p) => {
    const X = p[0] * cs + p[2] * sn, Z = -p[0] * sn + p[2] * cs;
    const f = camara / (camara + Z);
    return [cx + X * S * f, cy - p[1] * S * f, Z];
  };
  const barrido = ((s * 0.35) % 1.4) * 1.9 - 0.95; // altura del barrido luminoso
  const partes = construirCuerpo(s, nivel, saludo);
  c.lineCap = 'round';
  partes.forEach((pt) => {
    const P = pt.an.map((ring) => ring.map(proy));
    P.forEach((ring, k) => {
      const yM = pt.an[k][0][1];
      const brillo = Math.max(0, 1 - Math.abs(yM - barrido) * 7);
      const zProm = ring.reduce((a, q) => a + q[2], 0) / ring.length;
      const prof = 0.55 + 0.45 * (1 - (zProm + 0.3) / 0.6);
      const al = Math.min(1, (0.30 + 0.35 * Math.max(0, Math.min(1, prof)) + brillo * 0.7 + nivel * 0.25) * alfa);
      c.strokeStyle = brillo > 0.2 ? 'rgba(230,255,255,' + al + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + al + ')';
      c.lineWidth = 0.9 + brillo * 1.6;
      c.beginPath();
      ring.forEach((q, j) => { j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
      c.closePath();
      c.stroke();
    });
    // líneas longitudinales entre anillos
    c.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + 0.22 * alfa + ')';
    c.lineWidth = 0.7;
    c.beginPath();
    for (let k = 0; k < P.length - 1; k++) {
      const n = P[k].length, paso = n >= 14 ? 2 : 1;
      for (let j = 0; j < n; j += paso) { c.moveTo(P[k][j][0], P[k][j][1]); c.lineTo(P[k + 1][j][0], P[k + 1][j][1]); }
    }
    c.stroke();
  });
}

const holoParticulas = Array.from({ length: 46 }, () => ({ x: Math.random() * 2 - 1, y: Math.random(), z: Math.random(), v: 0.05 + Math.random() * 0.12 }));

function dibujarHolo(c, x, y, s, nivel, r, g, b) {
  if (!holo.t0) holo.t0 = s;
  const ahora = performance.now();
  const objSaludo = ahora < holo.saludoHasta ? 1 : 0;
  holo.saludo += (objSaludo - holo.saludo) * 0.07;
  // giro: continuo, o de frente cuando habla
  if (holo.vistas) holo.yaw = 0;
  else if (modo === 'hablando' || ahora < holo.saludoHasta) { const dest = Math.round(holo.yaw / (Math.PI * 2)) * Math.PI * 2 + 0.35 * Math.sin(s * 0.9); holo.yaw += (dest - holo.yaw) * 0.06; }
  else if (holo.gira) holo.yaw += 0.012;
  const flick = 0.92 + 0.08 * Math.sin(s * 37) * Math.sin(s * 5.3);
  const glitch = Math.random() < 0.012 ? (Math.random() - 0.5) * 14 : 0;
  const S = H * 0.285;
  const cy = y + H * 0.04;

  // resplandor y plataforma
  const halo = c.createRadialGradient(x, cy, S * 0.1, x, cy, S * 1.5);
  halo.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.16 + nivel * 0.18) + ')');
  halo.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  c.fillStyle = halo; c.fillRect(x - S * 1.6, cy - S * 1.5, S * 3.2, S * 3);
  const pie = cy + 0.885 * S;
  for (let i = 0; i < 4; i++) {
    const fase = (s * 0.6 + i / 4) % 1;
    c.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.55 * (1 - fase)) + ')';
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(x, pie, S * (0.18 + fase * 0.5), S * (0.045 + fase * 0.12), 0, 0, Math.PI * 2); c.stroke();
  }
  // haz de luz hacia arriba
  const haz = c.createLinearGradient(0, pie, 0, pie - S * 1.9);
  haz.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.12)'); haz.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  c.fillStyle = haz; c.beginPath(); c.moveTo(x - S * 0.4, pie); c.lineTo(x + S * 0.4, pie); c.lineTo(x + S * 0.2, pie - S * 1.9); c.lineTo(x - S * 0.2, pie - S * 1.9); c.fill();

  c.save();
  c.globalCompositeOperation = 'lighter';
  c.shadowColor = cfg.color; c.shadowBlur = 8 + nivel * 18;
  if (holo.vistas) {
    const k = 0.78;
    dibujarCuerpo(c, x - S * 0.95 + glitch, cy, S * k, Math.PI / 2, s, nivel, 0, [r, g, b], 0.8 * flick);
    dibujarCuerpo(c, x + S * 0.95 + glitch, cy, S * k, -Math.PI / 2, s, nivel, 0, [r, g, b], 0.8 * flick);
    dibujarCuerpo(c, x + glitch, cy, S, 0, s, nivel, holo.saludo, [r, g, b], flick);
  } else {
    dibujarCuerpo(c, x + glitch, cy, S, holo.yaw, s, nivel, holo.saludo, [r, g, b], flick);
  }
  c.restore();

  // partículas que suben
  c.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.8)';
  holoParticulas.forEach((p) => {
    p.y -= p.v * 0.016; if (p.y < 0) { p.y = 1; p.x = Math.random() * 2 - 1; }
    c.globalAlpha = Math.min(1, p.y) * 0.6;
    c.fillRect(x + p.x * S * 0.7, pie - p.y * S * 1.8, 1.6, 1.6);
  });
  c.globalAlpha = 1;
  // líneas de escaneo
  c.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.045)';
  for (let yy = cy - S * 1.0; yy < pie; yy += 5) c.fillRect(x - S * 1.2, yy, S * 2.4, 1);
}

function ponerHolo(on, vistas) {
  holo.on = !!on; holo.vistas = !!vistas;
  $('btnHolo').classList.toggle('activo', holo.on);
  if (on) holo.saludoHasta = performance.now() + 3500;
}
function saludarHolo() { if (!holo.on) ponerHolo(true); holo.saludoHasta = performance.now() + 3500; }
$('btnHolo').addEventListener('click', () => { ponerHolo(!holo.on); hablar(holo.on ? 'Holograma activado.' : 'Volví a la esfera.'); });

function comandosHolo(t) {
  if (/(holograma|cuerpo|avatar|humano)/.test(t) && /(muestra|muestrame|activa|enciende|pon|ponme|quiero ver|modo|dame|aparece|haz)/.test(t) && !/(quita|apaga|oculta|desactiva)/.test(t)) {
    const v = /(tres vistas|3 vistas|frente y perfil|perfiles|vistas)/.test(t);
    ponerHolo(true, v);
    hablar(v ? 'Holograma con tres vistas: frente y los dos perfiles.' : 'Aquí estoy, en forma de holograma. Puedes decirme saluda, tres vistas, o vuelve a la esfera.');
    return true;
  }
  if (/(quita|apaga|oculta|desactiva|cierra|sal del).*(holograma|cuerpo|avatar)|(vuelve|volver|regresa|regresar|pon).*(esfera|pelota|bolita)|(esfera|pelota|bolita)$/.test(t)) {
    ponerHolo(false); hablar('Listo, volví a la esfera.'); return true;
  }
  if (holo.on && /(tres vistas|3 vistas|frente y perfil|todas las vistas)/.test(t)) { holo.vistas = true; hablar('Tres vistas activadas.'); return true; }
  if (holo.on && /(una vista|vista normal|solo una vista|vista unica)/.test(t)) { holo.vistas = false; hablar('Una sola vista.'); return true; }
  if (/\bsaluda(?:me|nos)?\b|\bsaludo\b|hazme un saludo|\bhola a todos\b/.test(t) && !/(como estas)/.test(t)) {
    saludarHolo(); hablar('Hola a todos, es un gusto estar aquí.'); return true;
  }
  if (holo.on && /(deja de girar|no gires|quieto|detente|para de girar|congela)/.test(t)) { holo.gira = false; hablar('Me quedo quieto.'); return true; }
  if (holo.on && /(gira|girar|da vueltas|rota)/.test(t)) { holo.gira = true; hablar('Girando.'); return true; }
  return false;
}

// ---------------------------------------------------------------------
//  V8: VISIÓN POR CÁMARA (qué haces, dedos, objetos, texto) + GESTOS
// ---------------------------------------------------------------------
const vision = { gesto: '', ultimoAvisado: '', estable: 0, avisar: false, dedos: 0, xs: [], coco: null, cargandoCoco: false };

function fotoCamara(maxAncho) {
  const v = $('video');
  if (!streamCamara || !v.videoWidth) return null;
  const k = Math.min(1, (maxAncho || 640) / v.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c;
}
async function asegurarCamara() {
  if (streamCamara && $('video').videoWidth) return true;
  if (!streamCamara) { try { await encenderCamara(); } catch (e) {} }
  for (let i = 0; i < 20 && !(streamCamara && $('video').videoWidth); i++) await new Promise((r) => setTimeout(r, 200));
  return !!(streamCamara && $('video').videoWidth);
}

// ----- Clasificación de gestos con los 21 puntos de la mano -----
function dedosExtendidos(p) {
  const arriba = (punta, pip) => p[punta].y < p[pip].y - 0.015;
  const pulgar = Math.hypot(p[4].x - p[17].x, p[4].y - p[17].y) > Math.hypot(p[3].x - p[17].x, p[3].y - p[17].y) * 1.08 && Math.hypot(p[4].x - p[5].x, p[4].y - p[5].y) > 0.07;
  return { pulgar, indice: arriba(8, 6), medio: arriba(12, 10), anular: arriba(16, 14), menique: arriba(20, 18) };
}
function clasificarGesto(p, hist) {
  const d = dedosExtendidos(p);
  const n = [d.indice, d.medio, d.anular, d.menique].filter(Boolean).length + (d.pulgar ? 1 : 0);
  vision.dedos = n;
  const cerrados = !d.indice && !d.medio && !d.anular && !d.menique;
  if (cerrados && d.pulgar && p[4].y < p[3].y && p[4].y < p[5].y) return 'pulgar arriba';
  if (cerrados && !d.pulgar) return 'puño cerrado';
  if (d.indice && d.medio && !d.anular && !d.menique) return 'símbolo de paz';
  if (d.indice && !d.medio && !d.anular && !d.menique) return 'señalando con el índice';
  if (n >= 4) {
    // ¿saluda? la muñeca/palma oscila en horizontal
    hist.push(p[9].x); while (hist.length > 18) hist.shift();
    const mn = Math.min(...hist), mx = Math.max(...hist);
    let cruces = 0; const med = (mn + mx) / 2;
    for (let i = 1; i < hist.length; i++) if ((hist[i - 1] - med) * (hist[i] - med) < 0) cruces++;
    if (hist.length >= 12 && mx - mn > 0.07 && cruces >= 3) return 'saludando';
    return 'mano abierta';
  }
  return n + ' dedos levantados';
}
// Se llama desde alResultadoManos con la mano detectada (o null)
function visionManos(p) {
  if (!p) { vision.gesto = ''; vision.estable = 0; vision.xs.length = 0; return; }
  const g = clasificarGesto(p, vision.xs);
  if (g === vision.gesto) vision.estable++; else { vision.gesto = g; vision.estable = 1; }
  if (vision.avisar && vision.estable === (g === 'mano abierta' ? 16 : 8) && g !== vision.ultimoAvisado && !hablando) {
    vision.ultimoAvisado = g;
    const frases = { 'saludando': 'Veo que me estás saludando. ¡Hola!', 'pulgar arriba': 'Un pulgar arriba. Me alegra que te guste.', 'símbolo de paz': 'Haces el símbolo de paz.', 'puño cerrado': 'Tienes el puño cerrado.', 'mano abierta': 'Muestras la mano abierta.', 'señalando con el índice': 'Estás señalando con el índice.' };
    hablar(frases[g] || ('Veo ' + g + '.'));
    if (g === 'saludando') saludarHolo();
  }
}

// ----- Objetos con COCO-SSD (sin clave) -----
const NOMBRES_COCO = { person: 'una persona', cellphone: 'un celular', 'cell phone': 'un celular', laptop: 'una laptop', book: 'un libro', cup: 'una taza', bottle: 'una botella', keyboard: 'un teclado', mouse: 'un mouse', tv: 'una pantalla', chair: 'una silla', scissors: 'unas tijeras', clock: 'un reloj', backpack: 'una mochila', 'teddy bear': 'un peluche', apple: 'una manzana', banana: 'un plátano', orange: 'una naranja', remote: 'un control remoto', 'wine glass': 'una copa', fork: 'un tenedor', knife: 'un cuchillo', spoon: 'una cuchara', bowl: 'un tazón', cat: 'un gato', dog: 'un perro', pen: 'un lápiz' };
async function cargarCoco() {
  if (vision.coco) return vision.coco;
  await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
  await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
  vision.coco = await window.cocoSsd.load();
  return vision.coco;
}
async function objetosEnCamara() {
  const c = fotoCamara(640);
  const modelo = await cargarCoco();
  return (await modelo.detect(c)).filter((o) => o.score > 0.5);
}
function listaNatural(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}

// ----- Órdenes de cámara -----
async function describirCamara(pregunta, en) {
  if (!(await asegurarCamara())) { hablar('No pude encender la cámara. Revisa el permiso del navegador y vuelve a intentarlo.'); return; }
  abrirPanel('v-camara');
  setModo('pensando');
  hablar(en ? 'Let me look.' : 'Déjame mirarte un momento.', en ? 'Looking...' : 'Mirando...');
  const c = fotoCamara(640);
  const b64 = c.toDataURL('image/jpeg', 0.7).split(',')[1];
  try {
    const p = pregunta || (en
      ? 'Describe in one or two sentences what the person in this image is doing, their posture and any visible objects. Speak directly to them ("You are...").'
      : 'Describe en una o dos frases qué está haciendo la persona de la imagen, su postura, su expresión y los objetos que se ven. Háblale directamente de tú ("Estás...").');
    const r = await preguntarIAImagen(p, b64, en);
    en ? hablarEn(r.texto) : hablar(r.texto);
    return;
  } catch (e) {}
  // Respaldo local: gestos + objetos
  try {
    let partes = [];
    const obj = await objetosEnCamara();
    const personas = obj.filter((o) => o.class === 'person').length;
    const otros = [...new Set(obj.filter((o) => o.class !== 'person').map((o) => NOMBRES_COCO[o.class] || o.class))];
    if (personas) partes.push(personas === 1 ? 'Te veo a ti' : 'Veo ' + personas + ' personas');
    if (vision.gesto) partes.push('estás ' + (vision.gesto === 'saludando' ? 'saludando' : 'mostrando ' + vision.gesto));
    if (otros.length) partes.push('y hay ' + listaNatural(otros) + ' cerca');
    hablar(partes.length ? partes.join(', ') + '.' : 'No logro ver a nadie. Acércate un poco a la cámara.');
  } catch (e) {
    hablar('No pude analizar la imagen. Necesito internet para cargar el modelo de visión.');
  }
}
async function contarDedos() {
  if (!(await asegurarCamara())) { hablar('Primero necesito encender la cámara.'); return; }
  abrirPanel('v-camara');
  if (!rastreo.activo) { const ok = await iniciarRastreo(); if (!ok) { hablar('No pude cargar el detector de manos. Necesita internet.'); return; } }
  hablar('Muéstrame tu mano frente a la cámara.');
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (vision.gesto && vision.estable >= 6) { hablar('Veo ' + vision.dedos + (vision.dedos === 1 ? ' dedo levantado.' : ' dedos levantados.') + ' Es ' + vision.gesto + '.'); return; }
  }
  hablar('No veo tu mano. Acércala un poco y ábrela hacia la cámara.');
}
async function objetosCamara() {
  if (!(await asegurarCamara())) { hablar('Primero necesito encender la cámara.'); return; }
  abrirPanel('v-camara'); setModo('pensando');
  hablar('Mirando lo que hay frente a la cámara.');
  try {
    const obj = await objetosEnCamara();
    const nombres = [...new Set(obj.map((o) => NOMBRES_COCO[o.class] || o.class))];
    hablar(nombres.length ? 'Veo ' + listaNatural(nombres) + '.' : 'No reconozco ningún objeto claro. Acércalo más a la cámara.');
  } catch (e) { hablar('No pude cargar el modelo de objetos. Necesita internet.'); }
}
async function contarPersonas() {
  if (!(await asegurarCamara())) { hablar('Primero necesito encender la cámara.'); return; }
  abrirPanel('v-camara'); setModo('pensando');
  try {
    const n = (await objetosEnCamara()).filter((o) => o.class === 'person').length;
    hablar(n === 0 ? 'No veo a nadie en la cámara.' : n === 1 ? 'Veo una persona.' : 'Veo ' + n + ' personas.');
  } catch (e) { hablar('No pude cargar el modelo de visión. Necesita internet.'); }
}
async function leerCamara() {
  if (!(await asegurarCamara())) { hablar('Primero necesito encender la cámara.'); return; }
  abrirPanel('v-camara'); setModo('pensando');
  hablar('Leyendo lo que muestras a la cámara.');
  try {
    const c = fotoCamara(1280);
    const txt = limpiarOCR(await ocrDe(c));
    hablar(txt ? 'Leo: ' + txt.slice(0, 400) : 'No logro leer texto. Acerca el papel y que haya buena luz.');
  } catch (e) { hablar('No pude cargar el lector de texto. Necesita internet.'); }
}
async function activarGestos(on) {
  vision.avisar = on;
  if (on) {
    if (!(await asegurarCamara())) { hablar('Necesito la cámara para ver tus gestos.'); vision.avisar = false; return; }
    if (!rastreo.activo) { const ok = await iniciarRastreo(); if (!ok) { hablar('No pude cargar el detector de manos. Necesita internet.'); vision.avisar = false; return; } }
    vision.ultimoAvisado = '';
    hablar('Listo. Te aviso cuando salude, levante el pulgar o haga un gesto.');
  } else hablar('Dejé de avisar los gestos.');
}

function comandosVision(t) {
  if (/(que|q)\s+(estoy\s+haciendo|hago)\b|(dime|describe|descríbeme|describeme|cuentame).*(que\s+hago|lo\s+que\s+hago|lo\s+que\s+ves|que\s+ves|como\s+me\s+ves)|\bque\s+ves\b|\bme\s+ves\b|\bmirame\b|\bobservame\b|\bdescribeme\b/.test(t)) { describirCamara(); return true; }
  if (/cuantos\s+dedos/.test(t)) { contarDedos(); return true; }
  if (/cuantas\s+personas|cuanta\s+gente/.test(t)) { contarPersonas(); return true; }
  if (/(que\s+(objeto|cosa)|que\s+tengo\s+en\s+(la\s+)?mano|que\s+sostengo|que\s+te\s+muestro)/.test(t)) { objetosCamara(); return true; }
  if (/(lee|leeme).*(esto|aqui|papel|texto|lo\s+que\s+(tengo|sostengo|te\s+muestro)|hoja|libro)/.test(t) && streamCamara) { leerCamara(); return true; }
  if (/(activa|enciende|empieza|comienza|inicia).*(deteccion de gestos|gestos|reconocer gestos)|avisame.*(gestos|cuando salude)/.test(t)) { activarGestos(true); return true; }
  if (/(desactiva|apaga|deja de|para de|detén|deten).*(gestos)/.test(t)) { activarGestos(false); return true; }
  return false;
}

// ---------------------------------------------------------------------
//  V8: MODO PC (solo cuando la página la sirve servidor.py en tu Windows)
// ---------------------------------------------------------------------
const PC = { activo: false, caps: {}, mouse: false, pendiente: null, ultMouse: 0, avisos: true };

async function pcApi(ruta, cuerpo) {
  const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asistente': window.__PC_TOKEN || '' }, body: JSON.stringify(cuerpo || {}) });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
async function pcDetectar() {
  if (!window.__PC_TOKEN || /PC_TOKEN/.test(window.__PC_TOKEN)) return;
  try {
    const d = await pcApi('/api/ping');
    if (!d || !d.ok) return;
    PC.activo = true; PC.caps = d.caps || {};
    $('version').textContent += ' · PC conectado';
    document.body.classList.add('modo-pc');
    setInterval(pcEventos, 1500);
    const q = new URLSearchParams(location.search);
    if (q.get('inicio') === 'palmas') pcDespertar(true);
  } catch (e) {}
}
function pcDespertar(deAplausos) {
  if (!escuchando) { try { iniciarReconocimiento(); } catch (e) {} }
  marcarActividad();
  if (deAplausos) {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    hablar(saludo + (cfg.usuario === 'amigo' ? '' : ', ' + cfg.usuario) + '. Escuché tus aplausos. Soy ' + cfg.nombre + ' y estoy lista. ¿Qué hacemos?');
  }
}
async function pcEventos() {
  try {
    const d = await pcApi('/api/eventos', { visible: !document.hidden });
    (d.eventos || []).forEach(pcManejarEvento);
  } catch (e) {}
}
function pcManejarEvento(ev) {
  if (ev.tipo === 'palmas') { pcDespertar(true); return; }
  if (!PC.avisos) return;
  if (ev.tipo === 'mensajes') hablar('Tienes ' + (ev.delta > 1 ? ev.delta + ' mensajes nuevos' : 'un mensaje nuevo') + ' en ' + ev.app + (ev.detalle ? '. Dice: ' + ev.detalle : '') + '.');
  else if (ev.tipo === 'notificacion') hablar('Notificación de ' + ev.app + (ev.titulo ? ': ' + ev.titulo : '') + (ev.texto ? '. ' + ev.texto : '') + '.');
  else if (ev.tipo === 'video') hablar('Estás viendo en ' + ev.plataforma + ': ' + ev.titulo + '.');
  else if (ev.tipo === 'musica') hablar('Está sonando en ' + ev.plataforma + ': ' + ev.titulo + '.');
}

// ----- Mouse real controlado con la mano -----
PC.mover = function (fx, fy) {
  const t = performance.now();
  if (t - PC.ultMouse < 35) return;
  PC.ultMouse = t;
  pcApi('/api/mouse', { accion: 'mover', x: fx, y: fy }).catch(() => {});
};
PC.clic = function (tipo) { pcApi('/api/mouse', { accion: tipo || 'clic' }).catch(() => {}); };

// ----- Órdenes -----
const CONFIRMAR = /^(?:si|sí|claro|dale|confirmo|confirmado|hazlo|adelante|ok|okay|de acuerdo)\b/;
async function pcOrden(ruta, cuerpo, ok) {
  try {
    const d = await pcApi(ruta, cuerpo);
    if (d.ok) hablar(typeof ok === 'function' ? ok(d) : ok);
    else hablar(d.mensaje || 'No pude hacerlo.');
    return d;
  } catch (e) { hablar('No pude comunicarme con el programa del computador. Revisa que Iniciar.bat siga abierto.'); return null; }
}
const NUM_PALABRAS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 };
function numeroEn(t) { const m = t.match(/(\d+)/); if (m) return +m[1]; for (const k in NUM_PALABRAS) if (new RegExp('\\b' + k + '\\b').test(t)) return NUM_PALABRAS[k]; return null; }

function pcComando(t) {
  if (!PC.activo) return false;
  let m;
  if (PC.pendiente && CONFIRMAR.test(t)) { const f = PC.pendiente; PC.pendiente = null; f(); return true; }
  if (PC.pendiente && /^(no|cancela|cancelar|mejor no|olvidalo)/.test(t)) { PC.pendiente = null; hablar('Cancelado.'); return true; }

  if (/(cancela|cancelar|anula).*(apagado|apagar|reinicio|reiniciar)/.test(t)) { pcOrden('/api/sistema', { accion: 'cancelar' }, 'Cancelé el apagado.'); return true; }
  if (/(apaga|apagar).*(computador|computadora|equipo|pc|laptop|ordenador)|(reinicia|reiniciar).*(computador|computadora|equipo|pc|laptop|ordenador)/.test(t)) {
    const rein = /reinici/.test(t);
    hablar('¿Seguro que quieres ' + (rein ? 'reiniciar' : 'apagar') + ' el computador? Di sí para confirmar.');
    PC.pendiente = () => pcOrden('/api/sistema', { accion: rein ? 'reiniciar' : 'apagar' }, 'Se ' + (rein ? 'reiniciará' : 'apagará') + ' en 30 segundos. Di cancela el apagado para detenerlo.');
    return true;
  }
  if (/(bloquea|bloquear).*(pantalla|computador|computadora|equipo|sesion|pc)|^bloquea$/.test(t)) { pcOrden('/api/sistema', { accion: 'bloquear' }, 'Bloqueando el equipo.'); return true; }
  if (/(suspende|suspender|pon a dormir|hiberna)/.test(t) && /(computador|computadora|equipo|pc|laptop)/.test(t)) { pcOrden('/api/sistema', { accion: 'suspender' }, 'Suspendiendo el equipo.'); return true; }

  if (/(captura|pantallazo|screenshot|foto de la pantalla)/.test(t)) { pcOrden('/api/captura', {}, (d) => 'Captura guardada en ' + d.carpeta + '.'); return true; }
  if (/(sube|aumenta|mas)\s+(?:el\s+)?(?:volumen|sonido)|volumen\s+(?:mas\s+)?alto/.test(t)) { pcOrden('/api/volumen', { accion: 'subir', pasos: Math.round((numeroEn(t) || 10) / 2) }, 'Subí el volumen.'); return true; }
  if (/(baja|disminuye|menos)\s+(?:el\s+)?(?:volumen|sonido)|volumen\s+(?:mas\s+)?bajo/.test(t)) { pcOrden('/api/volumen', { accion: 'bajar', pasos: Math.round((numeroEn(t) || 10) / 2) }, 'Bajé el volumen.'); return true; }
  if (/(silencia|mutea|quita el sonido|sin sonido|silenciar)/.test(t)) { pcOrden('/api/volumen', { accion: 'silenciar' }, 'Sonido silenciado.'); return true; }
  if (/(pon|ajusta|sube|baja).*volumen.*(?:al|a)\s+(\d+)/.test(t)) { const n = numeroEn(t.split('volumen')[1] || t); pcOrden('/api/volumen', { accion: 'nivel', nivel: n }, 'Volumen al ' + n + ' por ciento.'); return true; }
  if (/(que|cuanta|como).*(bateria|cpu|procesador|memoria|\bram\b|disco|espacio)|estado del (equipo|sistema|computador)|informacion del (equipo|sistema)/.test(t)) {
    pcOrden('/api/sistema', { accion: 'info' }, (d) => d.texto); return true;
  }
  if (/(que|cuales).*(programas|ventanas|aplicaciones|apps).*(abiertos|abiertas|tengo|hay)|programas abiertos|ventanas abiertas/.test(t)) {
    pcOrden('/api/ventanas', { accion: 'listar' }, (d) => d.lista.length ? 'Tienes abiertos: ' + d.lista.slice(0, 8).join(', ') + '.' : 'No veo ventanas abiertas.'); return true;
  }

  // mouse y teclado
  if (/(activa|enciende|usa|pon|modo).*(mouse real|raton real|mouse del computador|control del mouse|puntero real|mouse con la mano|mouse con mi mano|mouse con los dedos)|controla el mouse con (?:mi|la) mano/.test(t)) {
    PC.mouse = true;
    if (!pu.activo) activarPuntero(true);
    hablar('Control real del mouse activado. Mueve tu dedo índice frente a la cámara, y junta el pulgar con el índice para hacer clic. Di desactiva el mouse real para terminar.');
    return true;
  }
  if (/(desactiva|apaga|quita|deja de usar).*(mouse real|raton real|control del mouse|puntero real)/.test(t)) { PC.mouse = false; if (pu.activo) activarPuntero(false); else hablar('Mouse real desactivado.'); return true; }
  if (/\bdoble clic\b|\bdoble click\b/.test(t)) { PC.clic('doble'); hablar('Doble clic.'); return true; }
  if (/clic derecho|click derecho/.test(t)) { PC.clic('derecho'); hablar('Clic derecho.'); return true; }
  if (/^(?:haz|da|hacer|dame)?\s*(?:un\s+)?(?:clic|click)$/.test(t) && PC.activo) { PC.clic('clic'); hablar('Clic.'); return true; }
  m = t.match(/mueve el (?:mouse|raton|cursor) (?:hacia )?(arriba|abajo|izquierda|derecha)(?: (\d+))?/);
  if (m) { pcApi('/api/mouse', { accion: 'relativo', dir: m[1], px: +(m[2] || 150) }).catch(() => {}); hablar('Listo.'); return true; }
  m = t.match(/^(?:escribe|teclea|digita)\s+(.+)/);
  if (m) { pcOrden('/api/teclado', { accion: 'escribir', texto: textoOriginalPC(m[1]) }, 'Escrito.'); return true; }
  m = t.match(/^(?:presiona|pulsa|oprime|aprieta)\s+(?:la tecla\s+)?(enter|intro|escape|esc|tabulador|tab|espacio|borrar|suprimir|flecha arriba|flecha abajo|flecha izquierda|flecha derecha|windows|f5|f11)\b/);
  if (m) { pcOrden('/api/teclado', { accion: 'tecla', tecla: m[1] }, 'Hecho.'); return true; }
  const ATAJOS = [[/^(?:copia|copiar)$/, 'copiar'], [/^(?:pega|pegar)$/, 'pegar'], [/^(?:corta|cortar)$/, 'cortar'], [/^(?:guarda|guardar)$/, 'guardar'], [/^(?:deshaz|deshacer)$/, 'deshacer'], [/^(?:selecciona todo|seleccionar todo)$/, 'todo'],
    [/(minimiza|minimizar) todo|muestra el escritorio|ve al escritorio/, 'escritorio'], [/(cambia|cambiar|pasa) de (ventana|programa)|siguiente ventana/, 'alttab'], [/cierra (esta|la) ventana|cerrar (esta|la) ventana/, 'cerrarventana'], [/(nueva pestana)/, 'nuevapestana'], [/(cierra|cerrar) (esta|la) pestana/, 'cerrarpestana'], [/(maximiza|maximizar) (esta|la)? ?ventana/, 'maximizar']];
  for (const [re, a] of ATAJOS) if (re.test(t)) { pcOrden('/api/teclado', { accion: 'atajo', atajo: a }, 'Hecho.'); return true; }
  m = t.match(/^(?:baja|desplaza hacia abajo|scroll abajo)$/); if (m) { pcApi('/api/mouse', { accion: 'scroll', cantidad: -600 }); return true; }
  m = t.match(/^(?:sube|desplaza hacia arriba|scroll arriba)$/); if (m) { pcApi('/api/mouse', { accion: 'scroll', cantidad: 600 }); return true; }

  // cerrar / enfocar
  m = t.match(/^(?:cierra|cerrar|termina)\s+(?:el|la|los|las)?\s*(.+)/);
  if (m && !/(video|panel|ventana flotante|todo|todos|presentacion|camara|pantalla|modelo|programas)/.test(m[1])) { pcOrden('/api/ventanas', { accion: 'cerrar', nombre: m[1].trim(), excluir: cfg.nombre }, (d) => 'Cerré ' + d.cerradas + (d.cerradas === 1 ? ' ventana' : ' ventanas') + ' de ' + m[1].trim() + '.'); return true; }
  m = t.match(/^(?:ve a|cambia a|trae|muestra|enfoca|pasa a)\s+(?:el|la)?\s*(?:ventana de\s+)?(.+)/);
  if (m && /(ventana|programa)/.test(t) || (m && /^(excel|word|chrome|spotify|whatsapp|teams|vscode|visual studio code|explorador|powerpoint)$/.test(m[1].trim()))) { pcOrden('/api/ventanas', { accion: 'enfocar', nombre: m[1].replace(/^ventana de\s+/, '').trim() }, 'Aquí está.'); return true; }

  // abrir carpetas, archivos y programas
  m = t.match(/(?:abre|abrir|ve a|muestra|muestrame)\s+(?:(?:el|la|mi|mis|los|las)\s+)*(escritorio|descargas|documentos|imagenes|fotos|musica|videos|carpeta de descargas|carpeta de documentos)\b/);
  if (m && !/(archivo|documento)\s+\w/.test(t)) { pcOrden('/api/carpeta', { nombre: m[1] }, 'Abrí ' + m[1] + '.'); return true; }
  m = t.match(/(?:abre|abrir|busca|buscame|ensename|muestra|muestrame|encuentra|trae|lee|leeme)\s+(?:(?:el|la|mi|un|una)\s+)*(?:(?:archivo|documento|pdf|word|excel|hoja de calculo|presentacion|powerpoint|foto|imagen|carpeta|video|cancion)\s+(?:de\s+|llamad[oa]\s+|que se llama\s+)?)(.+)/);
  if (m) {
    pcBuscarYAbrir(m[1].trim(), /(carpeta)/.test(t), /^(?:lee|leeme)\b/.test(t));
    return true;
  }
  m = t.match(/^(?:abre|abrir|ejecuta|inicia|lanza|arranca|enciende)\s+(?:(?:el|la|los|las|mi|un|una)\s+)*(.+)/);
  if (m) {
    const n = m[1].trim();
    if (/^(youtube|google|wikipedia|gmail|maps|mapas|github|drive|traductor|panel|camara|modelo|casa|programas|documentos|comandos|videos)$/.test(n)) return false; // lo maneja el resto
    if (/^(notas|calculadora|reloj|temporizador|casa|3d)$/.test(n)) return false;
    pcOrden('/api/abrir', { nombre: n }, (d) => 'Abriendo ' + (d.nombre || n) + '.');
    return true;
  }
  return false;
}
const textoOriginalPC = (x) => x; // el servidor decide cómo escribir (acentos incluidos)
async function pcBuscarYAbrir(consulta, soloCarpeta, leer) {
  hablar('Buscando ' + consulta + ' en tu computador.');
  try {
    const d = await pcApi('/api/archivo', { consulta, carpeta: soloCarpeta, abrir: !leer });
    if (!d.ok) { hablar(d.mensaje || 'No encontré nada parecido a ' + consulta + '.'); return; }
    const nom = d.abierto.replace(/\.\w+$/, '');
    if (leer && d.texto) { agregarDoc(d.abierto, d.texto); pintarDocs(); verDoc(docs.find((x) => x.nombre === d.abierto)); return; }
    const otros = (d.otros || []).slice(0, 2).map((x) => x.replace(/\.\w+$/, ''));
    hablar('Abrí ' + nom + '.' + (otros.length ? ' También encontré ' + otros.join(' y ') + ', por si querías otro.' : ''));
  } catch (e) { hablar('No pude buscar archivos. Revisa que el programa del computador siga abierto.'); }
}
pcDetectar();

aplicarConfig();
cargarVoces();
setModo('reposo');
cargarDocsGuardados();
pintarDocs();
construirLanzador();
construirComandos();