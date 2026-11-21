/**
 * calculo.js — Promedio ponderado y estado académico. Fase 5.
 *
 * Módulo 100 % PURO: no toca el DOM ni IndexedDB. Recibe notas ya validadas
 * y devuelve números y textos. Por eso es el módulo más fácil de probar:
 * los escenarios Gherkin de HU-07 se pueden ejecutar desde la consola.
 *
 * Fórmula (specs §2.3):   definitiva = Σ ( nota_i × porcentaje_i / 100 )
 */

/** RN-04: se aprueba con 3.0 o más. */
export const NOTA_APROBATORIA = 3.0;

export const ESTADOS = Object.freeze({
  aprobado: 'Aprobado',
  reprobado: 'Reprobado',
});

/** 100 % en centésimas (mismo criterio que la Fase 4). */
const CENTESIMAS_OBJETIVO = 10000;

/**
 * Redondeo a 2 decimales EXACTAMENTE como lo piden los specs.
 * Number.EPSILON compensa casos como 1.005, que en binario se guarda como
 * 1.00499999999999989… y sin la corrección redondearía hacia abajo.
 * @param {number} x
 */
export function redondear2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula la nota definitiva y la redondea SOLO al final.
 *
 * Cómo evitamos los errores de coma flotante:
 *   nota × porcentaje / 100  =  (notaC / 100) × (porcC / 100) / 100
 *                            =  notaC × porcC / 1 000 000
 * donde notaC y porcC son centésimas ENTERAS (4.5 → 450, 30 → 3000).
 * Multiplicar y sumar enteros es exacto; solo hay una división al final.
 *
 * @param {Array<{ valor: number, porcentaje: number }>} notas
 * @returns {number} Definitiva redondeada a 2 decimales.
 */
export function calcularDefinitiva(notas) {
  if (!Array.isArray(notas) || notas.length === 0) {
    throw new Error('Se necesita al menos una nota para calcular.');
  }

  let sumaPorcentajes = 0;
  let sumaPonderada = 0;

  for (const { valor, porcentaje } of notas) {
    const valorC = Math.round(valor * 100);
    const porcentajeC = Math.round(porcentaje * 100);
    sumaPorcentajes += porcentajeC;
    sumaPonderada += valorC * porcentajeC;
  }

  // Defensa en profundidad: este módulo no confía en que la UI ya validó.
  if (sumaPorcentajes !== CENTESIMAS_OBJETIVO) {
    throw new Error('Los porcentajes deben sumar exactamente 100.');
  }

  const definitivaExacta = sumaPonderada / 1_000_000;
  return redondear2(definitivaExacta);
}

/**
 * El estado se decide sobre la nota YA redondeada (la que ve el estudiante):
 * 2.996 → 3.00 → Aprobado (specs §2.3, EC-18).
 * @param {number} definitiva
 */
export function determinarEstado(definitiva) {
  return definitiva >= NOTA_APROBATORIA ? ESTADOS.aprobado : ESTADOS.reprobado;
}

/**
 * Arma el objeto que se guarda en el store `calculos` (specs §2.1).
 * `id` no se incluye: lo asigna IndexedDB (autoIncrement).
 * @param {string} documento
 * @param {Array<{ valor: number, porcentaje: number }>} notas
 * @param {Date} [fecha]  Parámetro opcional para poder probar con fechas fijas.
 */
export function construirCalculo(documento, notas, fecha = new Date()) {
  const definitiva = calcularDefinitiva(notas);
  return {
    documento,
    fecha: fecha.toISOString(),
    // Copia limpia: solo las dos propiedades del modelo, en el orden ingresado.
    notas: notas.map(({ valor, porcentaje }) => ({ valor, porcentaje })),
    definitiva,
    estado: determinarEstado(definitiva),
  };
}
