/**
 * notas.js — Configuración de la evaluación. Fase 4.
 *
 * Dos partes bien separadas:
 *   A) FUNCIONES PURAS de validación: reciben texto y devuelven un resultado.
 *      No tocan el DOM, así que se pueden probar desde la consola.
 *   B) CONTROLADOR DEL FORMULARIO: genera las filas a partir de <template>,
 *      escucha la escritura y pinta errores, la suma y el estado del botón.
 *
 * Specs: HU-04, HU-05, HU-06, HU-08, §2.3 (validaciones) y EC-04 a EC-09.
 */

import { mostrarErrorCampo, limpiarErrorCampo } from './ui.js';

/* ==========================================================================
   A) FUNCIONES PURAS
   ========================================================================== */

export const MENSAJES = Object.freeze({
  cantidad: 'Ingresa un número entero entre 1 y 20.',
  vacio: 'Completa este campo con un número.',
  nota: 'La nota debe estar entre 0.0 y 5.0.',
  porcentaje: 'El porcentaje debe estar entre 0.01 y 100.',
  decimales: 'Usa máximo 2 decimales.',
  revisar: 'Revisa los campos marcados antes de calcular.',
  confirmarRegenerar: 'Se borrarán las notas que ya escribiste. ¿Deseas continuar?',
});

const MIN_NOTAS = 1;
const MAX_NOTAS = 20;

/** 100 % expresado en centésimas: comparamos ENTEROS, no decimales (§2.3). */
const CENTESIMAS_OBJETIVO = 10000;

/**
 * Número decimal "normal": signo opcional, dígitos y punto decimal opcional.
 * Rechaza a propósito: "", "e", "1e2", "Infinity", "4,5" como texto, "--1".
 * (Number("1e2") daría 100 y Number("") daría 0: por eso no basta Number()).
 */
const PATRON_NUMERO = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Convierte texto en número SOLO si tiene forma de número decimal.
 * @param {string} texto
 * @returns {{ valor: number, decimales: number } | null}
 */
function interpretarNumero(texto) {
  const limpio = String(texto ?? '').trim();
  if (!PATRON_NUMERO.test(limpio)) return null;

  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;

  const decimales = (limpio.split('.')[1] ?? '').length;
  // `+ 0` convierte -0 en 0 (por si alguien escribe "-0").
  return { valor: valor + 0, decimales };
}

/**
 * HU-04 / EC-04: entero entre 1 y 20. Rechaza 0, -2, 2.5, "", 21.
 * @param {string} texto
 */
export function validarCantidad(texto) {
  const limpio = String(texto ?? '').trim();
  if (!/^\d+$/.test(limpio)) return { ok: false, mensaje: MENSAJES.cantidad };

  const cantidad = Number(limpio);
  if (cantidad < MIN_NOTAS || cantidad > MAX_NOTAS) {
    return { ok: false, mensaje: MENSAJES.cantidad };
  }
  return { ok: true, valor: cantidad };
}

/**
 * RN-02 / FA-02 / EC-06: 0.0 ≤ nota ≤ 5.0, máximo 2 decimales.
 * El orden de las reglas define qué mensaje ve primero el estudiante.
 * @param {string} texto
 */
export function validarNota(texto) {
  const numero = interpretarNumero(texto);
  if (!numero) return { ok: false, mensaje: MENSAJES.vacio }; // FA-03
  if (numero.valor < 0 || numero.valor > 5) return { ok: false, mensaje: MENSAJES.nota };
  if (numero.decimales > 2) return { ok: false, mensaje: MENSAJES.decimales };
  return { ok: true, valor: numero.valor };
}

/**
 * RN-03 / EC-07: 0 < porcentaje ≤ 100, máximo 2 decimales.
 * @param {string} texto
 */
export function validarPorcentaje(texto) {
  const numero = interpretarNumero(texto);
  if (!numero) return { ok: false, mensaje: MENSAJES.vacio };
  if (numero.valor <= 0 || numero.valor > 100) return { ok: false, mensaje: MENSAJES.porcentaje };
  if (numero.decimales > 2) return { ok: false, mensaje: MENSAJES.decimales };
  return { ok: true, valor: numero.valor };
}

/**
 * Suma en CENTÉSIMAS enteras. En decimales, 0.1 + 0.2 = 0.30000000000000004;
 * en enteros, 10 + 20 = 30 exacto. Como ya exigimos máx. 2 decimales,
 * Math.round(p * 100) siempre da el entero correcto.
 * @param {number[]} porcentajes
 */
export function sumarCentesimas(porcentajes) {
  return porcentajes.reduce((total, p) => total + Math.round(p * 100), 0);
}

/** 8500 → "85", 9999 → "99.99", 1 → "0.01". */
const formatear = (centesimas) => String(centesimas / 100);

/**
 * Texto del indicador en vivo (HU-06) y mensaje de alerta (FA-01).
 * @param {number} centesimas
 * @returns {{ completa: boolean, texto: string, alerta: string }}
 */
