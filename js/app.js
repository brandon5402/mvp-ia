/**
 * app.js — Punto de entrada de la aplicación (ES Module).
 *
 * Su responsabilidad es ORQUESTAR (no implementar) los módulos:
 *   - db.js       → Fase 2: conexión a IndexedDB y API de datos.              ✔
 *   - auth.js     → Fase 3: registro / inicio / cierre de sesión.             ✔
 *   - ui.js       → Fases 3 y 5: vistas, alertas, errores, resultado, historial. ✔
 *   - notas.js    → Fase 4: generación de filas y validaciones en tiempo real. ✔
 *   - calculo.js  → Fase 5: promedio ponderado y estado académico.           ✔
 */

import {
  abrirDB,
  ErrorAlmacenamiento,
  MENSAJE_SIN_ALMACENAMIENTO,
  guardarCalculo,
  listarCalculos,
} from './db.js';
import { validarDocumento, iniciarSesion, restaurarSesion, cerrarSesion } from './auth.js';
import {
  mostrarEstado,
  mostrarAlerta,
  ocultarAlerta,
  mostrarErrorCampo,
  limpiarErrorCampo,
  pintarResultado,
  pintarHistorial,
} from './ui.js';
import {
  inicializarConfiguracion,
  reiniciarConfiguracion,
  obtenerNotasValidadas,
} from './notas.js';
import { construirCalculo } from './calculo.js';

/* --------------------------------------------------------------------------
   Referencias al DOM (se buscan una sola vez)
   -------------------------------------------------------------------------- */
const formAcceso = document.getElementById('form-acceso');
const inputDocumento = document.getElementById('documento');
const errorDocumento = document.getElementById('error-documento');
const btnIngresar = document.getElementById('btn-ingresar');
const btnSalir = document.getElementById('btn-salir');
const documentoActivo = document.getElementById('documento-activo');
const inputCantidad = document.getElementById('cantidad-notas');
const formNotas = document.getElementById('form-notas');
const btnCalcular = document.getElementById('btn-calcular');
const btnNuevo = document.getElementById('btn-nuevo');
const tituloResultado = document.getElementById('titulo-resultado');

/* --------------------------------------------------------------------------
   Estado de la aplicación
   -------------------------------------------------------------------------- */

/** Documento de la sesión activa (null = nadie ha ingresado). */
let documentoSesion = null;

/** Candados contra doble envío (EC-12). */
let procesandoAcceso = false;
let procesandoCalculo = false;

/* --------------------------------------------------------------------------
   Historial
   -------------------------------------------------------------------------- */

/**
 * Carga y pinta el historial del documento ACTIVO (EC-16).
 *
 * Problema de carrera que evitamos: si A cierra sesión y B entra mientras
 * la consulta de A todavía está en curso, la respuesta de A llegaría tarde
 * y se pintaría en la pantalla de B. Por eso, al recibir la respuesta,
 * comprobamos que la sesión siga siendo la misma que hizo la petición.
 */
async function refrescarHistorial() {
  const documentoConsultado = documentoSesion;
  if (!documentoConsultado) return;

  try {
    const calculos = await listarCalculos(documentoConsultado);
    if (documentoConsultado !== documentoSesion) return; // respuesta obsoleta
    pintarHistorial(calculos);
  } catch (error) {
    if (documentoConsultado !== documentoSesion) return;
    pintarHistorial([], { error: true });
    console.error('[app] No se pudo cargar el historial:', error);
  }
}

/* --------------------------------------------------------------------------
   Transiciones de estado
   -------------------------------------------------------------------------- */

/**
 * Transición A → B (y restauración al recargar: EC-01, EC-02).
 * @param {string} documento
 * @param {{ enfocar?: boolean }} opciones
 */
function entrarAlPanel(documento, { enfocar = true } = {}) {
  documentoSesion = documento;
  documentoActivo.textContent = documento;
  formAcceso.reset();
  limpiarErrorCampo(inputDocumento, errorDocumento);
  mostrarEstado('configuracion');
  refrescarHistorial(); // no se espera: el panel aparece ya y la lista llega después
  if (enfocar) inputCantidad.focus();
}

/** Transición B/C → A (HU-10). */
function salirAlAcceso() {
  cerrarSesion();
  documentoSesion = null;
  // Equipo compartido: el siguiente estudiante no debe ver datos ajenos.
  reiniciarConfiguracion();
  pintarHistorial([]);
  documentoActivo.textContent = '';
  mostrarEstado('acceso');
  inputDocumento.focus();
}

/** Transición C → B: limpia el formulario y conserva la sesión. */
function nuevoCalculo() {
  reiniciarConfiguracion();
  mostrarEstado('configuracion');
  inputCantidad.focus();
}

