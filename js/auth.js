/**
 * auth.js — Acceso por documento de identidad. Fase 3.
 *
 * Responsabilidades:
 *   1. Reglas de negocio del documento (RN-01): solo dígitos, 5 a 15, con trim().
 *   2. Registro automático o inicio de sesión (HU-01, HU-02).
 *   3. Puntero de sesión en sessionStorage (HU-03, HU-10, EC-03).
 *
 * No toca el DOM: recibe datos y devuelve datos. Así se puede probar desde la
 * consola sin pantalla, y la UI decide cómo mostrar cada resultado.
 */

import { obtenerUsuario, crearUsuario, actualizarAcceso } from './db.js';

/** Única clave de Web Storage permitida por los specs (§2.1). */
const CLAVE_SESION = 'sesionDocumento';

/**
 * ^ y $ obligan a que TODO el texto cumpla la regla (no solo una parte).
 * \d sin la bandera `u` solo acepta 0-9 ASCII (no dígitos de otros alfabetos).
 * {5,15} = entre 5 y 15 repeticiones.
 */
const PATRON_DOCUMENTO = /^\d{5,15}$/;

export const MENSAJE_DOCUMENTO_INVALIDO =
  'Ingresa un documento válido (solo números, 5 a 15 dígitos).';

/* --------------------------------------------------------------------------
   Validación
   -------------------------------------------------------------------------- */

/**
 * Valida el texto escrito por el usuario. NUNCA lo convierte a número (EC-11).
 * @param {unknown} texto
 * @returns {{ ok: true, documento: string } | { ok: false, mensaje: string }}
 */
export function validarDocumento(texto) {
  const documento = String(texto ?? '').trim(); // EC-10: espacios en los extremos
  if (!PATRON_DOCUMENTO.test(documento)) {
    return { ok: false, mensaje: MENSAJE_DOCUMENTO_INVALIDO };
  }
  return { ok: true, documento };
}

/* --------------------------------------------------------------------------
   sessionStorage seguro
   Acceder a sessionStorage puede LANZAR excepciones (almacenamiento bloqueado
   por el usuario o por políticas del navegador). Si falla, la app sigue
   funcionando; solo se pierde la sesión al recargar.
   -------------------------------------------------------------------------- */

function leerPuntero() {
  try {
    return sessionStorage.getItem(CLAVE_SESION);
  } catch {
    return null;
  }
}

function guardarPuntero(documento) {
  try {
    sessionStorage.setItem(CLAVE_SESION, documento);
  } catch {
    /* Sin persistencia al recargar; la sesión actual sigue funcionando. */
  }
}

function borrarPuntero() {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* Nada que borrar si el almacenamiento no está disponible. */
  }
}

/* --------------------------------------------------------------------------
   Casos de uso
   -------------------------------------------------------------------------- */

/**
 * Registro automático o inicio de sesión con un solo botón.
 * @param {string} textoIngresado  Valor tal cual viene del input.
 * @returns {Promise<{ usuario: object, esNuevo: boolean }>}
 */
export async function iniciarSesion(textoIngresado) {
  // Validación defensiva: aunque la UI ya validó, esta función no confía
  // en quien la llama (podría invocarse desde la consola).
  const validacion = validarDocumento(textoIngresado);
  if (!validacion.ok) throw new Error(validacion.mensaje);
  const { documento } = validacion;

  let usuario = await obtenerUsuario(documento);
  let esNuevo = false;

  if (usuario) {
    // Ya existe: NO se crea otro registro, solo se actualiza ultimoAcceso.
    usuario = await actualizarAcceso(documento);
  } else {
    try {
      usuario = await crearUsuario(documento);
      esNuevo = true;
    } catch (error) {
      // Carrera: otra pestaña lo registró entre obtenerUsuario y crearUsuario.
      // add() falló con ConstraintError → lo tratamos como inicio de sesión.
      if (error?.name !== 'ConstraintError') throw error;
      usuario = await actualizarAcceso(documento);
    }
  }

  guardarPuntero(documento);
  return { usuario, esNuevo };
}

/**
 * Restaura la sesión al recargar la página (HU-03).
 * El puntero solo se acepta si el usuario EXISTE en IndexedDB (EC-03).
 * No actualiza ultimoAcceso: recargar no es un nuevo inicio de sesión.
 * @returns {Promise<object | null>} El usuario, o null si hay que mostrar el acceso.
 */
export async function restaurarSesion() {
  const puntero = leerPuntero();
  if (puntero === null) return null;

  // Alguien pudo editar sessionStorage desde DevTools: se valida igual.
  const validacion = validarDocumento(puntero);
  if (!validacion.ok) {
    borrarPuntero();
    return null;
  }

  const usuario = await obtenerUsuario(validacion.documento);
  if (!usuario) {
    borrarPuntero(); // EC-03: puntero huérfano
    return null;
  }
  return usuario;
}

/** HU-10: elimina el puntero. Los datos en IndexedDB NO se borran. */
export function cerrarSesion() {
  borrarPuntero();
}
