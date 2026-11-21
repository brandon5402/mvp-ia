/**
 * ui.js — Utilidades de interfaz compartidas por todas las fases.
 *
 * Centraliza el contrato de UI (specs §2.2): qué vista se ve en cada estado,
 * cómo se muestra la alerta global y cómo se marca un campo inválido.
 * Si mañana cambia el diseño, se toca este archivo y no la lógica.
 *
 * Al ser un módulo (ejecución diferida), el HTML ya está cargado cuando este
 * código corre, por eso podemos buscar los elementos al importar.
 */

const vistas = {
  acceso: document.getElementById('vista-acceso'),
  panel: document.getElementById('vista-panel'),
  configuracion: document.getElementById('vista-configuracion'),
  resultado: document.getElementById('vista-resultado'),
};

const alerta = document.getElementById('alerta');

/** Estados del contrato: A = acceso, B = configuracion, C = resultado. */
const ESTADOS = ['acceso', 'configuracion', 'resultado'];

/**
 * Muestra UN estado y oculta los demás usando el atributo `hidden`.
 * El historial vive dentro del panel, así que se ve en B y C automáticamente.
 * @param {'acceso' | 'configuracion' | 'resultado'} estado
 */
export function mostrarEstado(estado) {
  if (!ESTADOS.includes(estado)) {
    throw new Error(`Estado de UI desconocido: ${estado}`);
  }
  const enPanel = estado !== 'acceso';

  vistas.acceso.hidden = enPanel;
  vistas.panel.hidden = !enPanel;
  vistas.configuracion.hidden = estado !== 'configuracion';
  vistas.resultado.hidden = estado !== 'resultado';

  // Cada transición empieza sin alertas viejas.
  ocultarAlerta();
}

/**
 * Alerta global (role="alert"). Se vacía antes de escribir para que, si el
 * mensaje es el mismo que antes, el lector de pantalla lo anuncie de nuevo.
 * @param {string} mensaje
 */
export function mostrarAlerta(mensaje) {
  alerta.textContent = '';
  alerta.hidden = false;
  alerta.textContent = mensaje;
}

export function ocultarAlerta() {
  alerta.textContent = '';
  alerta.hidden = true;
}

/**
 * Marca un campo como inválido:
 *   - .invalido       → borde rojo (señal visual)
 *   - aria-invalid    → señal para lectores de pantalla
 *   - texto del error → explica QUÉ corregir (nunca solo color)
 * textContent (no innerHTML): el mensaje se trata como texto, nunca como HTML.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} elementoError
 * @param {string} mensaje
 */
export function mostrarErrorCampo(input, elementoError, mensaje) {
  input.classList.add('invalido');
  input.setAttribute('aria-invalid', 'true');
  elementoError.textContent = mensaje;
}

/** Revierte mostrarErrorCampo. */
export function limpiarErrorCampo(input, elementoError) {
  input.classList.remove('invalido');
  input.removeAttribute('aria-invalid');
  elementoError.textContent = '';
}

/* ==========================================================================
   Fase 5: resultado e historial
   ========================================================================== */

const notaDefinitiva = document.getElementById('nota-definitiva');
const estadoAcademico = document.getElementById('estado-academico');
const avisoGuardado = document.getElementById('aviso-guardado');
const listaHistorial = document.getElementById('lista-historial');
const historialVacio = document.getElementById('historial-vacio');

/** Clase CSS según el estado: el color acompaña al texto, nunca lo reemplaza. */
const CLASE_ESTADO = {
  Aprobado: 'estado--aprobado',
  Reprobado: 'estado--reprobado',
};

/**
 * Formateador de fechas creado UNA vez y reutilizado (crearlo en cada
 * llamada es costoso). Muestra la hora local del estudiante.
 */
const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** toFixed(2) siempre muestra 2 decimales: 3 → "3.00" (specs §2.2). */
const conDosDecimales = (numero) => Number(numero).toFixed(2);

/**
 * Pinta el Estado C.
 * @param {{ definitiva: number, estado: string }} calculo
 * @param {{ guardado?: boolean }} opciones  false → aviso de EC-14.
 */
export function pintarResultado({ definitiva, estado }, { guardado = true } = {}) {
  notaDefinitiva.textContent = conDosDecimales(definitiva);

  estadoAcademico.textContent = estado;
  estadoAcademico.classList.remove(...Object.values(CLASE_ESTADO));
  estadoAcademico.classList.add(CLASE_ESTADO[estado]);

  avisoGuardado.hidden = guardado;
  avisoGuardado.textContent = guardado ? '' : 'No se pudo guardar en el historial.';
}

/**
 * Crea un <li> del historial SOLO con createElement + textContent.
 * Nunca innerHTML con datos guardados: si un dato tuviera "<script>", se
 * mostraría como texto y no se ejecutaría (prevención de XSS).
 */
function crearItemHistorial(calculo) {
  const item = document.createElement('li');
  item.className = 'historial__item';

  const info = document.createElement('div');
  info.className = 'historial__info';

  const nota = document.createElement('strong');
  nota.className = 'historial__nota';
  nota.textContent = conDosDecimales(calculo.definitiva);

  // <time datetime="…"> da a máquinas la fecha exacta y a personas la legible.
  const fecha = document.createElement('time');
  fecha.className = 'historial__fecha';
  fecha.dateTime = calculo.fecha;
  fecha.textContent = formatoFecha.format(new Date(calculo.fecha));

  const detalle = document.createElement('p');
  detalle.className = 'historial__detalle';
  detalle.textContent = (calculo.notas ?? [])
    .map(({ valor, porcentaje }) => `${valor} (${porcentaje}%)`)
    .join(' · ');

  info.append(nota, fecha, detalle);

  const estado = document.createElement('span');
  estado.className = `estado ${CLASE_ESTADO[calculo.estado] ?? ''}`;
  estado.textContent = calculo.estado;

  item.append(info, estado);
  return item;
}

/**
 * Reemplaza la lista completa del historial (ya viene ordenada desde db.js).
 * @param {Array<object>} calculos
 * @param {{ error?: boolean }} opciones
 */
export function pintarHistorial(calculos, { error = false } = {}) {
  const fragmento = document.createDocumentFragment();
  for (const calculo of calculos) fragmento.append(crearItemHistorial(calculo));
  listaHistorial.replaceChildren(fragmento);

  historialVacio.hidden = calculos.length > 0;
  historialVacio.textContent = error
    ? 'No se pudo cargar el historial.'
    : 'Aún no tienes cálculos guardados.';
}