export function describirSuma(centesimas) {
  const diferencia = CENTESIMAS_OBJETIVO - centesimas;
  const suma = formatear(centesimas);

  if (diferencia === 0) {
    return { completa: true, texto: `Suma: ${suma}% ✔`, alerta: '' };
  }
  if (diferencia > 0) {
    const falta = formatear(diferencia);
    return { completa: false, texto: `Suma: ${suma}% — faltan ${falta}%`, alerta: `Faltan ${falta}%` };
  }
  const sobra = formatear(-diferencia);
  return { completa: false, texto: `Suma: ${suma}% — sobran ${sobra}%`, alerta: `Sobran ${sobra}%` };
}

/* ==========================================================================
   B) CONTROLADOR DEL FORMULARIO (DOM)
   ========================================================================== */

const formCantidad = document.getElementById('form-cantidad');
const inputCantidad = document.getElementById('cantidad-notas');
const errorCantidad = document.getElementById('error-cantidad');
const formNotas = document.getElementById('form-notas');
const contenedor = document.getElementById('contenedor-notas');
const indicadorSuma = document.getElementById('suma-porcentajes');
const btnCalcular = document.getElementById('btn-calcular');
const plantilla = document.getElementById('plantilla-fila-nota');

let inicializado = false;

/**
 * Texto de un input numérico. Si el navegador no pudo interpretarlo
 * (validity.badInput, p. ej. "4,5" en algunos navegadores o "e"), `value`
 * llega vacío; lo tratamos igual que vacío → "Completa este campo…" (EC-09).
 */
function textoDe(input) {
  return input.validity.badInput ? '' : input.value;
}

/** Cada input sabe qué es gracias a data-rol (puesto en la plantilla). */
function validadorDe(input) {
  return input.dataset.rol === 'valor' ? validarNota : validarPorcentaje;
}

/** El párrafo de error es el referenciado por aria-describedby. */
function errorDe(input) {
  return document.getElementById(input.getAttribute('aria-describedby'));
}

function camposDeNotas() {
  return [...contenedor.querySelectorAll('input')];
}

/**
 * Valida un campo y, si se pide, pinta o limpia su error.
 * @param {HTMLInputElement} input
 * @param {{ mostrar?: boolean }} opciones
 */
function validarCampo(input, { mostrar = true } = {}) {
  const resultado = validadorDe(input)(textoDe(input));
  if (mostrar) {
    if (resultado.ok) limpiarErrorCampo(input, errorDe(input));
    else mostrarErrorCampo(input, errorDe(input), resultado.mensaje);
  }
  return resultado;
}

/**
 * Recalcula la suma y decide si Calcular se habilita.
 * Revisa TODOS los campos (sin pintar errores en los que la persona aún no
 * ha tocado): un campo vacío no muestra mensaje, pero sí bloquea el botón.
 */
function actualizarEstadoFormulario() {
  let todosValidos = true;
  const porcentajesValidos = [];

  for (const input of camposDeNotas()) {
    const resultado = validarCampo(input, { mostrar: false });
    if (!resultado.ok) todosValidos = false;
    else if (input.dataset.rol === 'porcentaje') porcentajesValidos.push(resultado.valor);
  }

  const suma = describirSuma(sumarCentesimas(porcentajesValidos));
  indicadorSuma.textContent = suma.texto;
  // El color acompaña al texto ("faltan", "sobran", "✔"), nunca lo reemplaza.
  indicadorSuma.classList.toggle('suma--ok', suma.completa);
  indicadorSuma.classList.toggle('suma--error', !suma.completa);

  btnCalcular.disabled = !(todosValidos && suma.completa);
}

/** Asigna ids únicos y enlaza label → input → mensaje de error. */
function configurarCampo(fila, rol, numero) {
  const input = fila.querySelector(`input[data-rol="${rol}"]`);
  const label = fila.querySelector(`[data-rol="label-${rol}"]`);
  const error = fila.querySelector(`[data-rol="error-${rol}"]`);

  input.id = `${rol}-${numero}`;
  error.id = `error-${rol}-${numero}`;
  label.htmlFor = input.id; // equivale a <label for="valor-1">
  input.setAttribute('aria-describedby', error.id);
}

/**
 * Crea N filas clonando la plantilla. Se arman en un DocumentFragment
 * (fuera de la página) y se insertan de una sola vez: el navegador
 * recalcula el diseño una vez, no N veces.
 * @param {number} cantidad
 */
function generarFilas(cantidad) {
  const fragmento = document.createDocumentFragment();

  for (let numero = 1; numero <= cantidad; numero++) {
    const fila = plantilla.content.cloneNode(true);
    fila.querySelector('[data-rol="numero"]').textContent = String(numero);
    configurarCampo(fila, 'valor', numero);
    configurarCampo(fila, 'porcentaje', numero);
    fragmento.append(fila);
  }

  // replaceChildren elimina las filas anteriores y sus valores (EC-05).
  contenedor.replaceChildren(fragmento);
  formNotas.hidden = false;
  actualizarEstadoFormulario();
  contenedor.querySelector('input')?.focus();
}

function hayDatosIngresados() {
  return camposDeNotas().some((input) => input.value !== '' || input.validity.badInput);
}