/** EC-13: sin almacenamiento la app no continúa. */
function bloquearPorAlmacenamiento(error) {
  mostrarEstado('acceso');
  inputDocumento.disabled = true;
  btnIngresar.disabled = true;
  mostrarAlerta(MENSAJE_SIN_ALMACENAMIENTO);
  console.error('[app] Almacenamiento no disponible:', error?.cause ?? error);
}

/* --------------------------------------------------------------------------
   Manejadores de eventos
   -------------------------------------------------------------------------- */

/** Envío del formulario de acceso (clic en "Ingresar" o Enter). */
async function manejarIngreso(evento) {
  evento.preventDefault();
  if (procesandoAcceso) return;

  const validacion = validarDocumento(inputDocumento.value);
  if (!validacion.ok) {
    mostrarErrorCampo(inputDocumento, errorDocumento, validacion.mensaje);
    inputDocumento.focus();
    return;
  }
  limpiarErrorCampo(inputDocumento, errorDocumento);

  procesandoAcceso = true;
  btnIngresar.disabled = true;
  btnIngresar.textContent = 'Ingresando…';

  try {
    const { usuario } = await iniciarSesion(validacion.documento);
    entrarAlPanel(usuario.documento);
  } catch (error) {
    if (error instanceof ErrorAlmacenamiento) {
      bloquearPorAlmacenamiento(error);
      return;
    }
    mostrarAlerta('No se pudo iniciar sesión. Intenta de nuevo.');
    console.error('[app] Error al iniciar sesión:', error);
  } finally {
    procesandoAcceso = false;
    if (!inputDocumento.disabled) btnIngresar.disabled = false;
    btnIngresar.textContent = 'Ingresar';
  }
}

/** Revalida el documento en vivo solo si ya estaba marcado como inválido. */
function manejarEscrituraDocumento() {
  if (!inputDocumento.classList.contains('invalido')) return;
  const validacion = validarDocumento(inputDocumento.value);
  if (validacion.ok) limpiarErrorCampo(inputDocumento, errorDocumento);
  else mostrarErrorCampo(inputDocumento, errorDocumento, validacion.mensaje);
}

/**
 * Transición B → C. La llama notas.js cuando se envía el formulario de notas.
 * Orden: validar → calcular → guardar → mostrar → refrescar historial.
 */
async function manejarCalculo() {
  if (procesandoCalculo || !documentoSesion) return; // EC-12

  // Validación defensiva: no basta con que el botón estuviera habilitado.
  const validacion = obtenerNotasValidadas();
  if (!validacion.ok) {
    mostrarAlerta(validacion.mensaje); // p. ej. "Sobran 10%" (FA-01)
    return;
  }

  procesandoCalculo = true;
  btnCalcular.disabled = true;
  btnCalcular.textContent = 'Calculando…';

  try {
    const calculo = construirCalculo(documentoSesion, validacion.notas);

    // EC-14: si falla el guardado, el resultado se muestra igual, con aviso.
    let guardado = true;
    try {
      await guardarCalculo(calculo);
    } catch (error) {
      guardado = false;
      console.error('[app] No se pudo guardar el cálculo:', error);
    }

    pintarResultado(calculo, { guardado });
    mostrarEstado('resultado');
    // El foco va al título: el lector de pantalla anuncia "Resultado".
    tituloResultado.focus();

    if (guardado) await refrescarHistorial();
  } catch (error) {
    // Solo llegaría aquí por un error inesperado en el cálculo.
    mostrarAlerta('No se pudo calcular la nota. Revisa los datos e intenta de nuevo.');
    console.error('[app] Error al calcular:', error);
  } finally {
    procesandoCalculo = false;
    btnCalcular.textContent = 'Calcular nota definitiva';
  }
}

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */

async function iniciar() {
  formAcceso.addEventListener('submit', manejarIngreso);
  inputDocumento.addEventListener('input', manejarEscrituraDocumento);
  btnSalir.addEventListener('click', salirAlAcceso);
  btnNuevo.addEventListener('click', nuevoCalculo);

  inicializarConfiguracion({ alCalcular: manejarCalculo });
  // Si había una alerta (p. ej. "Faltan 15%"), desaparece en cuanto se corrige algo.
  formNotas.addEventListener('input', ocultarAlerta);

  try {
    await abrirDB();
  } catch (error) {
    bloquearPorAlmacenamiento(error);
    return;
  }

  // Transición 5 del contrato: ¿hay sesión válida al cargar?
  try {
    const usuario = await restaurarSesion();
    if (usuario) entrarAlPanel(usuario.documento, { enfocar: false });
    else mostrarEstado('acceso');
  } catch (error) {
    if (error instanceof ErrorAlmacenamiento) {
      bloquearPorAlmacenamiento(error);
      return;
    }
    cerrarSesion();
    mostrarEstado('acceso');
    console.error('[app] No se pudo restaurar la sesión:', error);
  }
}

iniciar();