/* ----------------------------- Manejadores ------------------------------ */

function manejarGenerar(evento) {
  evento.preventDefault();

  const resultado = validarCantidad(textoDe(inputCantidad));
  if (!resultado.ok) {
    // EC-04: no se generan campos; las filas existentes no se tocan.
    mostrarErrorCampo(inputCantidad, errorCantidad, resultado.mensaje);
    inputCantidad.focus();
    return;
  }
  limpiarErrorCampo(inputCantidad, errorCantidad);

  // EC-05: confirmar antes de borrar lo que ya se escribió.
  if (hayDatosIngresados() && !window.confirm(MENSAJES.confirmarRegenerar)) {
    // Si cancela, dejamos la cantidad coherente con las filas visibles.
    inputCantidad.value = String(contenedor.querySelectorAll('.fila-nota').length);
    return;
  }

  generarFilas(resultado.valor);
}

/** Igual que en el documento: si ya está marcado, quitar el error al corregir. */
function manejarEscrituraCantidad() {
  if (!inputCantidad.classList.contains('invalido')) return;
  const resultado = validarCantidad(textoDe(inputCantidad));
  if (resultado.ok) limpiarErrorCampo(inputCantidad, errorCantidad);
  else mostrarErrorCampo(inputCantidad, errorCantidad, resultado.mensaje);
}

/**
 * DELEGACIÓN DE EVENTOS: un solo listener en el contenedor atiende a todas
 * las filas, incluso las que se creen después. El evento `input` "burbujea"
 * desde el campo hasta el contenedor, y event.target dice cuál fue.
 */
function manejarEscrituraNotas(evento) {
  if (!(evento.target instanceof HTMLInputElement)) return;
  validarCampo(evento.target); // error del campo en tiempo real
  actualizarEstadoFormulario(); // suma + botón en tiempo real
}

/**
 * Al salir de un campo (focusout sí burbujea; blur no) se muestra su error,
 * incluido "Completa este campo…" si se dejó vacío.
 */
function manejarSalidaDeCampo(evento) {
  if (!(evento.target instanceof HTMLInputElement)) return;
  validarCampo(evento.target);
}

/* ------------------------------ API pública ----------------------------- */

/**
 * Conecta los eventos una sola vez.
 * @param {{ alCalcular?: () => void }} opciones  Lo usará la Fase 5.
 */
export function inicializarConfiguracion({ alCalcular } = {}) {
  if (inicializado) return;
  inicializado = true;

  formCantidad.addEventListener('submit', manejarGenerar);
  inputCantidad.addEventListener('input', manejarEscrituraCantidad);
  contenedor.addEventListener('input', manejarEscrituraNotas);
  contenedor.addEventListener('focusout', manejarSalidaDeCampo);

  formNotas.addEventListener('submit', (evento) => {
    evento.preventDefault(); // sin esto, Enter en un campo recargaría la página
    if (typeof alCalcular === 'function') alCalcular();
  });
}

/**
 * Validación DEFENSIVA completa (§2.3: "no basta con el atributo disabled").
 * Revisa y pinta TODOS los campos, comprueba la suma y devuelve las notas
 * listas para calcular, en el orden ingresado.
 * @returns {{ ok: true, notas: Array<{valor: number, porcentaje: number}> }
 *         | { ok: false, mensaje: string }}
 */
export function obtenerNotasValidadas() {
  const filas = [...contenedor.querySelectorAll('.fila-nota')];
  if (filas.length === 0) return { ok: false, mensaje: MENSAJES.cantidad };

  const notas = [];
  let primerInvalido = null;

  for (const fila of filas) {
    const inputValor = fila.querySelector('input[data-rol="valor"]');
    const inputPorcentaje = fila.querySelector('input[data-rol="porcentaje"]');
    const valor = validarCampo(inputValor);
    const porcentaje = validarCampo(inputPorcentaje);

    if (!valor.ok) primerInvalido ??= inputValor;
    if (!porcentaje.ok) primerInvalido ??= inputPorcentaje;
    if (valor.ok && porcentaje.ok) notas.push({ valor: valor.valor, porcentaje: porcentaje.valor });
  }

  actualizarEstadoFormulario();

  if (primerInvalido) {
    primerInvalido.focus();
    return { ok: false, mensaje: MENSAJES.revisar };
  }

  const suma = describirSuma(sumarCentesimas(notas.map((n) => n.porcentaje)));
  if (!suma.completa) return { ok: false, mensaje: suma.alerta };

  return { ok: true, notas };
}

/**
 * Deja la configuración como nueva. Se usa al cerrar sesión (para que el
 * siguiente estudiante en el mismo equipo no vea datos ajenos) y en la
 * Fase 5 con "Nuevo cálculo".
 */
export function reiniciarConfiguracion() {
  formCantidad.reset();
  limpiarErrorCampo(inputCantidad, errorCantidad);
  contenedor.replaceChildren();
  formNotas.hidden = true;
  indicadorSuma.textContent = '';
  indicadorSuma.classList.remove('suma--ok', 'suma--error');
  btnCalcular.disabled = true;
}
